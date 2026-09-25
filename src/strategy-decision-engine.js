import {buildIndicatorAnalysis} from './indicator-engine.js';
import {evaluateCondition,evaluateRuleExpression} from './rule-engine-v2.js';
import {sendTelegramMany} from './telegram.js';

export const LEGACY_STRATEGY_KEY='reversal_watch_v1';

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const tehranDay=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(date);
const leaf=(name,params={})=>({type:'condition',name,params});
const statePriority={SECONDARY_WATCH:1,RULE_WATCH:2,TRIGGERED_WAIT_CONFIRMATION:3,BUY_CANDIDATE:4,BUY_NOW:5,REDUCE_POSITION:6,TAKE_PROFIT:7,STRUCTURAL_SELL_ALL:8,SELL_ALL:9};
const families={MACD_NEGATIVE_SHRINKING:'MACD_RECOVERY',MACD_RECOVERY_EARLY:'MACD_RECOVERY',VOLUME_RATIO_ABOVE:'VOLUME',BUYER_POWER_ABOVE:'BUYER_POWER'};
const family=name=>families[name]||name;

function leaves(expression,out=[]){if(expression?.type==='condition')out.push(expression);else for(const child of expression?.children||[])leaves(child,out);return out;}
function evidence(condition,context,source){const evaluation=evaluateCondition(condition,context);return {name:condition.name,family:family(condition.name),source,state:evaluation.state,description:evaluation.description,params:condition.params||{}};}
function uniqueActive(items){const seen=new Set();return items.filter(item=>item.state==='active'&&!seen.has(item.family)&&seen.add(item.family));}
function conditionSummary(item){return {name:item.name,source:item.source,state:item.state,description:item.description};}

function technicalAndFlow(config,context){
  const triggerItems=leaves(config.trigger).map(item=>evidence(item,context,'TRIGGER'));
  const momentumCandidates=[leaf('EMA20_NON_DECREASING'),leaf('MACD_BULLISH_CROSS'),leaf('MACD_RECOVERY_EARLY'),leaf('OBV_TURN_UP')];
  const flowCandidates=[leaf('VOLUME_RATIO_ABOVE',{value:1.2}),leaf('BUYER_POWER_ABOVE',{value:1.2}),leaf('REAL_MONEY_FLOW_POSITIVE')];
  const triggerMomentum=triggerItems.filter(item=>['EMA20_NON_DECREASING','MACD_BULLISH_CROSS','MACD_RECOVERY','OBV_TURN_UP'].includes(item.family));
  const triggerFlow=triggerItems.filter(item=>item.family==='REAL_MONEY_FLOW_POSITIVE'||(item.family==='VOLUME'&&Number(item.params.value)>=1.2)||(item.family==='BUYER_POWER'&&Number(item.params.value)>=1.2));
  const momentumFamilies=new Set(triggerMomentum.map(item=>item.family)),flowFamilies=new Set(triggerFlow.map(item=>item.family));
  const momentum=uniqueActive([...triggerMomentum,...momentumCandidates.filter(item=>!momentumFamilies.has(family(item.name))).map(item=>evidence(item,context,'CONFIRMATION'))]);
  const flow=uniqueActive([...triggerFlow,...flowCandidates.filter(item=>!flowFamilies.has(family(item.name))).map(item=>evidence(item,context,'CONFIRMATION'))]);
  return {triggerItems,momentum,flow};
}

