import {sendTelegramMany} from './telegram.js';
import {resolveActionableOrder} from './actionable-order.js';
import {isMarketWindow} from './schedule.js';

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const fa=value=>finite(value)?Number(value).toLocaleString('fa-IR',{maximumFractionDigits:2}):'داده ناکافی';
const get=(context,key)=>key.split('.').reduce((value,part)=>value?.[part],context);
const result=(active,description,values={})=>({state:active?'active':'inactive',description,values});
const insufficient=description=>({state:'insufficient',description,values:{}});
const compare=(current,previous,operator,value)=>operator==='above'?current>value:operator==='below'?current<value:operator==='cross_above'?current>value&&previous<=value:current<value&&previous>=value;

export const conditionCatalogV2=[
  'PRICE_ABOVE','PRICE_BELOW','PRICE_CROSS_ABOVE','PRICE_CROSS_BELOW','PRICE_IN_RANGE','PRICE_HOLD_ABOVE','EMA_RECLAIM_20','EMA_RECLAIM_50','EMA20_ABOVE_EMA50','EMA20_50_GAP_BELOW',
  'RSI_ABOVE','RSI_BELOW','RSI_CROSS_ABOVE','RSI_CROSS_BELOW','MFI_ABOVE','MFI_BELOW','MFI_CROSS_ABOVE','MFI_CROSS_BELOW','VOLUME_RATIO_ABOVE','BUYER_POWER_ABOVE','BUYER_POWER_BELOW','PRICE_ABOVE_EMA20','PRICE_ABOVE_EMA50',
  'CLOSE_ABOVE_EMA20','CLOSE_BELOW_EMA20','EMA20_NON_DECREASING','REAL_MONEY_FLOW_POSITIVE','REAL_MONEY_FLOW_NEGATIVE','RETURN_BELOW','PRICE_CROSS_ABOVE_HIGH','RISK_TO_STOP_BELOW','REWARD_RISK_ABOVE','POSITION_STOP_HIT',
  'OBV_TURN_UP','OBV_TURN_DOWN','OBV_BREAK_HIGH','OBV_HOLD_RECENT_LOW','BBW_BELOW','ATR_EXPANDING','PROFIT_ABOVE','LOSS_BELOW','TRAILING_STOP','MACD_RECOVERY_EARLY','MACD_RECOVERY_NEAR_ZERO',
  'MACD_BULLISH_CROSS','MACD_BEARISH_CROSS','MACD_NEGATIVE_SHRINKING','BREAKOUT_CONFIRMED','BREAKDOWN_CONFIRMED','SUPPORT_HOLD','SUPPORT_BREAK','RESISTANCE_BREAK',
  'MARKET_BREADTH_STRONG','MARKET_BREADTH_WEAK','MARKET_BUYER_POWER_STRONG','MARKET_BUYER_POWER_WEAK','MARKET_VOLUME_HIGH','MARKET_RISK_ON','MARKET_RISK_OFF','BUY_QUEUE_VALUE_CHANGE_15M_ABOVE','SELL_QUEUE_VALUE_CHANGE_15M_ABOVE','TECH_RECOVERY_STRONG','TECH_RECOVERY_VERY_STRONG'
];

