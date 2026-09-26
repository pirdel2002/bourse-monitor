import {buildIndicatorAnalysis} from './indicator-engine.js';

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const n=value=>finite(value)?Number(value):null;
const ratio=(a,b)=>finite(a)&&finite(b)&&Number(b)>0?Number(a)/Number(b):null;
const round=(value,digits=2)=>finite(value)?Number(Number(value).toFixed(digits)):null;
const excludedMarketText=/(اختیار|آتی|اوراق|حق تقدم|تسهیلات|اخزا|گواهی سپرده)/;

function isMarketShare(row){
  return n(row.lastPrice||row.closePrice)>0&&!excludedMarketText.test(`${row.symbol||''} ${row.name||''} ${row.market||''}`);
}

function normalizeItem(db,row,position=null){
  const history=db.candles(row.symbol,160),analysis=buildIndicatorAnalysis(history,row),context=analysis.context||{},signals=analysis.signals||{};
  const price=n(context.price)||n(row.lastPrice)||n(row.closePrice),volume=n(context.volume)||n(row.volume)||0;
  const volumeRatio=n(context.volume_ratio_20)||ratio(row.volume,row.avgVolume30),buyerPower=n(context.buyer_power)??(row.hasBuyerPowerData===false?null:n(row.buyerPower));
  const distanceHigh20=finite(context.high_20)&&Number(context.high_20)>0&&finite(price)?(Number(context.high_20)-price)/Number(context.high_20)*100:null;
  const distanceLow20=finite(context.low_20)&&Number(context.low_20)>0&&finite(price)?(price-Number(context.low_20))/Number(context.low_20)*100:null;
  const distanceEma20=finite(context.ema20)&&Number(context.ema20)>0&&finite(price)?(price/Number(context.ema20)-1)*100:null;
  const obvUp=Boolean(signals.obv_turn_up)||(finite(context.obv)&&finite(context.obv_prev1)&&Number(context.obv)>Number(context.obv_prev1));
  const obvDown=finite(context.obv)&&finite(context.obv_prev1)&&Number(context.obv)<Number(context.obv_prev1);
  const histImproving=finite(context.macd_hist)&&finite(context.macd_hist_prev1)&&Number(context.macd_hist)>Number(context.macd_hist_prev1);
  const macdBear=finite(context.macd_hist)&&finite(context.macd_hist_prev1)&&Number(context.macd_hist)<0&&Number(context.macd_hist_prev1)>=0;
  const weakness=[macdBear,obvDown,finite(context.ema20)&&finite(context.close)&&Number(context.close)<Number(context.ema20),finite(buyerPower)&&buyerPower<.8,finite(context.real_money_flow)&&Number(context.real_money_flow)<0].filter(Boolean).length;
  const flowPositive=(finite(volumeRatio)&&volumeRatio>=1.2)||(finite(buyerPower)&&buyerPower>=1.2)||(finite(context.real_money_flow)&&Number(context.real_money_flow)>0);
  const noChase=(!finite(context.return_5d)||Number(context.return_5d)<=10)&&(!finite(context.return_20d)||Number(context.return_20d)<=25)&&(!finite(distanceEma20)||distanceEma20<=8);
  const profitPct=position&&finite(price)&&Number(position.avg_price)>0?(price/Number(position.avg_price)-1)*100:null;
  const quality=[finite(context.tech_recovery_score)?Number(context.tech_recovery_score)>=4:false,finite(buyerPower)?buyerPower>=1:false,finite(volumeRatio)?volumeRatio>=.8:false,finite(context.ema20)&&finite(price)?price>=Number(context.ema20):false,!obvDown].filter(Boolean).length;
  return {
    symbol:row.symbol,name:row.name||row.symbol,price,changePct:n(row.changePct),volume,tradeValue:n(row.tradeValue),volumeRatio:round(volumeRatio),buyerPower:round(buyerPower),buyQueueValue:n(row.buyQueueValue)||0,sellQueueValue:n(row.sellQueueValue)||0,pe:n(row.pe),groupPe:n(row.groupPe),eps:n(row.eps),market:row.market||'',industry:row.industry||'',valid:analysis.valid,candleCount:analysis.candleCount||0,
    ema20:n(context.ema20),ema50:n(context.ema50),rsi14:n(context.rsi14),mfi14:n(context.mfi14),macdHist:n(context.macd_hist),return5:n(context.return_5d),return20:n(context.return_20d),high20:n(context.high_20),low20:n(context.low_20),techScore:n(context.tech_recovery_score),realMoneyFlow:n(context.real_money_flow),distanceHigh20:round(distanceHigh20),distanceLow20:round(distanceLow20),distanceEma20:round(distanceEma20),macdRecovery:Boolean(signals.macd_recovery_early),macdBullish:Boolean(signals.macd_bullish_cross),histImproving,obvUp,obvDown,weakness,flowPositive,noChase,quality,position:position?{quantity:Number(position.quantity),avgPrice:Number(position.avg_price),profitPct:round(profitPct),stopPrice:n(position.stop_price),targetPrice:n(position.target_price)}:null
  };
}