function buyDecision(config,context,storedState=null,account=null){
  const initial=config.tier==='SECONDARY'?'SECONDARY_WATCH':'RULE_WATCH',currentState=storedState?.state||initial,trigger=evaluateRuleExpression(config.trigger,context),sets=technicalAndFlow(config,context);
  const close=evaluateCondition(leaf('CLOSE_ABOVE_EMA20'),context),return5=evaluateCondition(leaf('RETURN_BELOW',{periods:5,value:10}),context),return20=evaluateCondition(leaf('RETURN_BELOW',{periods:20,value:25}),context);
  const cap=config.noChaseMax?(finite(context.current?.price)?{state:Number(context.current.price)<=config.noChaseMax?'active':'inactive',description:`قیمت ${Number(context.current.price)} / سقف No-Chase ${config.noChaseMax}`}:{state:'insufficient',description:'قیمت برای No-Chase موجود نیست.'}):{state:'active',description:'سقف اختصاصی No-Chase ندارد.'};
  const risk=config.stop?evaluateCondition(leaf('RISK_TO_STOP_BELOW',{value:8,stop:config.stop}),context):{state:'not_required',description:'Stop برای Candidate تعریف نشده است.'};
  const reward=config.stop&&config.target1?evaluateCondition(leaf('REWARD_RISK_ABOVE',{value:1.5,stop:config.stop,target:config.target1}),context):{state:'not_required',description:'Stop/Target1 کامل نیست.'};
  const noChasePass=[return5,return20,cap].every(x=>x.state==='active'),riskPass=!config.stop||risk.state==='active',rewardPass=!(config.stop&&config.target1)||reward.state==='active';
  const finalPass=trigger.state==='active'&&close.state==='active'&&sets.momentum.length>=2&&sets.flow.length>=1&&noChasePass&&riskPass&&rewardPass;
  let finalState=currentState,reason=trigger.state==='insufficient'?'داده کافی برای ارزیابی Trigger موجود نیست.':'Trigger برقرار نیست.';
  if(config.tier==='SECONDARY'&&currentState==='SECONDARY_WATCH'&&trigger.state==='active'){finalState='RULE_WATCH';reason='Trigger اولیه برقرار شد؛ بررسی خرید از Snapshot بعدی آغاز می‌شود.';}
  else if(trigger.state==='active'&&!finalPass){finalState='TRIGGERED_WAIT_CONFIRMATION';reason='Trigger برقرار است، اما Confirmation نهایی کامل نیست.';}
  else if(finalPass){const cashFresh=account?.updatedAt&&Date.now()-Date.parse(account.updatedAt)<=24*3600_000,cashReady=cashFresh&&Number(account.availableToman)>=Number(config.allocatedToman||Infinity)+2_000_000,executable=Boolean(config.quantity>0&&config.limitPrice>0&&config.allocatedToman>0&&config.stop>0&&config.target1>0&&cashReady);finalState=executable?'BUY_NOW':'BUY_CANDIDATE';reason=executable?'همه شروط، اطلاعات سفارش و قدرت خرید تازه کامل است.':'Confirmation کامل است، اما اطلاعات سفارش یا قدرت خرید تازه کامل نیست.';}
  else if(trigger.state!=='active'&&currentState!=='SECONDARY_WATCH'){finalState='RULE_WATCH';}
  return {symbol:config.symbol,tier:config.tier,currentState,trigger:trigger.state,momentumMatches:sets.momentum.length,momentumEvidence:sets.momentum.map(conditionSummary),flowMatches:sets.flow.length,flowEvidence:sets.flow.map(conditionSummary),noChase5D:return5.state,noChase5DValue:context.current?.return_5d??null,noChase20D:return20.state,noChase20DValue:context.current?.return_20d??null,noChaseCap:cap.state,stop:config.stop??null,target1:config.target1??null,riskPct:config.stop&&finite(context.current?.price)&&context.current.price>config.stop?(context.current.price-config.stop)/context.current.price*100:null,riskState:risk.state,rewardRisk:config.stop&&config.target1&&finite(context.current?.price)&&context.current.price>config.stop?(config.target1-context.current.price)/(context.current.price-config.stop):null,rewardRiskState:reward.state,closeAboveEma20:close.state,finalState,reason,triggerEvidence:sets.triggerItems.map(conditionSummary),order:{quantity:config.quantity??null,limitPrice:config.limitPrice??null,allocatedToman:config.allocatedToman??null},cash:{availableToman:account?.availableToman??null,updatedAt:account?.updatedAt??null}};
}

function currentStop(position,current){
  const price=Number(current.price),avg=Number(position.avg_price),high=Math.max(Number(position.highest_price_since_entry||0),Number(current.high||0),price,avg),profit=(price/avg-1)*100,initial=Number(position.initial_stop_price)>0?Number(position.initial_stop_price):avg*.92;
  let calculated=initial,status='INITIAL_STOP';
  if(profit>=30){calculated=Math.max(initial,avg,high*.95);status='TRAILING_5';}
  else if(profit>=20){calculated=Math.max(initial,avg,high*.93);status='TRAILING_7';}
  else if(profit>=10){calculated=Math.max(initial,avg);status='BREAKEVEN';}
  return {price,avg,high,profit,initial,current:Math.max(Number(position.stop_price||0),calculated),status};
}

