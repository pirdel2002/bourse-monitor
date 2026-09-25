export const REVERSAL_WATCH_STRATEGY='reversal_watch_v1';

const c=(name,params={})=>({type:'condition',name,params});
const and=(...children)=>({type:'group',logic:'AND',children});

export const reversalWatchSymbols=Object.freeze([
  {symbol:'بنیرو',tier:'PRIMARY',trigger:and(c('EMA_RECLAIM_20'),c('OBV_TURN_UP'),c('VOLUME_RATIO_ABOVE',{value:1.2})),stop:3540,target1:4150,quantity:26498,limitPrice:3760},
  {symbol:'دکپسول',tier:'PRIMARY',trigger:and(c('PRICE_CROSS_ABOVE',{value:183000}),c('VOLUME_RATIO_ABOVE',{value:1.2}),c('BUYER_POWER_ABOVE',{value:1.2})),stop:167000,target1:198000,quantity:570,limitPrice:173500},
  {symbol:'بکابل',tier:'PRIMARY',trigger:and(c('OBV_TURN_UP'),c('BUYER_POWER_ABOVE',{value:1.2}),c('VOLUME_RATIO_ABOVE',{value:1.2})),stop:5400,target1:6250,quantity:18283,limitPrice:5450},
  {symbol:'حتاید',tier:'PRIMARY',trigger:and(c('EMA_RECLAIM_20'),c('MACD_RECOVERY_EARLY')),stop:7800,target1:8800,noChaseMax:8600},
  {symbol:'وبملت',tier:'PRIMARY',trigger:and(c('PRICE_CROSS_ABOVE',{value:1515}),c('VOLUME_RATIO_ABOVE',{value:1}),c('BUYER_POWER_ABOVE',{value:1.1}))},
  {symbol:'شجم',tier:'PRIMARY',trigger:and(c('SUPPORT_HOLD',{level:10200,tolerance_pct:1}),c('EMA_RECLAIM_20')),stop:9500,target1:10900,quantity:9800,limitPrice:10200},

  {symbol:'وحافظ',tier:'RULE_WATCH',trigger:and(c('EMA_RECLAIM_50'),c('MACD_RECOVERY_EARLY'),c('OBV_HOLD_RECENT_LOW'),c('VOLUME_RATIO_ABOVE',{value:1.2})),stop:2220,target1:2480,quantity:42500,limitPrice:2370},
  {symbol:'ومهان',tier:'RULE_WATCH',trigger:and(c('MFI_CROSS_ABOVE',{value:40}),c('OBV_TURN_UP'),c('MACD_NEGATIVE_SHRINKING')),stop:5000,target1:6000},
  {symbol:'پخش',tier:'RULE_WATCH',trigger:and(c('EMA_RECLAIM_20'),c('MACD_RECOVERY_EARLY'),c('VOLUME_RATIO_ABOVE',{value:1.2})),stop:12250,target1:14700,quantity:7500,limitPrice:13250},
  {symbol:'فهامون',tier:'RULE_WATCH',trigger:and(c('PRICE_CROSS_ABOVE',{value:5300}),c('VOLUME_RATIO_ABOVE',{value:1.2})),quantity:21200,limitPrice:4700},
  {symbol:'سکرما',tier:'RULE_WATCH',trigger:and(c('EMA_RECLAIM_20'),c('MACD_RECOVERY_EARLY'),c('OBV_TURN_UP')),stop:67000,target1:74000,quantity:2860,limitPrice:69800},
  {symbol:'دامین',tier:'RULE_WATCH',trigger:and(c('EMA_RECLAIM_20'),c('OBV_TURN_UP')),quantity:6680,limitPrice:14950},
  {symbol:'شیراز',tier:'RULE_WATCH',trigger:and(c('PRICE_CROSS_ABOVE_HIGH',{periods:20}),c('VOLUME_RATIO_ABOVE',{value:1.2})),stop:66500,target1:74000,quantity:1485,limitPrice:67300},

  {symbol:'پردیس',tier:'SECONDARY',trigger:and(c('EMA_RECLAIM_20'),c('MACD_NEGATIVE_SHRINKING'),c('VOLUME_RATIO_ABOVE',{value:1})),stop:1940,target1:2200},
  {symbol:'سهگمت',tier:'SECONDARY',trigger:and(c('EMA_RECLAIM_20'),c('OBV_TURN_UP'))},
  {symbol:'تکاردان',tier:'SECONDARY',trigger:and(c('PRICE_CROSS_ABOVE_HIGH',{periods:20}),c('VOLUME_RATIO_ABOVE',{value:1.3}))},
  {symbol:'درهاور',tier:'SECONDARY',trigger:and(c('MFI_CROSS_ABOVE',{value:40}),c('MACD_NEGATIVE_SHRINKING'))},
  {symbol:'ثامید',tier:'SECONDARY',trigger:and(c('EMA_RECLAIM_20'),c('BUYER_POWER_ABOVE',{value:1.2}),c('OBV_TURN_UP')),stop:1680,target1:1880}
].map(item=>Object.freeze({...item,allocatedToman:item.quantity&&item.limitPrice?Math.round(item.quantity*item.limitPrice/10):null})));

