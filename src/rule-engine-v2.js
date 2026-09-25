import {sendTelegramMany} from './telegram.js';

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const fa=value=>finite(value)?Number(value).toLocaleString('fa-IR',{maximumFractionDigits:2}):'داده ناکافی';
const get=(context,key)=>key.split('.').reduce((value,part)=>value?.[part],context);
const result=(active,description,values={})=>({state:active?'active':'inactive',description,values});
const insufficient=description=>({state:'insufficient',description,values:{}});
const compare=(current,previous,operator,value)=>operator==='above'?current>value:operator==='below'?current<value:operator==='cross_above'?current>value&&previous<=value:current<value&&previous>=value;

export const conditionCatalogV2=[
  'PRICE_ABOVE','PRICE_BELOW','PRICE_CROSS_ABOVE','PRICE_CROSS_BELOW','PRICE_IN_RANGE','PRICE_HOLD_ABOVE','EMA_RECLAIM_20','EMA_RECLAIM_50','EMA20_ABOVE_EMA50','EMA20_50_GAP_BELOW',
  'RSI_ABOVE','RSI_BELOW','RSI_CROSS_ABOVE','RSI_CROSS_BELOW','MFI_ABOVE','MFI_BELOW','MFI_CROSS_ABOVE','MFI_CROSS_BELOW','VOLUME_RATIO_ABOVE','BUYER_POWER_ABOVE',
  'OBV_TURN_UP','OBV_TURN_DOWN','OBV_BREAK_HIGH','BBW_BELOW','ATR_EXPANDING','PROFIT_ABOVE','LOSS_BELOW','TRAILING_STOP','MACD_RECOVERY_EARLY','MACD_RECOVERY_NEAR_ZERO',
  'MACD_BULLISH_CROSS','MACD_BEARISH_CROSS','MACD_NEGATIVE_SHRINKING','BREAKOUT_CONFIRMED','BREAKDOWN_CONFIRMED','SUPPORT_HOLD','SUPPORT_BREAK','RESISTANCE_BREAK',
  'MARKET_BREADTH_STRONG','MARKET_BREADTH_WEAK','MARKET_BUYER_POWER_STRONG','MARKET_BUYER_POWER_WEAK','MARKET_VOLUME_HIGH','MARKET_RISK_ON','MARKET_RISK_OFF'
];

export function normalizeRuleExpressionV2(expression){
  if(!expression||typeof expression!=='object')return expression;
  if(expression.type==='condition')return {type:'condition',name:expression.name,params:expression.params||{}};
  if(expression.type==='group')return {type:'group',logic:expression.logic||expression.op||'AND',children:(expression.children||expression.conditions||[]).map(normalizeRuleExpressionV2)};
  if(conditionCatalogV2.includes(expression.type)){
    const {type,...params}=expression;
    if(params.level===undefined&&params.value!==undefined&&['BREAKOUT_CONFIRMED','BREAKDOWN_CONFIRMED','SUPPORT_HOLD','SUPPORT_BREAK','RESISTANCE_BREAK'].includes(type))params.level=params.value;
    return {type:'condition',name:type,params};
  }
  if(Array.isArray(expression.conditions))return {type:'group',logic:expression.logic||expression.condition_logic||expression.op||'AND',children:expression.conditions.map(normalizeRuleExpressionV2)};
  return expression;
}

export function validateRuleExpressionV2(expression,depth=0){if(depth>8)throw new Error('عمق Rule بیشتر از حد مجاز است.');if(!expression||typeof expression!=='object')throw new Error('ساختار Rule معتبر نیست.');if(expression.type==='condition'){if(!conditionCatalogV2.includes(expression.name))throw new Error(`Condition ناشناخته است: ${expression.name}`);if(expression.params!==undefined&&(expression.params===null||typeof expression.params!=='object'||Array.isArray(expression.params)))throw new Error('پارامترهای Condition معتبر نیست.');return expression;}if(expression.type!=='group'||!['AND','OR'].includes(expression.logic||expression.op)||!Array.isArray(expression.children)||expression.children.length<1||expression.children.length>40)throw new Error('گروه Rule معتبر نیست.');expression.children.forEach(x=>validateRuleExpressionV2(x,depth+1));return expression;}