function exitDecision(position,context){
  const stop=currentStop(position,context.current||{}),weaknessConditions=[leaf('MACD_BEARISH_CROSS'),leaf('OBV_TURN_DOWN'),leaf('CLOSE_BELOW_EMA20'),leaf('BUYER_POWER_BELOW',{value:.8}),leaf('REAL_MONEY_FLOW_NEGATIVE')],weakness=weaknessConditions.map(item=>evidence(item,context,'EXIT_CONFIRMATION')),weaknessMatches=weakness.filter(x=>x.state==='active').length;
  const hardStop=stop.profit<=-8,positionStopHit=stop.price<=stop.current;
  let finalDecision='HOLD',exitRule='NONE';
  if(hardStop||positionStopHit){finalDecision='SELL_ALL';exitRule=hardStop?'HARD_STOP':'POSITION_STOP_HIT';}
  else if(stop.profit>=25&&weaknessMatches>=2){finalDecision='TAKE_PROFIT';exitRule='TAKE_PROFIT_25';}
  else if(stop.profit>=15&&weaknessMatches>=2){finalDecision='TAKE_PROFIT';exitRule='TAKE_PROFIT_15';}
  else if(weaknessMatches>=2){finalDecision='REDUCE_POSITION';exitRule='TECHNICAL_WEAKNESS';}
  return {symbol:position.symbol,avgEntry:stop.avg,currentPrice:stop.price,profitPct:stop.profit,highestSinceEntry:stop.high,initialStop:stop.initial,currentStop:stop.current,trailingStopStatus:stop.status,weaknessMatchCount:weaknessMatches,weaknessEvidence:weakness.map(conditionSummary),majorSupport:null,exitRule,finalDecision};
}

function cachedContext(db,symbol,row,market={}){const candles=db.candles(symbol,160),analysis=buildIndicatorAnalysis(candles,row||null),history=db.symbolTickHistory(symbol,50),position=db.portfolioPosition(symbol),current=analysis.context||{price:row?.lastPrice,close:row?.closePrice};if(position&&position.avg_price>0&&finite(current.price))position.profit_pct=(Number(current.price)/Number(position.avg_price)-1)*100;return {current,previous:history.at(-1)||{},liveHistory:history,portfolio:position,market,marketRow:row||{},analysis};}

function decisionMessage(report){return [`🚨 ${report.symbol} — ${report.finalState||report.finalDecision}`,report.reason||`Rule: ${report.exitRule}`,report.trigger?`Trigger: ${report.trigger}`:null,report.momentumMatches!==undefined?`Momentum: ${report.momentumMatches}`:null,report.flowMatches!==undefined?`Flow: ${report.flowMatches}`:null,report.currentPrice?`قیمت: ${Math.round(report.currentPrice).toLocaleString('fa-IR')} ریال`:null,'این پیام سفارش خودکار نیست.'].filter(Boolean).join('\n');}