const conditionLabels={PRICE_ABOVE:'قیمت بالاتر از',PRICE_BELOW:'قیمت پایین‌تر از',PRICE_CROSS_ABOVE:'عبور قیمت به بالا',PRICE_CROSS_BELOW:'عبور قیمت به پایین',PRICE_IN_RANGE:'قیمت داخل محدوده',PRICE_HOLD_ABOVE:'تثبیت قیمت بالای سطح',EMA_RECLAIM_20:'بازپس‌گیری EMA20',EMA_RECLAIM_50:'بازپس‌گیری EMA50',EMA20_ABOVE_EMA50:'EMA20 بالای EMA50',EMA20_50_GAP_BELOW:'فاصله EMA20/50 کمتر از',RSI_ABOVE:'RSI بالاتر از',RSI_BELOW:'RSI پایین‌تر از',RSI_CROSS_ABOVE:'عبور RSI به بالا',RSI_CROSS_BELOW:'عبور RSI به پایین',MFI_ABOVE:'MFI بالاتر از',MFI_BELOW:'MFI پایین‌تر از',MFI_CROSS_ABOVE:'عبور MFI به بالا',MFI_CROSS_BELOW:'عبور MFI به پایین',VOLUME_RATIO_ABOVE:'نسبت حجم به میانگین بالاتر از',BUYER_POWER_ABOVE:'قدرت خریدار بالاتر از',BUYER_POWER_BELOW:'قدرت خریدار پایین‌تر از',PRICE_ABOVE_EMA20:'قیمت بالای EMA20',OBV_TURN_UP:'برگشت صعودی OBV',OBV_TURN_DOWN:'برگشت نزولی OBV',OBV_BREAK_HIGH:'شکست سقف OBV',OBV_HOLD_RECENT_LOW:'OBV بالای کف ۱۰ کندل',BBW_BELOW:'BBW پایین‌تر از',ATR_EXPANDING:'گسترش ATR',PROFIT_ABOVE:'سود سبد بالاتر از',LOSS_BELOW:'زیان سبد بیشتر از',TRAILING_STOP:'حد زیان متحرک',MACD_RECOVERY_EARLY:'خروج اولیه MACD از اصلاح',MACD_RECOVERY_NEAR_ZERO:'بازیابی MACD نزدیک صفر',MACD_BULLISH_CROSS:'کراس صعودی MACD',MACD_BEARISH_CROSS:'کراس نزولی MACD',MACD_NEGATIVE_SHRINKING:'کاهش هیستوگرام منفی MACD',BREAKOUT_CONFIRMED:'شکست معتبر مقاومت',BREAKDOWN_CONFIRMED:'شکست معتبر حمایت',SUPPORT_HOLD:'حفظ حمایت',SUPPORT_BREAK:'شکست حمایت',RESISTANCE_BREAK:'شکست مقاومت',MARKET_BREADTH_STRONG:'وسعت مثبت بازار',MARKET_BREADTH_WEAK:'وسعت منفی بازار',MARKET_BUYER_POWER_STRONG:'قدرت خریدار قوی بازار',MARKET_BUYER_POWER_WEAK:'قدرت خریدار ضعیف بازار',MARKET_VOLUME_HIGH:'جهش ارزش معاملات خرد',MARKET_RISK_ON:'وضعیت RISK ON بازار',MARKET_RISK_OFF:'وضعیت RISK OFF بازار',BUY_QUEUE_VALUE_CHANGE_15M_ABOVE:'رشد ۱۵دقیقه‌ای صف خرید',SELL_QUEUE_VALUE_CHANGE_15M_ABOVE:'رشد ۱۵دقیقه‌ای صف فروش',TECH_RECOVERY_STRONG:'امتیاز بازیابی قوی',TECH_RECOVERY_VERY_STRONG:'امتیاز بازیابی بسیار قوی'};
conditionLabels.PRICE_ABOVE_EMA50='قیمت بالای EMA50';
Object.assign(conditionLabels,{CLOSE_ABOVE_EMA20:'قیمت پایانی بالای EMA20',CLOSE_BELOW_EMA20:'قیمت پایانی زیر EMA20',EMA20_NON_DECREASING:'EMA20 غیرنزولی',REAL_MONEY_FLOW_POSITIVE:'ورود پول حقیقی مثبت',REAL_MONEY_FLOW_NEGATIVE:'خروج پول حقیقی',RETURN_BELOW:'بازده دوره کمتر از',PRICE_CROSS_ABOVE_HIGH:'شکست سقف دوره',RISK_TO_STOP_BELOW:'ریسک تا حد زیان کمتر از',REWARD_RISK_ABOVE:'نسبت بازده به ریسک بالاتر از',POSITION_STOP_HIT:'رسیدن قیمت به حد زیان موقعیت'});
const valueConditions=new Set(['PRICE_ABOVE','PRICE_BELOW','PRICE_CROSS_ABOVE','PRICE_CROSS_BELOW','EMA20_50_GAP_BELOW','RSI_ABOVE','RSI_BELOW','RSI_CROSS_ABOVE','RSI_CROSS_BELOW','MFI_ABOVE','MFI_BELOW','MFI_CROSS_ABOVE','MFI_CROSS_BELOW','VOLUME_RATIO_ABOVE','BUYER_POWER_ABOVE','BUYER_POWER_BELOW','BBW_BELOW','PROFIT_ABOVE','LOSS_BELOW','TRAILING_STOP','MARKET_BREADTH_STRONG','MARKET_BREADTH_WEAK','MARKET_BUYER_POWER_STRONG','MARKET_BUYER_POWER_WEAK','MARKET_VOLUME_HIGH','BUY_QUEUE_VALUE_CHANGE_15M_ABOVE','SELL_QUEUE_VALUE_CHANGE_15M_ABOVE']);
export const conditionDefinitionsV2=conditionCatalogV2.map(value=>{let params=[];if(valueConditions.has(value))params=[{key:'value',label:'مقدار',default:value.includes('QUEUE_VALUE_CHANGE')?30:0}];if(value==='PRICE_IN_RANGE')params=[{key:'min',label:'از',default:0},{key:'max',label:'تا',default:0}];if(value==='PRICE_HOLD_ABOVE')params=[{key:'value',label:'سطح',default:0},{key:'periods',label:'تعداد نمونه',default:3}];if(value==='OBV_BREAK_HIGH')params=[{key:'periods',label:'تعداد کندل',default:10}];if(value==='RETURN_BELOW')params=[{key:'periods',label:'تعداد روز',default:5},{key:'value',label:'حداکثر بازده درصدی',default:10}];if(value==='PRICE_CROSS_ABOVE_HIGH')params=[{key:'periods',label:'تعداد کندل',default:20}];if(value==='RISK_TO_STOP_BELOW')params=[{key:'value',label:'حداکثر ریسک درصدی',default:8},{key:'stop',label:'حد زیان؛ اختیاری',default:0}];if(value==='REWARD_RISK_ABOVE')params=[{key:'value',label:'حداقل نسبت',default:1.5},{key:'stop',label:'حد زیان؛ اختیاری',default:0},{key:'target',label:'هدف اول؛ اختیاری',default:0}];if(['SUPPORT_BREAK','RESISTANCE_BREAK'].includes(value))params=[{key:'level',label:'سطح',default:0}];if(value==='SUPPORT_HOLD')params=[{key:'level',label:'حمایت',default:0},{key:'tolerance_pct',label:'تلورانس درصدی',default:1}];if(['BREAKOUT_CONFIRMED','BREAKDOWN_CONFIRMED'].includes(value))params=[{key:'level',label:'سطح',default:0},{key:'volume_ratio',label:'نسبت حجم',default:1.5},...(value==='BREAKOUT_CONFIRMED'?[{key:'buyer_power',label:'قدرت خریدار',default:1.2}]:[])];return {value,label:conditionLabels[value]||value,params};});

