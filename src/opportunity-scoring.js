import {buildIndicatorAnalysis} from './indicator-engine.js';

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const n=value=>finite(value)?Number(value):null;
const round=(value,digits=2)=>finite(value)?Number(Number(value).toFixed(digits)):null;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const excludedMarketText=/(اختیار|آتی|اوراق|حق تقدم|تسهیلات|اخزا|گواهی سپرده|صندوق)/;
const specialFundamentalText=/(بانک|اعتبار|سرمایه|هلدینگ|بیمه|واسطه‌گری مالی)/;

function add(items,label,points,max,passed,available=true,detail=null){
  items.push({label,points:passed?points:0,max,passed:Boolean(passed),available:Boolean(available),detail});
  return passed?points:0;
}

function component(key,label,max,items,penalties=[]){
  const positive=items.reduce((sum,item)=>sum+Number(item.points||0),0),penalty=penalties.reduce((sum,item)=>sum+Number(item.points||0),0),availableMax=items.filter(item=>item.available).reduce((sum,item)=>sum+Number(item.max||0),0);
  const raw=clamp(positive+penalty,0,availableMax),normalizedScore=availableMax>0?raw/availableMax*max:null;
  return {key,label,max,availableMax,coveragePct:round(availableMax/max*100,0),rawScore:round(raw),score:round(raw),normalizedScore:round(normalizedScore),items,penalties};
}

function tradePlan(context){
  const price=n(context.price)||n(context.close),ema20=n(context.ema20),low10=n(context.low_10),low20=n(context.low_20),high20=n(context.high_20);
  if(!finite(price)||price<=0)return {entryType:'UNAVAILABLE',entryLow:null,entryHigh:null,maxEntry:null,stop:null,target1:null,riskPct:null,rewardRisk:null};
  const breakout=finite(high20)&&price>high20;
  const belowPrice=[ema20,low10,low20,breakout?high20:null].filter(value=>finite(value)&&value>0&&value<=price*1.01);
  const anchor=breakout&&finite(high20)?high20:(belowPrice.length?Math.max(...belowPrice):null);
  const swingSupport=[low10,low20].filter(value=>finite(value)&&value>0&&value<price);
  const support=swingSupport.length?Math.max(...swingSupport):null;
  const entryLow=finite(anchor)?anchor*.99:null,entryHigh=finite(anchor)?anchor*1.01:null,maxEntry=finite(anchor)?(breakout?high20*1.02:anchor*1.02):null;
  const stop=finite(support)?support*.99:null,entryMid=finite(entryLow)&&finite(entryHigh)?(entryLow+entryHigh)/2:price;
  const projectedTarget=finite(stop)&&entryMid>stop?entryMid+(entryMid-stop)*1.8:null;
  const target1=finite(high20)&&high20>entryHigh?high20:breakout?projectedTarget:null;
  const riskPct=finite(stop)&&entryMid>stop?(entryMid-stop)/entryMid*100:null,rewardRisk=finite(target1)&&finite(stop)&&entryMid>stop?(target1-entryMid)/(entryMid-stop):null;
  return {entryType:breakout?'BREAKOUT_RETEST':'PULLBACK',entryLow:round(entryLow,0),entryHigh:round(entryHigh,0),maxEntry:round(maxEntry,0),stop:round(stop,0),target1:round(target1,0),riskPct:round(riskPct),rewardRisk:round(rewardRisk),targetMethod:breakout&&target1===projectedTarget?'RISK_PROJECTION':'HIGH_20'};
}