const reason=(label,value,suffix='')=>finite(value)?`${label}: ${round(value)}${suffix}`:null;
const compact=(item,reasons,score)=>({...item,score:round(score),reasons:reasons.filter(Boolean).slice(0,4)});
const category=(key,title,description,tone,items,filter,score,reasons)=>({key,title,description,tone,items:items.filter(filter).map(item=>compact(item,reasons(item),score(item))).sort((a,b)=>b.score-a.score).slice(0,10)});

function categories(items,scope){
  const valid=items.filter(x=>x.valid),withPrice=items.filter(x=>finite(x.price)&&x.price>0),portfolio=items.filter(x=>x.position);
  return [
    category('volume','بیشترین حجم معامله','رتبه بر اساس تعداد سهم معامله‌شده؛ نسبت حجم نیز نمایش داده می‌شود.','info',withPrice,x=>x.volume>0,x=>x.volume,x=>[reason('حجم',x.volume),reason('نسبت به ۲۰روز',x.volumeRatio,'×'),reason('تغییر',x.changePct,'٪')]),
    category('buy_queue','بیشترین صف خرید','ارزش صف خرید از ردیف اول سفارش‌ها.','positive',withPrice,x=>x.buyQueueValue>0,x=>x.buyQueueValue,x=>[reason('ارزش صف',x.buyQueueValue,' ریال'),reason('قدرت خریدار',x.buyerPower),reason('تغییر',x.changePct,'٪')]),
    category('sell_queue','بیشترین صف فروش','ارزش صف فروش از ردیف اول سفارش‌ها.','negative',withPrice,x=>x.sellQueueValue>0,x=>x.sellQueueValue,x=>[reason('ارزش صف',x.sellQueueValue,' ریال'),reason('قدرت خریدار',x.buyerPower),reason('تغییر',x.changePct,'٪')]),
    category('buy_candidate','کاندید خرید','روند کوتاه‌مدت، حداقل یک شاهد مشارکت و محدودیت تعقیب قیمت.','positive',valid,x=>x.price>x.ema20&&x.techScore>=5&&x.flowPositive&&x.noChase&&x.rsi14<70,x=>x.techScore*15+(x.volumeRatio||0)*8+(x.buyerPower||0)*6-Math.max(0,x.return5||0),x=>[reason('امتیاز بازیابی',x.techScore,'/۸'),reason('حجم',x.volumeRatio,'×'),reason('قدرت خریدار',x.buyerPower),reason('بازده ۵روزه',x.return5,'٪')]),
    category('sell_candidate','کاندید فروش/کاهش','حداقل دو شاهد ضعف؛ برای کل بازار به معنی اجتناب یا بررسی خروج است.','negative',valid,x=>x.weakness>=2,x=>x.weakness*25+Math.max(0,-(x.changePct||0))*4+(x.volumeRatio||0),x=>[`${x.weakness} شاهد ضعف`,reason('قدرت خریدار',x.buyerPower),reason('حجم',x.volumeRatio,'×'),reason('بازده ۵روزه',x.return5,'٪')]),
    category('accumulation','انباشت؛ هنوز زود است','جریان آرام مثبت نزدیک EMA20، بدون شکست معتبر یا جهش قیمت.','watch',valid,x=>x.obvUp&&x.mfi14>=45&&x.mfi14<=70&&Math.abs(x.distanceEma20||99)<=5&&x.volumeRatio>=.7&&x.volumeRatio<1.5&&(x.return20||0)<=12&&x.distanceHigh20>=0,x=>80-Math.abs(x.distanceEma20)*5+(x.mfi14-45)+(x.buyerPower||0)*5,x=>['OBV رو به بالا',reason('MFI',x.mfi14),reason('فاصله EMA20',x.distanceEma20,'٪'),reason('حجم',x.volumeRatio,'×')]),
    category('early_reversal','اولین شواهد برگشت','بهبود MACD یا برگشت OBV در ناحیه‌ای که هنوز حرکت بزرگ انجام نشده است.','watch',valid,x=>(x.macdRecovery||x.obvUp)&&x.rsi14>=30&&x.rsi14<=58&&(x.return5||0)<=5,x=>Number(x.macdRecovery)*35+Number(x.obvUp)*30+(x.rsi14||0)-(x.return5||0)*2,x=>[x.macdRecovery?'MACD در حال خروج از اصلاح':null,x.obvUp?'OBV برگشته است':null,reason('RSI',x.rsi14),reason('بازده ۵روزه',x.return5,'٪')]),
    category('near_breakout','نزدیک شکست','حداکثر ۳٪ زیر سقف ۲۰روزه با مشارکت قابل‌قبول.','watch',valid,x=>x.distanceHigh20>=0&&x.distanceHigh20<=3&&x.volumeRatio>=.8&&(x.buyerPower==null||x.buyerPower>=1),x=>100-x.distanceHigh20*20+(x.volumeRatio||0)*5+(x.buyerPower||0)*4,x=>[reason('فاصله تا سقف۲۰',x.distanceHigh20,'٪'),reason('حجم',x.volumeRatio,'×'),reason('قدرت خریدار',x.buyerPower)]),
    category('breakout_enterable','شکست معتبر؛ هنوز قابل ورود','عبور از سقف ۲۰روزه با حجم و قدرت خریدار، بدون نقض No-Chase.','positive',valid,x=>x.distanceHigh20<0&&x.volumeRatio>=1.5&&x.buyerPower>=1.2&&x.noChase,x=>120+Math.abs(x.distanceHigh20)*3+(x.volumeRatio||0)*8+(x.buyerPower||0)*6,x=>[reason('عبور از سقف۲۰',Math.abs(x.distanceHigh20),'٪'),reason('حجم',x.volumeRatio,'×'),reason('قدرت خریدار',x.buyerPower),'No-Chase: پاس']),
    category('next_wave','استراحت سالم؛ آماده موج بعدی','حرکت قبلی متوسط، اصلاح کوتاه سالم و بازگشت مومنتوم در روند صعودی.','positive',valid,x=>x.ema20>x.ema50&&x.return20>=5&&x.return20<=25&&x.return5>=-6&&x.return5<=4&&x.distanceEma20>=-3&&(x.macdRecovery||x.obvUp)&&x.rsi14>=40&&x.rsi14<=65,x=>100+(x.return20||0)-Math.abs(x.return5||0)*3+Number(x.macdRecovery)*15+Number(x.obvUp)*15,x=>[reason('بازده۲۰روزه',x.return20,'٪'),reason('اصلاح۵روزه',x.return5,'٪'),x.macdRecovery?'MACD رو به بهبود':null,x.obvUp?'OBV رو به بالا':null]),
    category('second_tranche','پله دوم برای دارایی موجود','فقط سبد؛ روند حفظ شده و شواهد بازیابی/مشارکت وجود دارد.','positive',portfolio.filter(x=>x.valid),x=>x.position.profitPct>=-8&&x.position.profitPct<=12&&x.price>x.ema20&&x.techScore>=4&&x.flowPositive&&x.noChase,x=>100+x.techScore*10+(x.volumeRatio||0)*5+(x.buyerPower||0)*5-Math.abs(x.position.profitPct),x=>[reason('سود/زیان',x.position.profitPct,'٪'),reason('امتیاز بازیابی',x.techScore,'/۸'),reason('حجم',x.volumeRatio,'×'),reason('قدرت خریدار',x.buyerPower)]),
    category('do_not_chase','حرکت انجام شده؛ تعقیب نکن','بازده تند یا فاصله زیاد از EMA20؛ ورود جدید پرریسک است.','negative',valid,x=>x.noChase===false||x.rsi14>=72,x=>Math.max(0,x.return5||0)*5+Math.max(0,x.return20||0)*2+Math.max(0,x.distanceEma20||0)*3+(x.rsi14||0),x=>[reason('بازده۵روزه',x.return5,'٪'),reason('بازده۲۰روزه',x.return20,'٪'),reason('فاصله EMA20',x.distanceEma20,'٪'),reason('RSI',x.rsi14)]),
    category('low_quality','فاقد کیفیت فعلی','ترکیب نقدشوندگی/مومنتوم/جریان ضعیف؛ لزوماً شرکت بدی نیست.','negative',valid,x=>x.quality<=2,x=>100-x.quality*20+Math.max(0,-(x.changePct||0))*3,x=>[`${x.quality} معیار مثبت از ۵`,reason('قدرت خریدار',x.buyerPower),reason('حجم',x.volumeRatio,'×'),x.obvDown?'OBV نزولی':null]),
    category('possible_bottom','کف‌زنی احتمالی','نزدیکی کف ۲۰روزه با RSI پایین و کاهش فشار منفی MACD.','watch',valid,x=>x.distanceLow20>=0&&x.distanceLow20<=5&&x.rsi14>=28&&x.rsi14<=45&&x.histImproving&&!x.obvDown,x=>100-x.distanceLow20*10+(45-x.rsi14)+Number(x.histImproving)*15,x=>[reason('فاصله از کف۲۰',x.distanceLow20,'٪'),reason('RSI',x.rsi14),'هیستوگرام MACD بهتر شده','OBV کف جدید نزده است']),
    category('low_pe','P/E پایین و ارزان نسبی','غربال اولیه بر مبنای P/E مثبت و تخفیف نسبت به گروه؛ جای تحلیل بنیادی را نمی‌گیرد.','info',withPrice,x=>x.eps>0&&x.pe>0&&((x.groupPe>0&&x.pe<=x.groupPe*.85)||x.pe<=6),x=>200-x.pe*10+(x.groupPe>0?(x.groupPe-x.pe)*5:0),x=>[reason('P/E',x.pe),reason('P/E گروه',x.groupPe),reason('EPS',x.eps)]),
    category('positive_volume','مثبت پرحجم','قیمت مثبت با حجم حداقل ۱٫۵ برابر میانگین ۲۰روزه.','positive',valid,x=>x.changePct>0&&x.volumeRatio>=1.5,x=>x.changePct*15+x.volumeRatio*12+(x.buyerPower||0)*5,x=>[reason('تغییر',x.changePct,'٪'),reason('حجم',x.volumeRatio,'×'),reason('قدرت خریدار',x.buyerPower)]),
    category('buyer_power','بیشترین قدرت خریدار','قدرت سرانه خریدار حقیقی نسبت به فروشنده حقیقی.','positive',withPrice,x=>x.buyerPower>0,x=>x.buyerPower,x=>[reason('قدرت خریدار',x.buyerPower),reason('حجم',x.volumeRatio,'×'),reason('تغییر',x.changePct,'٪')]),
    category('money_inflow','بیشترین ورود پول حقیقی','برآورد محلی از اختلاف حجم خرید و فروش حقیقی ضرب‌در قیمت.','positive',valid,x=>x.realMoneyFlow>0,x=>x.realMoneyFlow,x=>[reason('ورود پول',x.realMoneyFlow,' ریال'),reason('قدرت خریدار',x.buyerPower),reason('حجم',x.volumeRatio,'×')]),
    category('portfolio_risk','ریسک خروج سبد','فقط سبد؛ حداقل دو شاهد ضعف یا برخورد با حد ثبت‌شده.','negative',portfolio,x=>x.weakness>=2||(x.position.stopPrice&&x.price<=x.position.stopPrice),x=>(x.position.stopPrice&&x.price<=x.position.stopPrice?200:0)+x.weakness*30+Math.max(0,-x.position.profitPct),x=>[reason('سود/زیان',x.position.profitPct,'٪'),`${x.weakness} شاهد ضعف`,x.position.stopPrice?`حد ثبت‌شده: ${x.position.stopPrice}`:null,x.position.stopPrice&&x.price<=x.position.stopPrice?'حد فعال شده است':null])
  ].filter(report=>scope==='portfolio'||!['second_tranche','portfolio_risk'].includes(report.key));
}