export function normalizeRuleExpressionV2(expression){
  if(!expression||typeof expression!=='object')return expression;
  if(expression.type==='condition')return {type:'condition',name:expression.name,params:expression.params||{}};
  if(expression.type==='group')return {type:'group',logic:expression.logic||expression.op||'AND',...(expression.minMatches!==undefined?{minMatches:Number(expression.minMatches)}:{}),children:(expression.children||expression.conditions||[]).map(normalizeRuleExpressionV2)};
  if(conditionCatalogV2.includes(expression.type)){
    const {type,...params}=expression;
    if(params.level===undefined&&params.value!==undefined&&['BREAKOUT_CONFIRMED','BREAKDOWN_CONFIRMED','SUPPORT_HOLD','SUPPORT_BREAK','RESISTANCE_BREAK'].includes(type))params.level=params.value;
    return {type:'condition',name:type,params};
  }
  if(Array.isArray(expression.conditions))return {type:'group',logic:expression.logic||expression.condition_logic||expression.op||'AND',...(expression.minMatches!==undefined?{minMatches:Number(expression.minMatches)}:{}),children:expression.conditions.map(normalizeRuleExpressionV2)};
  return expression;
}

export function validateRuleExpressionV2(expression,depth=0){if(depth>8)throw new Error('عمق Rule بیشتر از حد مجاز است.');if(!expression||typeof expression!=='object')throw new Error('ساختار Rule معتبر نیست.');if(expression.type==='condition'){if(!conditionCatalogV2.includes(expression.name))throw new Error(`Condition ناشناخته است: ${expression.name}`);if(expression.params!==undefined&&(expression.params===null||typeof expression.params!=='object'||Array.isArray(expression.params)))throw new Error('پارامترهای Condition معتبر نیست.');return expression;}const logic=expression.logic||expression.op;if(expression.type!=='group'||!['AND','OR','AT_LEAST'].includes(logic)||!Array.isArray(expression.children)||expression.children.length<1||expression.children.length>40)throw new Error('گروه Rule معتبر نیست.');if(logic==='AT_LEAST'&&(!Number.isInteger(Number(expression.minMatches))||Number(expression.minMatches)<1||Number(expression.minMatches)>expression.children.length))throw new Error('حداقل تعداد تطبیق AT_LEAST معتبر نیست.');expression.children.forEach(x=>validateRuleExpressionV2(x,depth+1));return expression;}