function scoreSymbol(db,row,position=null){
  const history=db.candles(row.symbol,180),analysis=buildIndicatorAnalysis(history,row),c=analysis.context||{},s=analysis.signals||{},price=n(c.price)||n(row.lastPrice)||n(row.closePrice),close=n(c.close),tradeValue=n(row.tradeValue);
  const trendItems=[],momentumItems=[],flowItems=[],structureItems=[],volatilityItems=[],fundamentalItems=[],flowPenalties=[];
  add(trendItems,'قیمت پایانی بالای EMA20',5,5,finite(close)&&finite(c.ema20)&&close>c.ema20,[close,c.ema20].every(finite));
  add(trendItems,'EMA20 بالای EMA50',4,4,finite(c.ema20)&&finite(c.ema50)&&c.ema20>c.ema50,[c.ema20,c.ema50].every(finite));
  add(trendItems,'شیب EMA20 صعودی',3,3,finite(c.ema20)&&finite(c.ema20_prev1)&&c.ema20>c.ema20_prev1,[c.ema20,c.ema20_prev1].every(finite));
  add(trendItems,'فاصله قیمت تا EMA20 حداکثر ۸٪',3,3,finite(close)&&finite(c.ema20)&&close<=c.ema20*1.08,[close,c.ema20].every(finite),finite(close)&&finite(c.ema20)?round((close/c.ema20-1)*100):null);

  const histImproving=[c.macd_hist,c.macd_hist_prev1,c.macd_hist_prev2].every(finite)&&c.macd_hist>c.macd_hist_prev1&&c.macd_hist_prev1>c.macd_hist_prev2;
  if(s.macd_bullish_cross)add(momentumItems,'کراس صعودی MACD',8,8,true,[c.macd_line,c.macd_signal].every(finite));
  else add(momentumItems,'سه کندل بهبود Histogram',5,8,histImproving,[c.macd_hist,c.macd_hist_prev1,c.macd_hist_prev2].every(finite),histImproving?`${round(c.macd_hist_prev2)} ← ${round(c.macd_hist_prev1)} ← ${round(c.macd_hist)}`:null);
  const rsiRising=finite(c.rsi14)&&finite(c.rsi14_prev1)&&c.rsi14>c.rsi14_prev1;
  add(momentumItems,'RSI در محدوده ۵۰ تا ۶۸',6,6,finite(c.rsi14)&&c.rsi14>=50&&c.rsi14<=68,finite(c.rsi14));
  if(!(finite(c.rsi14)&&c.rsi14>=50&&c.rsi14<=68))add(momentumItems,'RSI بین ۴۵ تا ۵۰ و صعودی',3,0,finite(c.rsi14)&&c.rsi14>=45&&c.rsi14<50&&rsiRising);
  const mfiRising=finite(c.mfi14)&&finite(c.mfi14_prev1)&&c.mfi14>c.mfi14_prev1;
  add(momentumItems,'MFI در محدوده ۵۰ تا ۷۵',6,6,finite(c.mfi14)&&c.mfi14>=50&&c.mfi14<=75,finite(c.mfi14));
  if(!(finite(c.mfi14)&&c.mfi14>=50&&c.mfi14<=75))add(momentumItems,'MFI بین ۳۰ تا ۵۰ و صعودی',3,0,finite(c.mfi14)&&c.mfi14>=30&&c.mfi14<50&&mfiRising);

  add(flowItems,'ورود پول حقیقی مثبت',7,7,finite(c.real_money_flow)&&c.real_money_flow>0,finite(c.real_money_flow),c.real_money_flow);
  add(flowItems,'ورود پول حقیقی سه‌روزه مثبت',3,3,false,false,'History فعلی خرید/فروش حقیقی روزانه ندارد');
  add(flowItems,'قدرت خریدار حداقل ۱٫۵',5,5,finite(c.buyer_power)&&c.buyer_power>=1.5,finite(c.buyer_power),c.buyer_power);
  add(flowItems,'قدرت خریدار حداقل ۲',2,2,finite(c.buyer_power)&&c.buyer_power>=2,finite(c.buyer_power),c.buyer_power);
  add(flowItems,'حجم حداقل ۱٫۲ برابر میانگین',4,4,finite(c.volume_ratio_20)&&c.volume_ratio_20>=1.2,finite(c.volume_ratio_20),c.volume_ratio_20);
  add(flowItems,'حجم حداقل ۲ برابر میانگین',2,2,finite(c.volume_ratio_20)&&c.volume_ratio_20>=2,finite(c.volume_ratio_20),c.volume_ratio_20);
  add(flowItems,'MFI صعودی',2,2,mfiRising,[c.mfi14,c.mfi14_prev1].every(finite));
  const severeNegative=finite(c.real_money_flow)&&c.real_money_flow<0&&((finite(tradeValue)&&tradeValue>0&&Math.abs(c.real_money_flow)>=tradeValue*.1)||(finite(c.buyer_power)&&c.buyer_power<.8&&finite(c.volume_ratio_20)&&c.volume_ratio_20>=1.2));
  if(severeNegative)flowPenalties.push({label:'خروج شدید پول حقیقی',points:-8,detail:c.real_money_flow});
  if(finite(c.buyer_power)&&c.buyer_power<.8)flowPenalties.push({label:'قدرت خریدار کمتر از ۰٫۸',points:-5,detail:c.buyer_power});

  const obvRising5=[c.obv,c.obv_prev5].every(finite)&&c.obv>c.obv_prev5;
  const obvRange=finite(c.obv_high_20)&&finite(c.obv_low_20)?c.obv_high_20-c.obv_low_20:null,obvNearHigh=finite(obvRange)&&obvRange>0?(c.obv-c.obv_low_20)/obvRange>=.9:finite(c.obv)&&finite(c.obv_high_20)&&c.obv>=c.obv_high_20;
  const priceFlatDownObvUp=obvRising5&&finite(close)&&finite(c.close_prev5)&&close<=c.close_prev5*1.02;
  const structureValid=[close,c.low_20].every(finite)&&close>=c.low_20&&(!finite(c.low)||c.low>=c.low_20*.99);
  add(structureItems,'OBV در پنج روز صعودی',4,4,obvRising5,[c.obv,c.obv_prev5].every(finite));
  add(structureItems,'OBV نزدیک سقف ۲۰روزه',3,3,obvNearHigh,[c.obv,c.obv_high_20,c.obv_low_20].every(finite));
  add(structureItems,'قیمت خنثی/منفی و OBV صعودی',4,4,priceFlatDownObvUp,[close,c.close_prev5,c.obv,c.obv_prev5].every(finite));
  add(structureItems,'حمایت/کف ۲۰روزه حفظ شده',4,4,structureValid,[close,c.low_20].every(finite));

  const bbwCompressed=finite(c.bbw_percentile_120)&&c.bbw_percentile_120<=20,atrDeclining=finite(c.atr14)&&finite(c.atr14_prev)&&c.atr14<c.atr14_prev&&finite(c.return_5d)&&c.return_5d<=2,bbwExpanding=finite(c.bbw)&&finite(c.bbw_prev1)&&finite(c.bbw_prev2)&&c.bbw>c.bbw_prev1&&c.bbw_prev1<=c.bbw_prev2&&(!finite(c.bbw_percentile_120)||c.bbw_percentile_120<=35);
  add(volatilityItems,'BBW در ۲۰٪ پایین تاریخچه',5,5,bbwCompressed,finite(c.bbw_percentile_120),c.bbw_percentile_120);
  add(volatilityItems,'ATR پس از اصلاح نزولی است',3,3,atrDeclining,[c.atr14,c.atr14_prev,c.return_5d].every(finite));
  add(volatilityItems,'BBW پس از فشردگی باز می‌شود',2,2,bbwExpanding,[c.bbw,c.bbw_prev1,c.bbw_prev2].every(finite));

  const fundamentalModel=specialFundamentalText.test(`${row.industry||''} ${row.name||''}`)?'SPECIALIZED_PENDING':'GENERAL';
  const genericFundamental=fundamentalModel==='GENERAL';
  add(fundamentalItems,'EPS مثبت',2,2,genericFundamental&&finite(row.eps)&&row.eps>0,genericFundamental&&finite(row.eps),genericFundamental?row.eps:'مدل تخصصی صنعت هنوز تعریف نشده است');
  add(fundamentalItems,'P/E کمتر یا مساوی گروه',3,3,genericFundamental&&finite(row.pe)&&row.pe>0&&finite(row.groupPe)&&row.groupPe>0&&row.pe<=row.groupPe,genericFundamental&&finite(row.pe)&&finite(row.groupPe),genericFundamental?row.pe:'مدل تخصصی صنعت هنوز تعریف نشده است');
  add(fundamentalItems,'رشد فروش سالانه مثبت',2,2,false,false,'داده گزارش عملکرد در منبع فعلی موجود نیست');
  add(fundamentalItems,'رشد فروش تجمعی مثبت',1,1,false,false,'داده گزارش عملکرد در منبع فعلی موجود نیست');
  add(fundamentalItems,'رشد سود TTM مثبت',2,2,false,false,'داده گزارش عملکرد در منبع فعلی موجود نیست');

  const plan=tradePlan(c),riskItems=[];
  const riskOk=finite(plan.riskPct)&&plan.riskPct<=8,rrOk=finite(plan.rewardRisk)&&plan.rewardRisk>=1.5;
  add(riskItems,'ریسک تا Stop حداکثر ۸٪',2,2,riskOk,finite(plan.riskPct),plan.riskPct);
  add(riskItems,'نسبت بازده به ریسک حداقل ۱٫۵',3,3,rrOk,finite(plan.rewardRisk),plan.rewardRisk);

  const components=[component('trend','روند و EMA',15,trendItems),component('momentum','مومنتوم',20,momentumItems),component('flow','پول و حجم',25,flowItems,flowPenalties),component('structure','ساختار و OBV',15,structureItems),component('volatility','آماده‌شدن حرکت',10,volatilityItems),component('fundamental','بنیادی',10,fundamentalItems),component('riskReward','ریسک/بازده',5,riskItems)];
  const availableWeight=components.reduce((sum,item)=>sum+item.availableMax,0),earnedPoints=components.reduce((sum,item)=>sum+item.rawScore,0),opportunityScore=availableWeight>0?round(clamp(earnedPoints/availableWeight*100,0,100),0):0;
  const dataCoverage=round(components.reduce((sum,item)=>sum+item.availableMax,0)/components.reduce((sum,item)=>sum+item.max,0)*100,0),coverageSufficient=dataCoverage>=60;
  const noChase5=!finite(c.return_5d)||c.return_5d<=10,noChase20=!finite(c.return_20d)||c.return_20d<=25,noChaseEma=!finite(close)||!finite(c.ema20)||close<=c.ema20*1.08,noChase=noChase5&&noChase20&&noChaseEma;
  const flowNotStronglyNegative=!severeNegative,macdRecovery=Boolean(s.macd_bullish_cross||s.macd_recovery_early||histImproving),obvNotFalling=!finite(c.obv)||!finite(c.obv_prev1)||c.obv>=c.obv_prev1;
  const breakoutTrigger=finite(price)&&finite(c.high_20)&&price>c.high_20&&c.volume_ratio_20>=1.5&&c.buyer_power>=1.2&&c.real_money_flow>0;
  const standardTrigger=finite(close)&&finite(c.ema20)&&close>=c.ema20&&macdRecovery&&c.volume_ratio_20>=1.2&&(c.buyer_power>=1.2||c.real_money_flow>=0);
  const earlyTrigger=finite(close)&&finite(c.ema20)&&Math.abs(close/c.ema20-1)<=.03&&rsiRising&&mfiRising&&histImproving&&obvNotFalling&&flowNotStronglyNegative;
  const buyTrigger=breakoutTrigger||standardTrigger||earlyTrigger;
  let confirmationScore=0;
  confirmationScore+=finite(close)&&finite(c.ema20)&&close>=c.ema20?15:0;
  confirmationScore+=finite(c.ema20)&&finite(c.ema20_prev1)&&c.ema20>=c.ema20_prev1?10:0;
  confirmationScore+=s.macd_bullish_cross?20:s.macd_recovery_early?14:histImproving?8:0;
  confirmationScore+=finite(c.rsi14)&&c.rsi14>=50?10:rsiRising?6:0;
  confirmationScore+=finite(c.mfi14)&&c.mfi14>=50?10:mfiRising?6:0;
  confirmationScore+=finite(c.volume_ratio_20)&&c.volume_ratio_20>=1.2?10:0;
  confirmationScore+=(finite(c.buyer_power)&&c.buyer_power>=1.2)||(finite(c.real_money_flow)&&c.real_money_flow>=0)?10:0;
  confirmationScore+=obvRising5||s.obv_turn_up?5:0;
  confirmationScore+=structureValid?5:0;
  confirmationScore+=noChase?5:0;
  confirmationScore=round(clamp(confirmationScore,0,100),0);

  const missing=[];
  if(opportunityScore<80)missing.push('Opportunity Score کمتر از ۸۰');
  if(!coverageSufficient)missing.push('پوشش داده کمتر از ۶۰٪ است');
  if(!buyTrigger)missing.push('Trigger خرید کامل نیست');
  if(!noChase)missing.push('No-Chase رد شده است');
  if(!structureValid)missing.push('ساختار قیمت معتبر نیست');
  if(!finite(plan.stop)||!finite(plan.target1))missing.push('Stop/Target1 معتبر محاسبه نشد');
  else {if(!riskOk)missing.push('ریسک تا Stop بیش از ۸٪ است');if(!rrOk)missing.push('نسبت بازده/ریسک کمتر از ۱٫۵ است');}
  if(!flowNotStronglyNegative)missing.push('جریان پول شدیداً منفی است');
  const technicalBuyNow=opportunityScore>=80&&coverageSufficient&&buyTrigger&&noChase&&structureValid&&riskOk&&rrOk&&flowNotStronglyNegative;
  let state=opportunityScore<60?'NO_ACTION':opportunityScore<70?'WATCH':'WAIT_FOR_TRIGGER';
  if(opportunityScore>=80&&coverageSufficient&&confirmationScore>=65&&buyTrigger)state=technicalBuyNow?(position?'SECOND_ENTRY_CANDIDATE':'BUY_CANDIDATE'):'BUY_CANDIDATE';
  if(!coverageSufficient&&opportunityScore>=60)state='WATCH';
  const setupClass=opportunityScore>=90?'STRONG_BUY_SETUP':opportunityScore>=80?'BUY_CANDIDATE':opportunityScore>=70?'WAIT_FOR_TRIGGER':opportunityScore>=60?'WATCH':'REJECT';
  const potential=opportunityScore>=80?'HIGH':opportunityScore>=65?'MEDIUM':'LOW';
  const alerts=[
    {label:'قیمت پایانی بالای EMA20',condition:{name:'CLOSE_ABOVE_EMA20',params:{}},active:finite(close)&&finite(c.ema20)&&close>c.ema20},
    {label:'خروج اولیه MACD از اصلاح',condition:{name:'MACD_RECOVERY_EARLY',params:{}},active:Boolean(s.macd_recovery_early)},
    {label:'کراس صعودی MACD',condition:{name:'MACD_BULLISH_CROSS',params:{}},active:Boolean(s.macd_bullish_cross)},
    {label:'برگشت OBV',condition:{name:'OBV_TURN_UP',params:{}},active:Boolean(s.obv_turn_up)},
    {label:'حجم بالای ۱٫۲ برابر',condition:{name:'VOLUME_RATIO_ABOVE',params:{value:1.2}},active:finite(c.volume_ratio_20)&&c.volume_ratio_20>=1.2},
    {label:'قدرت خریدار بالای ۱٫۲',condition:{name:'BUYER_POWER_ABOVE',params:{value:1.2}},active:finite(c.buyer_power)&&c.buyer_power>=1.2},
    {label:'ورود پول حقیقی مثبت',condition:{name:'REAL_MONEY_FLOW_POSITIVE',params:{}},active:finite(c.real_money_flow)&&c.real_money_flow>0},
    ...(finite(c.high_20)?[{label:`شکست سقف ۲۰روزه ${round(c.high_20,0)}`,condition:{name:'PRICE_CROSS_ABOVE_HIGH',params:{periods:20}},active:finite(price)&&price>c.high_20}]:[])
  ];
  return {symbol:row.symbol,name:row.name||row.symbol,market:row.market||'',industry:row.industry||'',asOf:analysis.asOf,valid:analysis.valid,candleCount:analysis.candleCount||0,opportunityScore,confirmationScore,setupClass,potential,state,buyNowEligible:technicalBuyNow,executionReady:false,missing,components,alerts,plan,noChase:{pass:noChase,return5Pass:noChase5,return20Pass:noChase20,emaDistancePass:noChaseEma},trigger:{pass:buyTrigger,type:breakoutTrigger?'BREAKOUT':earlyTrigger?'EARLY_REVERSAL':standardTrigger?'MOMENTUM':'WAIT'},structureValid,flowNotStronglyNegative,dataCoverage,coverageSufficient,position:position?{quantity:Number(position.quantity),avgPrice:Number(position.avg_price)}:null,indicators:{price,close,changePct:n(row.changePct),ema20:n(c.ema20),ema50:n(c.ema50),ema20Slope:finite(c.ema20)&&finite(c.ema20_prev1)?round(c.ema20-c.ema20_prev1):null,rsi14:n(c.rsi14),rsiPrev:n(c.rsi14_prev1),mfi14:n(c.mfi14),mfiPrev:n(c.mfi14_prev1),macdLine:n(c.macd_line),macdSignal:n(c.macd_signal),macdHist:n(c.macd_hist),macdHistPrev1:n(c.macd_hist_prev1),macdHistPrev2:n(c.macd_hist_prev2),obv:n(c.obv),obvPrev5:n(c.obv_prev5),bbw:n(c.bbw),bbwPercentile:n(c.bbw_percentile_120),atr14:n(c.atr14),atrPrev:n(c.atr14_prev),volume:n(c.volume),volumeSma20:n(c.volume_sma20),volumeRatio:n(c.volume_ratio_20),buyerPower:n(c.buyer_power),realMoneyFlow:n(c.real_money_flow),realMoneyFlow3d:null,return5:n(c.return_5d),return20:n(c.return_20d),high20:n(c.high_20),low20:n(c.low_20),eps:n(row.eps),pe:n(row.pe),sectorPe:n(row.groupPe),salesYoy:null,cumulativeSalesYoy:null,ttmProfitGrowth:null,fundamentalModel}};
}