export function evaluateCondition(condition,context){
  const p=condition.params||{},c=context.current||{},prev=context.previous||{},history=context.liveHistory||[],portfolio=context.portfolio||{},market=context.market||{};
  const numeric=(name,value)=>finite(value)?null:insufficient(`${name}: داده کافی موجود نیست.`);
  let missing;
  switch(condition.name){
    case 'PRICE_ABOVE':if((missing=numeric('قیمت',c.price)))return missing;return result(c.price>p.value,`قیمت ${fa(c.price)} بالاتر از ${fa(p.value)}`);
    case 'PRICE_BELOW':if((missing=numeric('قیمت',c.price)))return missing;return result(c.price<p.value,`قیمت ${fa(c.price)} پایین‌تر از ${fa(p.value)}`);
    case 'PRICE_CROSS_ABOVE':case 'PRICE_CROSS_BELOW':{if((missing=numeric('قیمت قبلی',prev.price))|| (missing=numeric('قیمت',c.price)))return missing;const above=condition.name.endsWith('ABOVE');return result(compare(c.price,prev.price,above?'cross_above':'cross_below',p.value),`قیمت ${fa(prev.price)} ← ${fa(c.price)}؛ سطح ${fa(p.value)}`);}
    case 'PRICE_IN_RANGE':if((missing=numeric('قیمت',c.price)))return missing;return result(c.price>=p.min&&c.price<=p.max,`قیمت ${fa(c.price)} در محدوده ${fa(p.min)}–${fa(p.max)}`);
    case 'PRICE_HOLD_ABOVE':{const periods=Math.max(2,Number(p.periods||3)),values=[...history.map(x=>x.price),c.price].filter(finite).slice(-periods);if(values.length<periods)return insufficient(`تثبیت قیمت: ${values.length}/${periods} نمونه`);return result(values.every(x=>x>p.value),`${values.length} نمونه بالای ${fa(p.value)}`);}
    case 'EMA_RECLAIM_20':case 'EMA_RECLAIM_50':{const key=condition.name.endsWith('20')?'ema20':'ema50';if(![c.price,c[key],prev.price,prev[key]].every(finite))return insufficient(`${key}: داده کافی موجود نیست.`);return result(c.price>c[key]&&prev.price<=prev[key],`بازپس‌گیری ${key}: قیمت ${fa(c.price)} / ${fa(c[key])}`);}
    case 'EMA20_ABOVE_EMA50':if(![c.ema20,c.ema50].every(finite))return insufficient('EMA20/EMA50: داده کافی موجود نیست.');return result(c.ema20>c.ema50,`EMA20 ${fa(c.ema20)} / EMA50 ${fa(c.ema50)}`);
    case 'EMA20_50_GAP_BELOW':if((missing=numeric('فاصله EMA',c.ema20_ema50_gap_pct)))return missing;return result(c.ema20_ema50_gap_pct<p.value,`فاصله EMA20/50: ${fa(c.ema20_ema50_gap_pct)}٪`);
    case 'RSI_ABOVE':case 'RSI_BELOW':case 'RSI_CROSS_ABOVE':case 'RSI_CROSS_BELOW':return evaluateThreshold(condition,c,prev,'rsi14','RSI',p.value);
    case 'MFI_ABOVE':case 'MFI_BELOW':case 'MFI_CROSS_ABOVE':case 'MFI_CROSS_BELOW':return evaluateThreshold(condition,c,prev,'mfi14','MFI',p.value);
    case 'VOLUME_RATIO_ABOVE':if((missing=numeric('نسبت حجم',c.volume_ratio_20)))return missing;return result(c.volume_ratio_20>=p.value,`حجم/میانگین۲۰: ${fa(c.volume_ratio_20)}`);
    case 'BUYER_POWER_ABOVE':if((missing=numeric('قدرت خریدار',c.buyer_power)))return missing;return result(c.buyer_power>=p.value,`قدرت خریدار: ${fa(c.buyer_power)}`);
    case 'OBV_TURN_UP':if(![c.obv,c.obv_prev1,c.obv_prev2].every(finite))return insufficient('OBV: داده کافی موجود نیست.');return result(c.obv>c.obv_prev1&&c.obv_prev1<=c.obv_prev2,`OBV: ${fa(c.obv_prev2)} ← ${fa(c.obv_prev1)} ← ${fa(c.obv)}`);
    case 'OBV_TURN_DOWN':if(![c.obv,c.obv_prev1,c.obv_prev2].every(finite))return insufficient('OBV: داده کافی موجود نیست.');return result(c.obv<c.obv_prev1&&c.obv_prev1>=c.obv_prev2,`OBV: ${fa(c.obv_prev2)} ← ${fa(c.obv_prev1)} ← ${fa(c.obv)}`);
    case 'OBV_BREAK_HIGH':{const high=c[`obv_high_${Number(p.periods||10)}`];if(![c.obv,high].every(finite))return insufficient('سقف OBV: داده کافی موجود نیست.');return result(c.obv>high,`OBV ${fa(c.obv)}؛ سقف ${p.periods||10} کندل ${fa(high)}`);}
    case 'BBW_BELOW':if((missing=numeric('BBW',c.bbw)))return missing;return result(c.bbw<p.value,`BBW: ${fa(c.bbw)}`);
    case 'ATR_EXPANDING':if(![c.atr14,c.atr14_sma5].every(finite))return insufficient('ATR: داده کافی موجود نیست.');return result(c.atr14>c.atr14_sma5,`ATR14 ${fa(c.atr14)} / میانگین۵ ${fa(c.atr14_sma5)}`);
    case 'PROFIT_ABOVE':if((missing=numeric('سود سبد',portfolio.profit_pct)))return missing;return result(portfolio.profit_pct>=p.value,`سود موقعیت: ${fa(portfolio.profit_pct)}٪`);
    case 'LOSS_BELOW':if((missing=numeric('بازده سبد',portfolio.profit_pct)))return missing;return result(portfolio.profit_pct<=-Math.abs(p.value),`زیان موقعیت: ${fa(portfolio.profit_pct)}٪`);
    case 'TRAILING_STOP':if(![portfolio.highest_price_since_entry,c.price].every(finite))return insufficient('Trailing Stop: موقعیت یا سقف پس از ورود موجود نیست.');{const stop=portfolio.highest_price_since_entry*(1-p.value/100);return result(c.price<=stop,`قیمت ${fa(c.price)}؛ حد متحرک ${fa(stop)} از سقف ${fa(portfolio.highest_price_since_entry)}`);}
    case 'MACD_RECOVERY_EARLY':case 'MACD_NEGATIVE_SHRINKING':return macdEarly(c);
    case 'MACD_RECOVERY_NEAR_ZERO':{const early=macdEarly(c);if(early.state!=='active')return early;const reference=Math.max(Math.abs(c.macd_signal||0),Math.abs(c.price||0)*Number(p.minimum_reference_pct||.0001));return result(Math.abs(c.macd_hist)<=Number(p.ratio||.15)*reference,`MACD Hist ${fa(c.macd_hist)} نزدیک صفر`);}
    case 'MACD_BULLISH_CROSS':case 'MACD_BEARISH_CROSS':{if(![c.macd_line,c.macd_signal,prev.macd_line,prev.macd_signal].every(finite))return insufficient('MACD: داده کافی موجود نیست.');const bull=condition.name.includes('BULLISH');return result(bull?c.macd_line>c.macd_signal&&prev.macd_line<=prev.macd_signal:c.macd_line<c.macd_signal&&prev.macd_line>=prev.macd_signal,`MACD ${fa(c.macd_line)} / Signal ${fa(c.macd_signal)}`);}
    case 'BREAKOUT_CONFIRMED':return all([evaluateCondition({name:'PRICE_CROSS_ABOVE',params:{value:p.level}},context),evaluateCondition({name:'VOLUME_RATIO_ABOVE',params:{value:p.volume_ratio??1.5}},context),evaluateCondition({name:'BUYER_POWER_ABOVE',params:{value:p.buyer_power??1.2}},context)]);
    case 'BREAKDOWN_CONFIRMED':return all([evaluateCondition({name:'PRICE_CROSS_BELOW',params:{value:p.level}},context),evaluateCondition({name:'VOLUME_RATIO_ABOVE',params:{value:p.volume_ratio??1.5}},context)]);
    case 'SUPPORT_HOLD':{if(![c.low,c.close].every(finite))return insufficient('حمایت: داده کافی موجود نیست.');const tolerance=Number(p.tolerance_pct||1)/100;return result(c.low<=p.level*(1+tolerance)&&c.close>=p.level,`کف ${fa(c.low)} و پایانی ${fa(c.close)}؛ حمایت ${fa(p.level)}`);}
    case 'SUPPORT_BREAK':case 'RESISTANCE_BREAK':return evaluateCondition({name:condition.name==='SUPPORT_BREAK'?'PRICE_CROSS_BELOW':'PRICE_CROSS_ABOVE',params:{value:p.level}},context);
    case 'MARKET_BREADTH_STRONG':return marketThreshold(market,'market_positive_pct','>=',p.value??65,'درصد نمادهای مثبت');
    case 'MARKET_BREADTH_WEAK':return marketThreshold(market,'market_negative_pct','>=',p.value??65,'درصد نمادهای منفی');
    case 'MARKET_BUYER_POWER_STRONG':return marketThreshold(market,'market_median_buyer_power','>=',p.value??1.2,'میانه قدرت خریدار');
    case 'MARKET_BUYER_POWER_WEAK':return marketThreshold(market,'market_median_buyer_power','<=',p.value??.8,'میانه قدرت خریدار');
    case 'MARKET_VOLUME_HIGH':return marketThreshold(market,'market_value_ratio_20','>=',p.value??1.5,'نسبت ارزش بازار');
    case 'MARKET_RISK_ON':return all([marketThreshold(market,'market_positive_pct','>=',p.positive_pct??65,'مثبت‌ها'),marketThreshold(market,'market_median_buyer_power','>=',p.buyer_power??1.2,'قدرت خریدار'),marketThreshold(market,'equal_weight_change_pct','>',0,'شاخص هم‌وزن')]);
    case 'MARKET_RISK_OFF':return all([marketThreshold(market,'market_negative_pct','>=',p.negative_pct??65,'منفی‌ها'),marketThreshold(market,'market_median_buyer_power','<=',p.buyer_power??.8,'قدرت خریدار'),marketThreshold(market,'equal_weight_change_pct','<',0,'شاخص هم‌وزن')]);
    default:return insufficient(`Condition ناشناخته است: ${condition.name}`);
  }
}