export const portfolioStructuralSupports=Object.freeze({حتاید:7800,شتران:6500,مبین:11600});

export function buildReversalWatchRulePack(){
  return reversalWatchSymbols.map(item=>({
    ruleId:`REVERSAL_V1_TRIGGER_${item.symbol}`,
    symbol:item.symbol,
    name:`${item.symbol}: Trigger راهبرد برگشتی`,
    description:`Trigger مدیریت‌شده؛ سطح ${item.tier}`,
    enabled:true,
    scope:'SYMBOL',
    severity:'WATCH',
    expression:item.trigger,
    action:'ALERT',
    actionParams:{strategy:REVERSAL_WATCH_STRATEGY,managed:true,silent:true,tier:item.tier,role:'TRIGGER'},
    cooldownMinutes:45,
    oncePerDay:false,
    intervalMinutes:5
  }));
}

export const reversalWatchRulePack=Object.freeze(buildReversalWatchRulePack());

const atLeast=(minMatches,...children)=>({type:'group',logic:'AT_LEAST',minMatches,children});
const weakness=()=>atLeast(2,c('MACD_BEARISH_CROSS'),c('OBV_TURN_DOWN'),c('CLOSE_BELOW_EMA20'),c('BUYER_POWER_BELOW',{value:.8}),c('REAL_MONEY_FLOW_NEGATIVE'));
function exitRule(symbol,suffix,name,severity,expression,action,oncePerDay=false){return {ruleId:`REVERSAL_V1_EXIT_${symbol}_${suffix}`,symbol,name:`${symbol}: ${name}`,description:'Exit Rule مدیریت‌شده',enabled:true,scope:'PORTFOLIO',severity,expression,action,actionParams:{strategy:REVERSAL_WATCH_STRATEGY,managed:true,silent:true,role:'EXIT'},cooldownMinutes:15,oncePerDay,intervalMinutes:5};}

export function buildPortfolioExitRulePack(symbols=[]){
  const rules=[];
  for(const symbol of [...new Set(symbols.filter(Boolean))]){
    rules.push(exitRule(symbol,'HARD_STOP','حد زیان سخت','EXIT',c('LOSS_BELOW',{value:8}),'EXIT_ALERT'));
    rules.push(exitRule(symbol,'POSITION_STOP','حد زیان جاری','EXIT',c('POSITION_STOP_HIT'),'EXIT_ALERT'));
    rules.push(exitRule(symbol,'REDUCE','کاهش موقعیت با ضعف چندگانه','WARNING',weakness(),'SELL_ALERT'));
    rules.push(exitRule(symbol,'TAKE_15','سیو سود از ۱۵ درصد','SELL',and(c('PROFIT_ABOVE',{value:15}),weakness()),'PARTIAL_PROFIT',true));
    rules.push(exitRule(symbol,'TAKE_25','سیو سود از ۲۵ درصد','SELL',and(c('PROFIT_ABOVE',{value:25}),weakness()),'PARTIAL_PROFIT',true));
    const support=portfolioStructuralSupports[symbol];
    if(support)rules.push(exitRule(symbol,'STRUCTURAL','خروج ساختاری','EXIT',and(c('PRICE_BELOW',{value:support}),atLeast(1,c('MACD_BEARISH_CROSS'),c('OBV_TURN_DOWN'),c('CLOSE_BELOW_EMA20'),c('BUYER_POWER_BELOW',{value:.8}),c('REAL_MONEY_FLOW_NEGATIVE'))),'EXIT_ALERT'));
  }
  return rules;
}