export function buildMarketDashboard(db,rows,{scope='market'}={}){
  const positions=db.portfolioPositions(),positionsBySymbol=new Map(positions.map(position=>[position.symbol,position])),liveBySymbol=new Map(rows.map(row=>[row.symbol,row]));
  let universe;
  if(scope==='portfolio'){
    const overviewBySymbol=new Map(db.portfolioOverview().positions.map(position=>[position.symbol,position]));
    universe=positions.map(position=>{const live=liveBySymbol.get(position.symbol);if(live)return live;const detail=db.symbolDetail(position.symbol)||{symbol:position.symbol,name:position.symbol},history=db.candles(position.symbol,2),latest=history.at(-1),previous=history.at(-2),overview=overviewBySymbol.get(position.symbol),price=n(overview?.current_price)||n(latest?.close)||n(detail.lastPrice)||n(detail.closePrice);return{...detail,lastPrice:price,closePrice:price,date:overview?.price_date||latest?.date||detail.date||'',volume:n(latest?.volume)||0,changePct:latest&&previous&&Number(previous.close)>0?(Number(latest.close)/Number(previous.close)-1)*100:null,hasBuyerPowerData:false,hasOrderBookData:false,buyerPower:null,buyQueueValue:0,sellQueueValue:0};});
  }
  else universe=rows.filter(isMarketShare);
  const items=universe.map(row=>normalizeItem(db,row,positionsBySymbol.get(row.symbol)||null));
  const powers=items.map(x=>x.buyerPower).filter(finite).sort((a,b)=>a-b),median=powers.length?(powers[Math.floor((powers.length-1)/2)]+powers[Math.ceil((powers.length-1)/2)])/2:null;
  const positive=items.filter(x=>x.changePct>0).length,negative=items.filter(x=>x.changePct<0).length,totalValue=items.reduce((sum,x)=>sum+Number(x.tradeValue||0),0),buyQueues=items.filter(x=>x.buyQueueValue>0),sellQueues=items.filter(x=>x.sellQueueValue>0);
  return {scope,generatedAt:new Date().toISOString(),snapshot:{date:rows[0]?.date||null,time:rows[0]?.time||null},summary:{universeCount:items.length,analyzedCount:items.filter(x=>x.valid).length,insufficientCount:items.filter(x=>!x.valid).length,positivePct:items.length?round(positive/items.length*100):null,negativePct:items.length?round(negative/items.length*100):null,totalTradeValue:totalValue,medianBuyerPower:round(median),buyQueueCount:buyQueues.length,sellQueueCount:sellQueues.length,buyQueueValue:buyQueues.reduce((sum,x)=>sum+x.buyQueueValue,0),sellQueueValue:sellQueues.reduce((sum,x)=>sum+x.sellQueueValue,0)},categories:categories(items,scope)};
}