function evaluateThreshold(condition,current,previous,key,label,value){if(!finite(current[key]))return insufficient(`${label}: داده کافی موجود نیست.`);const cross=condition.name.includes('CROSS'),above=condition.name.endsWith('ABOVE');if(cross&&!finite(previous[key]))return insufficient(`${label} قبلی موجود نیست.`);return result(cross?compare(current[key],previous[key],above?'cross_above':'cross_below',value):compare(current[key],null,above?'above':'below',value),`${label}: ${fa(previous[key])} ← ${fa(current[key])}؛ سطح ${fa(value)}`);}
function macdEarly(c){if(![c.macd_hist,c.macd_hist_prev1,c.macd_hist_prev2].every(finite))return insufficient('MACD Histogram: داده کافی موجود نیست.');return result(c.macd_hist<0&&c.macd_hist>c.macd_hist_prev1&&c.macd_hist_prev1>c.macd_hist_prev2,`MACD Hist: ${fa(c.macd_hist_prev2)} ← ${fa(c.macd_hist_prev1)} ← ${fa(c.macd_hist)}`);}
function marketThreshold(market,key,op,value,label){if(!finite(market[key]))return insufficient(`${label}: داده کافی موجود نیست.`);const active=op==='>='?market[key]>=value:op==='<='?market[key]<=value:op==='>'?market[key]>value:market[key]<value;return result(active,`${label}: ${fa(market[key])}`);}
function all(children){const state=children.some(x=>x.state==='inactive')?'inactive':children.some(x=>x.state==='insufficient')?'insufficient':'active';return {state,description:'همه شروط',children};}