export function evaluateCondition(condition,context){
  const p=condition.params||{},c=context.current||{},prev=context.previous||{},history=context.liveHistory||[],portfolio=context.portfolio||{},market=context.market||{},market15m=context.market15m||{};
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
    case 'BUYER_POWER_BELOW':if((missing=numeric('قدرت خریدار',c.buyer_power)))return missing;return result(c.buyer_power<=p.value,`قدرت خریدار: ${fa(c.buyer_power)}`);
    case 'PRICE_ABOVE_EMA20':if(![c.price,c.ema20].every(finite))return insufficient('قیمت/EMA20: داده کافی موجود نیست.');return result(c.price>c.ema20,`قیمت ${fa(c.price)} بالای EMA20 ${fa(c.ema20)}`);
    case 'PRICE_ABOVE_EMA50':if(![c.price,c.ema50].every(finite))return insufficient('قیمت/EMA50: داده کافی موجود نیست.');return result(c.price>c.ema50,`قیمت ${fa(c.price)} بالای EMA50 ${fa(c.ema50)}`);
    case 'CLOSE_ABOVE_EMA20':case 'CLOSE_BELOW_EMA20':if(![c.close,c.ema20].every(finite))return insufficient('قیمت پایانی/EMA20: داده کافی موجود نیست.');{const above=condition.name.endsWith('ABOVE_EMA20');return result(above?c.close>c.ema20:c.close<c.ema20,`پایانی ${fa(c.close)} / EMA20 ${fa(c.ema20)}`);}
    case 'EMA20_NON_DECREASING':if(![c.ema20,c.ema20_prev1].every(finite))return insufficient('EMA20 فعلی/قبلی: داده کافی موجود نیست.');return result(c.ema20>=c.ema20_prev1,`EMA20: ${fa(c.ema20_prev1)} ← ${fa(c.ema20)}`);
    case 'REAL_MONEY_FLOW_POSITIVE':case 'REAL_MONEY_FLOW_NEGATIVE':if(!finite(c.real_money_flow))return insufficient('جریان پول حقیقی: داده کافی موجود نیست.');{const positive=condition.name.endsWith('POSITIVE');return result(positive?c.real_money_flow>0:c.real_money_flow<0,`جریان پول حقیقی: ${fa(c.real_money_flow)} ریال`);}
    case 'RETURN_BELOW':{const periods=Math.max(1,Number(p.periods||5)),key=`return_${periods}d`;if(!finite(c[key]))return insufficient(`بازده ${periods}روزه: داده کافی موجود نیست.`);return result(c[key]<=Number(p.value),`بازده ${periods}روزه: ${fa(c[key])}٪ / سقف ${fa(p.value)}٪`);}
    case 'PRICE_CROSS_ABOVE_HIGH':{const periods=Math.max(1,Number(p.periods||20)),high=c[`high_${periods}`];if(![c.price,prev.price,high].every(finite))return insufficient(`شکست سقف ${periods}روزه: داده کافی موجود نیست.`);return result(c.price>high&&prev.price<=high,`قیمت ${fa(prev.price)} ← ${fa(c.price)}؛ سقف ${periods}روزه ${fa(high)}`);}
    case 'RISK_TO_STOP_BELOW':{const stop=Number(p.stop)>0?Number(p.stop):Number(portfolio.stop_price||portfolio.initial_stop_price);if(![c.price,stop].every(finite)||c.price<=0||stop<=0||stop>=c.price)return insufficient('ریسک تا حد زیان: قیمت یا Stop معتبر موجود نیست.');const risk=(c.price-stop)/c.price*100;return result(risk<=Number(p.value??8),`ریسک تا Stop: ${fa(risk)}٪ / سقف ${fa(p.value??8)}٪`);}
    case 'REWARD_RISK_ABOVE':{const stop=Number(p.stop)>0?Number(p.stop):Number(portfolio.stop_price||portfolio.initial_stop_price),target=Number(p.target)>0?Number(p.target):Number(portfolio.target_price);if(![c.price,stop,target].every(finite)||c.price<=stop||target<=c.price)return insufficient('نسبت بازده/ریسک: قیمت، Stop یا Target1 معتبر نیست.');const ratio=(target-c.price)/(c.price-stop);return result(ratio>=Number(p.value??1.5),`بازده/ریسک: ${fa(ratio)} / حداقل ${fa(p.value??1.5)}`);}
    case 'POSITION_STOP_HIT':{const stop=Number(portfolio.stop_price);if(![c.price,stop].every(finite)||stop<=0)return insufficient('حد زیان جاری موقعیت موجود نیست.');return result(c.price<=stop,`قیمت ${fa(c.price)} / حد زیان جاری ${fa(stop)}`);}
    case 'OBV_TURN_UP':if(![c.obv,c.obv_prev1,c.obv_prev2].every(finite))return insufficient('OBV: داده کافی موجود نیست.');return result(c.obv>c.obv_prev1&&c.obv_prev1<=c.obv_prev2,`OBV: ${fa(c.obv_prev2)} ← ${fa(c.obv_prev1)} ← ${fa(c.obv)}`);
    case 'OBV_TURN_DOWN':if(![c.obv,c.obv_prev1,c.obv_prev2].every(finite))return insufficient('OBV: داده کافی موجود نیست.');return result(c.obv<c.obv_prev1&&c.obv_prev1>=c.obv_prev2,`OBV: ${fa(c.obv_prev2)} ← ${fa(c.obv_prev1)} ← ${fa(c.obv)}`);
    case 'OBV_BREAK_HIGH':{const high=c[`obv_high_${Number(p.periods||10)}`];if(![c.obv,high].every(finite))return insufficient('سقف OBV: داده کافی موجود نیست.');return result(c.obv>high,`OBV ${fa(c.obv)}؛ سقف ${p.periods||10} کندل ${fa(high)}`);}
    case 'OBV_HOLD_RECENT_LOW':if(![c.obv,c.obv_low_10].every(finite))return insufficient('کف ۱۰ کندل OBV: داده کافی موجود نیست.');return result(c.obv>=c.obv_low_10,`OBV ${fa(c.obv)}؛ کف ۱۰ کندل ${fa(c.obv_low_10)}`);
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
    case 'BUY_QUEUE_VALUE_CHANGE_15M_ABOVE':return queueChange(market,market15m,'buy_queue_value',p.value??30,'صف خرید');
    case 'SELL_QUEUE_VALUE_CHANGE_15M_ABOVE':return queueChange(market,market15m,'sell_queue_value',p.value??30,'صف فروش');
    case 'TECH_RECOVERY_STRONG':return recoveryScore(c,p.value??5,'قوی');
    case 'TECH_RECOVERY_VERY_STRONG':return recoveryScore(c,p.value??6,'بسیار قوی');
    default:return insufficient(`Condition ناشناخته است: ${condition.name}`);
  }
}

