import {buildOpportunityRanking} from './opportunity-scoring.js';
import {buildExitSignalRanking} from './strategy-decision-engine.js';
import {sendTelegramMany} from './telegram.js';

const HOUR_MS=60*60*1000;
const keys={buy:'system_monitor_buy_signals',exit:'system_monitor_exit_signals',market:'system_monitor_market_rules',buyState:'system_monitor_buy_state',exitState:'system_monitor_exit_state',buyLast:'system_monitor_buy_last_run',exitLast:'system_monitor_exit_last_run'};
const fa=value=>Number(value).toLocaleString('fa-IR',{maximumFractionDigits:2});
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const enabledValue=(value,fallback)=>value==null?fallback:['1','true','on','yes'].includes(String(value).toLowerCase());
const parseState=value=>{try{const parsed=JSON.parse(value||'{}');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{return{};}};

export function systemMonitorSettings(db,userId){
  return {
    buySignals:enabledValue(db.getUserSetting(userId,keys.buy),false),
    exitSignals:enabledValue(db.getUserSetting(userId,keys.exit),false),
    marketRules:enabledValue(db.getUserSetting(userId,keys.market),true),
    intervalMinutes:60,
    buyLastRunAt:db.getUserSetting(userId,keys.buyLast)||null,
    exitLastRunAt:db.getUserSetting(userId,keys.exitLast)||null
  };
}

export function saveSystemMonitorSettings(db,userId,input={}){
  const before=systemMonitorSettings(db,userId),next={buySignals:input.buySignals===undefined?before.buySignals:Boolean(input.buySignals),exitSignals:input.exitSignals===undefined?before.exitSignals:Boolean(input.exitSignals),marketRules:input.marketRules===undefined?before.marketRules:Boolean(input.marketRules)};
  db.setUserSetting(userId,keys.buy,next.buySignals?'true':'false');
  db.setUserSetting(userId,keys.exit,next.exitSignals?'true':'false');
  db.setUserSetting(userId,keys.market,next.marketRules?'true':'false');
  if(!before.buySignals&&next.buySignals){db.setUserSetting(userId,keys.buyState,'{}');db.setUserSetting(userId,keys.buyLast,'');}
  if(!before.exitSignals&&next.exitSignals){db.setUserSetting(userId,keys.exitState,'{}');db.setUserSetting(userId,keys.exitLast,'');}
  return systemMonitorSettings(db,userId);
}

function buyStateLabel(state){return ({BUY_NOW:'خرید تأییدشده',EARLY_ENTRY:'ورود زودهنگام',PULLBACK_ENTRY:'ورود روی پولبک',BREAKOUT_ENTRY:'ورود روی شکست',SECOND_ENTRY:'پله دوم',SECOND_ENTRY_CANDIDATE:'پله دوم'})[state]||state;}
function actionLabel(action){return action==='BUY_PARTIAL'?'خرید پله‌ای':action==='BUY'?'خرید':'بررسی خرید';}
function buyMessage(item){
  const low=item.pullbackBuyLow??item.suggestedBuyLow,high=item.pullbackBuyHigh??item.suggestedBuyHigh,max=item.entryType==='BREAKOUT_ENTRY'?item.breakoutMaxPrice:(item.pullbackMaxBuyPrice??item.maxBuyPrice);
  return ['🟢 '+item.symbol+' — '+buyStateLabel(item.state),`اقدام: ${actionLabel(item.suggestedAction)}${item.positionSizePct?` · ${fa(item.positionSizePct)}٪ حجم برنامه‌ریزی‌شده`:''}`,item.currentPrice?`قیمت فعلی: ${fa(item.currentPrice)} ریال`:null,finite(low)&&finite(high)?`بازه پیشنهادی خرید: ${fa(low)} تا ${fa(high)} ریال`:null,finite(max)?`حداکثر قیمت مجاز: ${fa(max)} ریال`:null,finite(item.stopPrice)?`حد زیان: ${fa(item.stopPrice)} ریال`:null,finite(item.target1)?`هدف اول: ${fa(item.target1)} ریال`:null,finite(item.rewardRisk)?`نسبت بازده به ریسک: ${fa(item.rewardRisk)}`:null,item.shortReason?`دلیل: ${item.shortReason}`:null].filter(Boolean).join('\n');
}

function exitMessage(item){
  const full=['SELL_ALL','STRUCTURAL_SELL_ALL'].includes(item.finalDecision),label=full?'فروش کامل':item.finalDecision==='TAKE_PROFIT'?'سیو سود پله‌ای':'کاهش موقعیت';
  return [`${full?'⛔':'🔴'} ${item.symbol} — ${label}`,`اقدام: ${label}`,item.suggestedQuantity?`تعداد پیشنهادی: ${fa(item.suggestedQuantity)} سهم`:null,item.currentPrice?`قیمت فعلی: ${fa(item.currentPrice)} ریال`:null,finite(item.currentStop)?`حد توقف: ${fa(item.currentStop)} ریال`:null,finite(item.profitPct)?`بازده موقعیت: ${fa(item.profitPct)}٪`:null,item.shortReason?`دلیل: ${item.shortReason}`:null].filter(Boolean).join('\n');
}

async function notifyTransitions({items,previous,targets,keyFor,messageFor}){
  const active=Object.fromEntries(items.map(item=>[keyFor(item),item.state||item.finalDecision])),next={};let sent=0;
  for(const item of items){const key=keyFor(item),state=active[key];if(previous[key]===state){next[key]=state;continue;}try{const delivery=await sendTelegramMany(targets,messageFor(item));if(!delivery.skipped){next[key]=state;sent++;}}catch(error){console.error(`system signal ${key}: ${error.message||error}`);}}
  return {state:next,sent};
}

export class SystemSignalMonitor{
  constructor(db,marketData,runtime){this.db=db;this.marketData=marketData;this.runtime=runtime;this.running=false;this.lastRunAt=null;this.lastError=null;}
  async runIfDue({rows=null,force=false}={}){
    if(this.running)return {skipped:true,reason:'running'};
    const now=Date.now(),users=this.db.listUsers().filter(user=>user.active).map(user=>({user,settings:systemMonitorSettings(this.db,user.id)})),due=users.filter(({settings})=>(settings.buySignals&&(force||!settings.buyLastRunAt||now-Date.parse(settings.buyLastRunAt)>=HOUR_MS))||(settings.exitSignals&&(force||!settings.exitLastRunAt||now-Date.parse(settings.exitLastRunAt)>=HOUR_MS)));
    if(!due.length)return {skipped:true,reason:'not_due'};
    this.running=true;
    try{
      const marketRows=rows||await this.marketData.marketRows(),results=[];
      for(const {user,settings} of due){const targets=this.runtime.telegramTargets(user.id),result={userId:user.id,buySent:0,exitSent:0};
        if(settings.buySignals&&(force||!settings.buyLastRunAt||now-Date.parse(settings.buyLastRunAt)>=HOUR_MS)){const ranking=buildOpportunityRanking(this.db,marketRows,{userId:user.id,limit:100}),items=ranking.items.filter(item=>['BUY','BUY_PARTIAL'].includes(item.suggestedAction)&&['BUY_NOW','EARLY_ENTRY','PULLBACK_ENTRY','BREAKOUT_ENTRY','SECOND_ENTRY','SECOND_ENTRY_CANDIDATE'].includes(item.state)),transition=await notifyTransitions({items,previous:parseState(this.db.getUserSetting(user.id,keys.buyState)),targets,keyFor:item=>item.symbol,messageFor:buyMessage});this.db.setUserSetting(user.id,keys.buyState,JSON.stringify(transition.state));this.db.setUserSetting(user.id,keys.buyLast,new Date().toISOString());result.buySent=transition.sent;}
        if(settings.exitSignals&&(force||!settings.exitLastRunAt||now-Date.parse(settings.exitLastRunAt)>=HOUR_MS)){const ranking=buildExitSignalRanking(this.db,marketRows,user.id),transition=await notifyTransitions({items:ranking.items,previous:parseState(this.db.getUserSetting(user.id,keys.exitState)),targets,keyFor:item=>item.symbol,messageFor:exitMessage});this.db.setUserSetting(user.id,keys.exitState,JSON.stringify(transition.state));this.db.setUserSetting(user.id,keys.exitLast,new Date().toISOString());result.exitSent=transition.sent;}
        results.push(result);
      }
      this.lastRunAt=new Date().toISOString();this.lastError=null;return {skipped:false,users:results.length,results};
    }catch(error){this.lastError=error.message;throw error;}finally{this.running=false;}
  }
}

export const systemMonitorSettingKeys=keys;