export function evaluateRuleExpression(expression,context){
  if(expression.type==='condition')return evaluateCondition(expression,context);
  const children=(expression.children||[]).map(child=>evaluateRuleExpression(child,context));if(!children.length)return insufficient('Rule هیچ شرطی ندارد.');
  const logic=expression.logic||expression.op||'AND',state=logic==='AND'?(children.some(x=>x.state==='inactive')?'inactive':children.some(x=>x.state==='insufficient')?'insufficient':'active'):(children.some(x=>x.state==='active')?'active':children.some(x=>x.state==='insufficient')?'insufficient':'inactive');return {state,description:logic,children};
}

export function buildMarketContext(rows,index=null){
  const universe=rows.filter(x=>x.lastPrice>0&&!/(اختیار|آتی|اوراق|صندوق درآمد)/.test(`${x.market} ${x.name}`)),positive=universe.filter(x=>x.changePct>0).length,negative=universe.filter(x=>x.changePct<0).length,powers=universe.map(x=>x.buyerPower).filter(x=>finite(x)&&x>0).sort((a,b)=>a-b),median=powers.length?(powers[Math.floor((powers.length-1)/2)]+powers[Math.ceil((powers.length-1)/2)])/2:null,totalValue=universe.reduce((sum,x)=>sum+Number(x.tradeValue||0),0),buyQueue=universe.filter(x=>x.buyQueueValue>0),sellQueue=universe.filter(x=>x.sellQueueValue>0);
  const indexBase=index&&finite(index.equalWeight)&&finite(index.equalWeightChange)?index.equalWeight-index.equalWeightChange:null;
  return {market_total_count:universe.length,market_positive_count:positive,market_negative_count:negative,market_positive_pct:universe.length?positive/universe.length*100:null,market_negative_pct:universe.length?negative/universe.length*100:null,market_total_value:totalValue,market_retail_value:universe.reduce((sum,x)=>sum+Number(x.buyVolumeReal||0)*Number(x.closePrice||x.lastPrice||0),0),market_real_money_flow:universe.reduce((sum,x)=>sum+(Number(x.buyVolumeReal||0)-Number(x.sellVolumeReal||0))*Number(x.closePrice||x.lastPrice||0),0),market_median_buyer_power:median,buy_queue_count:buyQueue.length,sell_queue_count:sellQueue.length,buy_queue_value:buyQueue.reduce((s,x)=>s+x.buyQueueValue,0),sell_queue_value:sellQueue.reduce((s,x)=>s+x.sellQueueValue,0),equal_weight_index:index?.equalWeight??null,equal_weight_change_pct:indexBase?index.equalWeightChange/indexBase*100:null,main_index:index?.index??null,main_index_change_pct:index&&index.index-index.indexChange?index.indexChange/(index.index-index.indexChange)*100:null};
}