function evaluateThreshold(condition,current,previous,key,label,value){if(!finite(current[key]))return insufficient(`${label}: داده کافی موجود نیست.`);const cross=condition.name.includes('CROSS'),above=condition.name.endsWith('ABOVE');if(cross&&!finite(previous[key]))return insufficient(`${label} قبلی موجود نیست.`);return result(cross?compare(current[key],previous[key],above?'cross_above':'cross_below',value):compare(current[key],null,above?'above':'below',value),`${label}: ${fa(previous[key])} ← ${fa(current[key])}؛ سطح ${fa(value)}`);}
function macdEarly(c){if(![c.macd_hist,c.macd_hist_prev1,c.macd_hist_prev2].every(finite))return insufficient('MACD Histogram: داده کافی موجود نیست.');return result(c.macd_hist<0&&c.macd_hist>c.macd_hist_prev1&&c.macd_hist_prev1>c.macd_hist_prev2,`MACD Hist: ${fa(c.macd_hist_prev2)} ← ${fa(c.macd_hist_prev1)} ← ${fa(c.macd_hist)}`);}
function marketThreshold(market,key,op,value,label){if(!finite(market[key]))return insufficient(`${label}: داده کافی موجود نیست.`);const active=op==='>='?market[key]>=value:op==='<='?market[key]<=value:op==='>'?market[key]>value:market[key]<value;return result(active,`${label}: ${fa(market[key])}`);}
function queueChange(current,previous,key,threshold,label){if(![current[key],previous[key]].every(finite)||Number(previous[key])<=0)return insufficient(`${label}: سابقه معتبر ۱۵ دقیقه‌ای موجود نیست.`);const change=(Number(current[key])/Number(previous[key])-1)*100;return result(change>=threshold,`${label}: تغییر ۱۵دقیقه‌ای ${fa(change)}٪`);}
function recoveryScore(c,threshold,label){const required=['macd_hist','macd_hist_prev1','macd_hist_prev2','rsi14','mfi14','obv','obv_prev1','obv_prev2','volume_ratio_20','buyer_power','price','ema20','ema50'];if(!required.every(key=>finite(c[key])))return insufficient('امتیاز بازیابی: داده کافی موجود نیست.');const score=Number(c.macd_hist<0&&c.macd_hist>c.macd_hist_prev1&&c.macd_hist_prev1>c.macd_hist_prev2)+Number(c.rsi14>50)+Number(c.mfi14>50)+Number(c.obv>c.obv_prev1&&c.obv_prev1<=c.obv_prev2)+Number(c.volume_ratio_20>1.3)+Number(c.buyer_power>1.2)+Number(c.price>c.ema20)+Number(c.ema20>c.ema50);return result(score>=threshold,`امتیاز بازیابی ${label}: ${score} از ۸`,{score});}
function all(children){const state=children.some(x=>x.state==='inactive')?'inactive':children.some(x=>x.state==='insufficient')?'insufficient':'active';return {state,description:'همه شروط',children};}