export class StrategyDecisionEngine{
  constructor(config,db,marketData,runtime){this.config=config;this.db=db;this.marketData=marketData;this.runtime=runtime;this.lastRunAt=null;this.lastError=null;}
  async run({dryRun=false,offline=false,snapshot=null}={}){
    const strategyRules=this.db.listRulesV2().filter(rule=>rule.enabled&&rule.status==='active'&&rule.actionParams?.strategy===LEGACY_STRATEGY_KEY&&rule.actionParams?.role==='TRIGGER');
    const configs=strategyRules.map(rule=>({symbol:rule.symbol,tier:rule.actionParams.tier||'RULE_WATCH',trigger:rule.expression,stop:rule.actionParams.stop??null,target1:rule.actionParams.target1??null,noChaseMax:rule.actionParams.noChaseMax??null,quantity:rule.actionParams.quantity??null,limitPrice:rule.actionParams.limitPrice??rule.actionParams.proposedPrice??null,allocatedToman:rule.actionParams.allocatedToman??null,ruleId:rule.ruleId,buyEnabled:rule.actionParams.buyEnabled!==false}));
    const positions=this.db.portfolioPositions();
    if(!configs.length&&!positions.length){this.lastRunAt=new Date().toISOString();this.lastError=null;return {strategy:LEGACY_STRATEGY_KEY,dryRun,offline,apiCalls:0,watchlist:[],portfolio:[]};}
    const usageBefore=this.db.apiUsage(),rows=snapshot?.rows||(offline?this.db.allSymbolDetails():await this.marketData.marketRows()),market=snapshot?.market||{},bySymbol=new Map(rows.map(row=>[row.symbol,row])),contexts=snapshot?.contexts||new Map(),watchlist=[],initialStates=new Map(this.db.strategyStates(LEGACY_STRATEGY_KEY).map(row=>[row.symbol,row]));
    const account=this.db.getDataState('account:cash');
    for(const config of configs){const context=contexts.get(config.symbol)||cachedContext(this.db,config.symbol,bySymbol.get(config.symbol),market),stored=initialStates.get(config.symbol)||null,report=buyDecision(config,context,stored,account);if(snapshot?.riskOff&&report.finalState==='BUY_NOW'){report.finalState='BUY_CANDIDATE';report.reason+=' MARKET_RISK_OFF: یک سطح کاهش یافت.';}else if(snapshot?.riskOff&&report.finalState==='BUY_CANDIDATE'){report.finalState='TRIGGERED_WAIT_CONFIRMATION';report.reason+=' MARKET_RISK_OFF: یک سطح کاهش یافت.';}watchlist.push(report);if(!dryRun){const oldDecision=stored?.last_decision,changed=Boolean(stored)&&oldDecision!==report.finalState,actionable=['BUY_NOW','BUY_CANDIDATE'].includes(report.finalState),cooldown=45*60000,cooldownOk=!stored?.last_notified_at||Date.now()-Date.parse(stored.last_notified_at)>=cooldown;let notified=false;if(changed&&actionable&&cooldownOk){const sent=await sendTelegramMany(this.runtime.telegramTargets(),decisionMessage(report));notified=!sent.skipped;}this.db.saveStrategyState(LEGACY_STRATEGY_KEY,config.symbol,{state:report.finalState,buyEnabled:config.buyEnabled,triggerRuleId:config.ruleId,lastDecision:report.finalState,reason:report,triggeredAt:report.trigger==='active'?(stored?.triggered_at||new Date().toISOString()):stored?.triggered_at,confirmedAt:['BUY_NOW','BUY_CANDIDATE'].includes(report.finalState)?new Date().toISOString():stored?.confirmed_at,lastNotifiedAt:notified?new Date().toISOString():stored?.last_notified_at,lastNotifiedDay:notified?tehranDay():stored?.last_notified_day});}}
    const portfolio=[];
    for(const position of positions){const context=contexts.get(position.symbol)||cachedContext(this.db,position.symbol,bySymbol.get(position.symbol),market),report=exitDecision(position,context);portfolio.push(report);if(!dryRun){this.db.updatePortfolioRisk(position.symbol,{highestPrice:report.highestSinceEntry,currentStop:report.currentStop,initialStop:report.initialStop});const stored=initialStates.get(position.symbol)||null,changed=Boolean(stored)&&stored.last_decision!==report.finalDecision,actionable=['SELL_ALL','STRUCTURAL_SELL_ALL','TAKE_PROFIT','REDUCE_POSITION'].includes(report.finalDecision),cooldown=15*60000,cooldownOk=!stored?.last_notified_at||Date.now()-Date.parse(stored.last_notified_at)>=cooldown;let notified=false;if(changed&&actionable&&cooldownOk){const sent=await sendTelegramMany(this.runtime.telegramTargets(),decisionMessage(report));notified=!sent.skipped;}const buyReport=watchlist.find(x=>x.symbol===position.symbol),winning=!buyReport||statePriority[report.finalDecision]>statePriority[buyReport.finalState]?report.finalDecision:buyReport.finalState;this.db.saveStrategyState(LEGACY_STRATEGY_KEY,position.symbol,{state:winning,buyEnabled:true,lastDecision:winning,reason:report,lastNotifiedAt:notified?new Date().toISOString():stored?.last_notified_at,lastNotifiedDay:notified?tehranDay():stored?.last_notified_day});}}
    const usageAfter=this.db.apiUsage(),key=row=>`${row.endpoint}|${row.window_type}|${row.window_key}`,before=new Map(usageBefore.map(row=>[key(row),row.request_count])),apiCalls=usageAfter.reduce((sum,row)=>sum+Math.max(0,Number(row.request_count)-Number(before.get(key(row))||0)),0);this.lastRunAt=new Date().toISOString();this.lastError=null;return {strategy:LEGACY_STRATEGY_KEY,dryRun,offline,apiCalls,watchlist,portfolio};
  }
}

export {buyDecision,exitDecision,currentStop};