export class RuleEngineV2{
  constructor(config,db,marketData,runtime){this.config=config;this.db=db;this.marketData=marketData;this.runtime=runtime;this.running=false;this.lastRunAt=null;this.lastError=null;}
  async run(){if(this.running)return {skipped:true};this.running=true;try{const rules=this.db.dueRulesV2();if(!rules.length)return {rules:0,results:[]};const rows=await this.marketData.marketRows(),index=rules.some(rule=>rule.scope==='MARKET')?await this.marketData.marketIndex():null,bySymbol=new Map(rows.map(x=>[x.symbol,x])),market=buildMarketContext(rows,index),riskOff=evaluateCondition({name:'MARKET_RISK_OFF'}, {market}).state==='active',results=[],contexts=new Map(),batchId=`${rows[0]?.date||'live'}:${rows[0]?.time||Math.floor(Date.now()/300000)}`;this.db.addMarketSnapshot(batchId,market);for(const rule of rules){let context;if(rule.scope==='MARKET')context={market,current:market,previous:this.db.previousMarketContext()||{}};else{if(!contexts.has(rule.symbol))contexts.set(rule.symbol,await this.marketData.ruleContext(rule.symbol,bySymbol.get(rule.symbol),market));context=contexts.get(rule.symbol);}const evaluated=evaluateRuleExpression(rule.expression,context),state=this.db.ruleStateV2(rule.id),transition=evaluated.state==='active'&&state?.state!=='active',tehranDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(new Date()),cooldownOk=!state?.last_notified_at||Date.now()-Date.parse(state.last_notified_at)>=rule.cooldownMinutes*60000,dayOk=!rule.oncePerDay||state?.last_triggered_day!==tehranDay,notify=transition&&cooldownOk&&dayOk,buySeverity=['BUY','STRONG_BUY'].includes(rule.severity),effectiveSeverity=riskOff&&buySeverity?'WATCH':rule.severity;let sent=false;if(notify){const message=this.formatAlert(rule,context,evaluated,effectiveSeverity,riskOff&&buySeverity);const delivery=await sendTelegramMany(this.runtime.telegramTargets(),message);sent=!delivery.skipped;}this.db.recordRuleResultV2(rule,evaluated,context,sent,notify?tehranDay:null,effectiveSeverity);results.push({ruleId:rule.ruleId,state:evaluated.state,effectiveSeverity,telegramSent:sent});}this.lastRunAt=new Date().toISOString();this.lastError=null;return {rules:rules.length,riskOff,results};}catch(error){this.lastError=error.message;throw error;}finally{this.running=false;}}
  formatAlert(rule,context,evaluation,effectiveSeverity=rule.severity,downgraded=false){const evidence=[];const walk=node=>{if(node.description&&node.type!=='group')evidence.push(`• ${node.description}`);(node.children||[]).forEach(walk);};walk(evaluation);const c=context.current||{};return [`🚨 ${rule.symbol||'کل بازار'}`,rule.name,`شدت: ${effectiveSeverity}`,downgraded?'⚠️ هشدار خرید به‌علت وضعیت ریسک بازار به WATCH کاهش یافت.':null,finite(c.price)?`قیمت: ${fa(c.price)} ریال`:null,'',...evidence.slice(0,8),'','این پیام تصمیم‌یار است و سفارش واقعی ثبت نشده است.'].filter(x=>x!=null).join('\n');}
}