export function evaluateRuleExpression(expression,context){
  if(expression.type==='condition')return evaluateCondition(expression,context);
  const children=(expression.children||[]).map(child=>evaluateRuleExpression(child,context));if(!children.length)return insufficient('Rule هیچ شرطی ندارد.');
  const logic=expression.logic||expression.op||'AND';let state,values={};
  if(logic==='AND')state=children.some(x=>x.state==='inactive')?'inactive':children.some(x=>x.state==='insufficient')?'insufficient':'active';
  else if(logic==='OR')state=children.some(x=>x.state==='active')?'active':children.some(x=>x.state==='insufficient')?'insufficient':'inactive';
  else {const required=Number(expression.minMatches),matches=children.filter(x=>x.state==='active').length,possible=matches+children.filter(x=>x.state==='insufficient').length;state=matches>=required?'active':possible<required?'inactive':'insufficient';values={matches,required};}
  return {state,description:logic,values,children};
}

export function buildMarketContext(rows,index=null){
  const universe=rows.filter(x=>x.lastPrice>0&&!/(اختیار|آتی|اوراق|صندوق|حق تقدم|تسهیلات)/.test(`${x.market} ${x.name}`)),positive=universe.filter(x=>x.changePct>0).length,negative=universe.filter(x=>x.changePct<0).length,powers=universe.map(x=>x.buyerPower).filter(x=>finite(x)&&x>0).sort((a,b)=>a-b),median=powers.length?(powers[Math.floor((powers.length-1)/2)]+powers[Math.ceil((powers.length-1)/2)])/2:null,totalValue=universe.reduce((sum,x)=>sum+Number(x.tradeValue||0),0),buyQueue=universe.filter(x=>x.buyQueueValue>0),sellQueue=universe.filter(x=>x.sellQueueValue>0);
  const indexBase=index&&finite(index.equalWeight)&&finite(index.equalWeightChange)?index.equalWeight-index.equalWeightChange:null;
  return {market_total_count:universe.length,market_positive_count:positive,market_negative_count:negative,market_positive_pct:universe.length?positive/universe.length*100:null,market_negative_pct:universe.length?negative/universe.length*100:null,market_total_value:totalValue,market_retail_value:universe.reduce((sum,x)=>sum+Number(x.buyVolumeReal||0)*Number(x.closePrice||x.lastPrice||0),0),market_real_money_flow:universe.reduce((sum,x)=>sum+(Number(x.buyVolumeReal||0)-Number(x.sellVolumeReal||0))*Number(x.closePrice||x.lastPrice||0),0),market_median_buyer_power:median,buy_queue_count:buyQueue.length,sell_queue_count:sellQueue.length,buy_queue_value:buyQueue.reduce((s,x)=>s+x.buyQueueValue,0),sell_queue_value:sellQueue.reduce((s,x)=>s+x.sellQueueValue,0),equal_weight_index:index?.equalWeight??null,equal_weight_change_pct:indexBase?index.equalWeightChange/indexBase*100:null,main_index:index?.index??null,main_index_change_pct:index&&index.index-index.indexChange?index.indexChange/(index.index-index.indexChange)*100:null};
}