export function buildOpportunityRanking(db,rows,{userId=null,limit=100}={}){
  const positions=new Map(db.portfolioPositions(userId).map(position=>[position.symbol,position]));
  const universe=(rows||[]).filter(row=>n(row.lastPrice||row.closePrice)>0&&!excludedMarketText.test(`${row.symbol||''} ${row.name||''} ${row.market||''}`));
  const all=universe.map(row=>scoreSymbol(db,row,positions.get(row.symbol)||null)).filter(item=>item.valid).sort((a,b)=>b.opportunityScore-a.opportunityScore||b.confirmationScore-a.confirmationScore||a.symbol.localeCompare(b.symbol,'fa'));
  return {generatedAt:new Date().toISOString(),totalUniverse:universe.length,scoredSymbols:all.length,limit:Math.min(100,Math.max(1,Number(limit)||100)),items:all.slice(0,Math.min(100,Math.max(1,Number(limit)||100))),methodology:{version:'opportunity_v1',weights:{trend:15,momentum:20,flow:25,structure:15,volatility:10,fundamental:10,riskReward:5},limitations:['جریان پول حقیقی سه‌روزه برای کل بازار در داده فعلی موجود نیست.','رشد فروش و سود TTM هنوز از منبع گزارش‌های مالی تغذیه نمی‌شود.','سطوح ورود، Stop و Target برآورد الگوریتمی‌اند و سفارش معاملاتی نیستند.']}};
}

export {scoreSymbol};