function addMarketHistory(context,history,now=new Date()){
  const dayOf=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(new Date(value)),today=dayOf(now),daily=new Map();
  for(const row of history){const day=dayOf(row.observed_at);if(day===today||daily.has(day)||!finite(row.market_retail_value))continue;daily.set(day,Number(row.market_retail_value));if(daily.size===20)break;}
  const values=[...daily.values()];context.avg_retail_value_20d=values.length===20?values.reduce((sum,value)=>sum+value,0)/values.length:null;context.market_value_ratio_20=finite(context.avg_retail_value_20d)&&context.avg_retail_value_20d>0?context.market_retail_value/context.avg_retail_value_20d:null;context.market_retail_value_ratio_20d=context.market_value_ratio_20;return context;
}

export class RuleEngineV2{
  constructor(config,db,marketData,runtime){this.config=config;this.db=db;this.marketData=marketData;this.runtime=runtime;this.running=false;this.lastRunAt=null;this.lastError=null;}
  async run({includeSnapshot=false}={}){
    if(this.running)return {skipped:true};this.running=true;
    try{
      const rules=this.db.dueRulesV2();if(!rules.length)return {rules:0,results:[]};
      const rows=await this.marketData.marketRows(),index=rules.some(rule=>rule.scope==='MARKET')?await this.marketData.marketIndex():null;
      const bySymbol=new Map(rows.map(x=>[x.symbol,x])),now=new Date(),history=this.db.marketSnapshotHistory();
      const market=addMarketHistory(buildMarketContext(rows,index),history,now);
      const market15m=this.db.marketContextBefore(new Date(now.getTime()-15*60000).toISOString(),new Date(now.getTime()-20*60000).toISOString())||{};
      const riskOff=evaluateCondition({name:'MARKET_RISK_OFF'},{market}).state==='active';
      const results=[],contexts=new Map(),batchId=`${rows[0]?.date||'live'}:${rows[0]?.time||Math.floor(Date.now()/300000)}`;
      this.db.addMarketSnapshot(batchId,market);
      for(const rule of rules){
        let context;
        if(rule.scope==='MARKET')context={market,market15m,current:market,previous:this.db.previousMarketContext()||{}};
        else{if(!contexts.has(rule.symbol))contexts.set(rule.symbol,await this.marketData.ruleContext(rule.symbol,bySymbol.get(rule.symbol),market));context=contexts.get(rule.symbol);}
        const executable=rule.actionParams?.executableOnly===true;
        const savedCash=executable?this.db.getDataState('account:cash'):null;
        const reservation=executable?this.db.getDataState('account:reservations'):null;
        const reservedToman=reservation&&savedCash&&reservation.cashUpdatedAt===savedCash.updatedAt?Number(reservation.totalToman||0):0;
        const cash=savedCash?{...savedCash,availableToman:Number(savedCash.availableToman)-reservedToman}:null;
        const order=executable?resolveActionableOrder(rule,context,cash):null;
        const evaluated=evaluateRuleExpression(rule.expression,context);
        // An active analysis without a valid order is not an actionable signal.
        if(executable&&(!order||(riskOff&&rule.action==='BUY_ALERT')||!isMarketWindow(this.config.marketSchedule||{timeZone:'Asia/Tehran',start:'09:00',end:'12:30'},now))&&evaluated.state==='active')evaluated.state='insufficient';
        const state=this.db.ruleStateV2(rule.id),transition=evaluated.state==='active'&&state?.state==='inactive';
        const tehranDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(now);
        const cooldownOk=!state?.last_notified_at||Date.now()-Date.parse(state.last_notified_at)>=rule.cooldownMinutes*60000;
        const dayOk=!rule.oncePerDay||state?.last_triggered_day!==tehranDay;
        const notify=transition&&cooldownOk&&dayOk&&rule.actionParams?.silent!==true;
        const buySeverity=['BUY','STRONG_BUY'].includes(rule.severity);
        const effectiveSeverity=riskOff&&rule.severity==='STRONG_BUY'?'BUY':riskOff&&rule.severity==='BUY'?'WATCH':rule.severity;
        let sent=false;
        if(notify){const message=executable?`${order.text}\n\n${rule.name}\nقیمت تابلو: ${fa(context.current?.price)} ریال\nاین پیام سفارش خودکار نیست.`:this.formatAlert(rule,context,evaluated,effectiveSeverity,riskOff&&buySeverity);
          const delivery=await sendTelegramMany(this.runtime.telegramTargets(),message);sent=!delivery.skipped;}
        if(notify&&executable&&!sent)evaluated.state='insufficient';
        if(sent&&executable&&order.side==='خرید')this.db.setDataState('account:reservations',{
          cashUpdatedAt:savedCash.updatedAt,totalToman:reservedToman+order.amountToman
        });
        this.db.recordRuleResultV2(rule,evaluated,context,sent,notify?tehranDay:null,effectiveSeverity);
        results.push({ruleId:rule.ruleId,state:evaluated.state,effectiveSeverity,telegramSent:sent});
      }
      this.lastRunAt=new Date().toISOString();this.lastError=null;return {rules:rules.length,riskOff,results,...(includeSnapshot?{snapshot:{rows,market,contexts,riskOff}}:{})};
    }catch(error){this.lastError=error.message;throw error;}finally{this.running=false;}
  }
  formatAlert(rule,context,evaluation,effectiveSeverity=rule.severity,downgraded=false){const evidence=[];const walk=node=>{if(node.description&&node.type!=='group')evidence.push(`• ${node.description}`);(node.children||[]).forEach(walk);};walk(evaluation);const c=context.current||{},custom=rule.actionParams?.message,priority=rule.actionParams?.priority;return [`🚨 ${rule.symbol||'کل بازار'}`,custom||rule.name,priority?`اولویت: ${priority}`:null,`شدت: ${effectiveSeverity}`,`اقدام: ${rule.action}`,downgraded?'⚠️ هشدار خرید به‌علت وضعیت ریسک بازار یک سطح کاهش یافت.':null,finite(c.price)?`قیمت: ${fa(c.price)} ریال`:null,'',...evidence.slice(0,8),'','این پیام تصمیم‌یار است و سفارش واقعی ثبت نشده است.'].filter(x=>x!=null).join('\n');}
}
