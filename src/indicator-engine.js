const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const round=(value,digits=4)=>finite(value)?Number(Number(value).toFixed(digits)):null;
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;

export function sma(values,period){
  if(values.length<period)return null;
  return mean(values.slice(-period));
}

export function emaSeries(values,period){
  const out=Array(values.length).fill(null);if(values.length<period)return out;
  let current=mean(values.slice(0,period)),multiplier=2/(period+1);out[period-1]=current;
  for(let index=period;index<values.length;index++){current=(values[index]-current)*multiplier+current;out[index]=current;}
  return out;
}

export function rsiSeries(values,period=14){
  const out=Array(values.length).fill(null);if(values.length<=period)return out;
  let gain=0,loss=0;for(let i=1;i<=period;i++){const change=values[i]-values[i-1];gain+=Math.max(0,change);loss+=Math.max(0,-change);}
  let avgGain=gain/period,avgLoss=loss/period;out[period]=avgLoss===0?100:100-(100/(1+avgGain/avgLoss));
  for(let i=period+1;i<values.length;i++){const change=values[i]-values[i-1];avgGain=(avgGain*(period-1)+Math.max(0,change))/period;avgLoss=(avgLoss*(period-1)+Math.max(0,-change))/period;out[i]=avgLoss===0?100:100-(100/(1+avgGain/avgLoss));}
  return out;
}

export function atrSeries(candles,period=14){
  const tr=candles.map((candle,index)=>index===0?candle.high-candle.low:Math.max(candle.high-candle.low,Math.abs(candle.high-candles[index-1].close),Math.abs(candle.low-candles[index-1].close)));
  const out=Array(candles.length).fill(null);if(tr.length<period)return out;let value=mean(tr.slice(0,period));out[period-1]=value;
  for(let i=period;i<tr.length;i++){value=(value*(period-1)+tr[i])/period;out[i]=value;}return out;
}

export function mfiSeries(candles,period=14){
  const typical=candles.map(x=>(x.high+x.low+x.close)/3),positive=Array(candles.length).fill(0),negative=Array(candles.length).fill(0),out=Array(candles.length).fill(null);
  for(let i=1;i<candles.length;i++){const flow=typical[i]*candles[i].volume;if(typical[i]>typical[i-1])positive[i]=flow;else if(typical[i]<typical[i-1])negative[i]=flow;}
  for(let i=period;i<candles.length;i++){const pos=positive.slice(i-period+1,i+1).reduce((a,b)=>a+b,0),neg=negative.slice(i-period+1,i+1).reduce((a,b)=>a+b,0);out[i]=neg===0?(pos>0?100:50):100-(100/(1+pos/neg));}return out;
}

export function obvSeries(candles){
  const out=Array(candles.length).fill(0);for(let i=1;i<candles.length;i++)out[i]=out[i-1]+(candles[i].close>candles[i-1].close?candles[i].volume:candles[i].close<candles[i-1].close?-candles[i].volume:0);return out;
}

function std(values){const avg=mean(values);return Math.sqrt(mean(values.map(value=>(value-avg)**2)));}
function lastFinite(series,offset=0){const values=series.filter(finite);return values.length>offset?Number(values.at(-1-offset)):null;}
function percentDistance(price,level){return finite(price)&&finite(level)&&Number(level)!==0?(Number(price)/Number(level)-1)*100:null;}

export function normalizeCandle(candle){return {date:String(candle.date||''),open:Number(candle.open||0),high:Number(candle.high||0),low:Number(candle.low||0),close:Number(candle.close||0),volume:Number(candle.volume||0)};}

export function makeLiveCandle(row){
  const close=Number(row.closePrice)>0?Number(row.closePrice):Number(row.lastPrice);
  return normalizeCandle({date:row.date||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(new Date()),open:row.openPrice||close,high:row.dayHigh||Math.max(row.openPrice||close,close),low:row.dayLow||Math.min(row.openPrice||close,close),close,volume:row.volume});
}

export function buildIndicatorAnalysis(history,liveRow=null){
  let candles=(history||[]).map(normalizeCandle).filter(x=>x.date&&x.close>0&&x.high>0&&x.low>0).sort((a,b)=>a.date.localeCompare(b.date));
  candles=candles.filter((x,index)=>index===candles.length-1||x.date!==candles[index+1]?.date);
  if(liveRow){const live=makeLiveCandle(liveRow);candles=candles.filter(x=>x.date!==live.date);candles.push(live);}
  if(candles.length<2)return {valid:false,reason:'برای محاسبه اندیکاتورها حداقل دو کندل لازم است.',candleCount:candles.length};
  const closes=candles.map(x=>x.close),volumes=candles.map(x=>x.volume),ema20s=emaSeries(closes,20),ema50s=emaSeries(closes,50),ema12=emaSeries(closes,12),ema26=emaSeries(closes,26);
  const macdLine=closes.map((_,i)=>finite(ema12[i])&&finite(ema26[i])?ema12[i]-ema26[i]:null),macdValues=macdLine.filter(finite),macdSignalValues=emaSeries(macdValues,9),macdSignal=Array(closes.length).fill(null);let signalIndex=0;
  for(let i=0;i<macdLine.length;i++)if(finite(macdLine[i]))macdSignal[i]=macdSignalValues[signalIndex++];
  const macdHist=macdLine.map((value,i)=>finite(value)&&finite(macdSignal[i])?value-macdSignal[i]:null),rsi=rsiSeries(closes),mfi=mfiSeries(candles),obv=obvSeries(candles),atr=atrSeries(candles),last=closes.at(-1),window20=closes.slice(-20),middle=window20.length===20?mean(window20):null,deviation=window20.length===20?std(window20):null,bbw=finite(middle)&&middle!==0?deviation*4/middle:null,volumeSma20=volumes.length>20?mean(volumes.slice(-21,-1)):volumes.length>=20?mean(volumes.slice(-20)):null;
  const ema20=lastFinite(ema20s),ema50=lastFinite(ema50s),rsi14=lastFinite(rsi),mfi14=lastFinite(mfi),macd_line=lastFinite(macdLine),macd_signal=lastFinite(macdSignal),macd_hist=lastFinite(macdHist),macd_hist_prev1=lastFinite(macdHist,1),macd_hist_prev2=lastFinite(macdHist,2),obvNow=lastFinite(obv),atr14=lastFinite(atr),atrPrev=lastFinite(atr,1),atr5=mean(atr.filter(finite).slice(-5));
  const high=n=>obv.length>n?Math.max(...obv.slice(-(n+1),-1)):null;
  const context={
    price:Number(liveRow?.lastPrice||last),close:last,open:candles.at(-1).open,high:candles.at(-1).high,low:candles.at(-1).low,volume:candles.at(-1).volume,value:Number(liveRow?.tradeValue||0),trade_count:Number(liveRow?.tradeCount||0),
    ema20:round(ema20),ema50:round(ema50),ema20_ema50_gap_pct:round(finite(ema20)&&finite(ema50)&&ema50!==0?Math.abs(ema20-ema50)/ema50*100:null),rsi14:round(rsi14),
    macd_line:round(macd_line),macd_signal:round(macd_signal),macd_hist:round(macd_hist),macd_hist_prev1:round(macd_hist_prev1),macd_hist_prev2:round(macd_hist_prev2),macd_hist_slope:round(finite(macd_hist)&&finite(macd_hist_prev1)?macd_hist-macd_hist_prev1:null),
    mfi14:round(mfi14),obv:round(obvNow,0),obv_prev1:round(lastFinite(obv,1),0),obv_prev2:round(lastFinite(obv,2),0),obv_high_5:round(high(5),0),obv_high_10:round(high(10),0),obv_high_20:round(high(20),0),
    atr14:round(atr14),atr14_prev:round(atrPrev),atr14_sma5:round(atr5),bbw:round(bbw),volume_sma20:round(volumeSma20,0),volume_ratio_20:round(finite(volumeSma20)&&volumeSma20>0?candles.at(-1).volume/volumeSma20:null),
    real_buy_volume:Number(liveRow?.buyVolumeReal||0),real_sell_volume:Number(liveRow?.sellVolumeReal||0),real_buy_count:Number(liveRow?.buyCountReal||0),real_sell_count:Number(liveRow?.sellCountReal||0),buyer_power:liveRow?.hasBuyerPowerData===false?null:round(liveRow?.buyerPower),real_money_flow:round((Number(liveRow?.buyVolumeReal||0)-Number(liveRow?.sellVolumeReal||0))*Number(liveRow?.closePrice||liveRow?.lastPrice||0),0)
  };
  const early=[macd_hist,macd_hist_prev1,macd_hist_prev2].every(finite)&&macd_hist<0&&macd_hist>macd_hist_prev1&&macd_hist_prev1>macd_hist_prev2,near=early&&Math.abs(macd_hist)<=.15*Math.max(Math.abs(macd_signal||0),Math.abs(last)*.0001),bull=finite(macd_line)&&finite(macd_signal)&&finite(lastFinite(macdLine,1))&&finite(lastFinite(macdSignal,1))&&macd_line>macd_signal&&lastFinite(macdLine,1)<=lastFinite(macdSignal,1);
  const signals={macd_recovery_early:early,macd_recovery_near_zero:near,macd_bullish_cross:bull,obv_turn_up:finite(obvNow)&&finite(lastFinite(obv,1))&&finite(lastFinite(obv,2))&&obvNow>lastFinite(obv,1)&&lastFinite(obv,1)<=lastFinite(obv,2),atr_expanding:finite(atr14)&&finite(atr5)&&atr14>atr5};
  const scoreReady=[context.rsi14,context.mfi14,context.obv,context.obv_prev1,context.obv_prev2,context.volume_ratio_20,context.buyer_power,context.price,context.ema20,context.ema50].every(finite);context.tech_recovery_score=scoreReady?Number(early)+Number(context.rsi14>50)+Number(context.mfi14>50)+Number(signals.obv_turn_up)+Number(context.volume_ratio_20>1.3)+Number(context.buyer_power>1.2)+Number(context.price>context.ema20)+Number(context.ema20>context.ema50):null;
  const rows=[
    {group:'oscillator',name:'RSI (14)',value:context.rsi14,status:context.rsi14>=70?'اشباع خرید':context.rsi14<=30?'اشباع فروش':context.rsi14>=50?'مثبت':'ضعیف'},
    {group:'oscillator',name:'MFI (14)',value:context.mfi14,status:context.mfi14>=80?'اشباع خرید':context.mfi14<=20?'اشباع فروش':context.mfi14>=50?'ورود نقدینگی':'کم‌رمق'},
    {group:'oscillator',name:'MACD Line',value:context.macd_line,status:bull?'کراس صعودی':early?'خروج اولیه از اصلاح':macd_hist>=0?'مثبت':'منفی'},
    {group:'oscillator',name:'MACD Signal',value:context.macd_signal,status:near?'نزدیک صفر':'—'},
    {group:'oscillator',name:'MACD Histogram',value:context.macd_hist,status:early?'رو به بهبود':macd_hist>=0?'مثبت':'منفی'},
    {group:'volume',name:'Volume / SMA20',value:context.volume_ratio_20,status:context.volume_ratio_20>=1.5?'حجم قوی':context.volume_ratio_20>=1?'بالاتر از میانگین':'کم‌حجم'},
    {group:'volume',name:'OBV',value:context.obv,status:signals.obv_turn_up?'برگشت صعودی':context.obv>context.obv_prev1?'صعودی':'نزولی'},
    {group:'volume',name:'Buyer Power',value:context.buyer_power,status:context.buyer_power==null?'داده ناکافی':context.buyer_power>=1.2?'قوی':context.buyer_power<=.8?'ضعیف':'متعادل'},
    {group:'trend',name:'EMA (20)',value:context.ema20,distance:round(percentDistance(context.price,context.ema20)),status:context.price>=context.ema20?'قیمت بالاتر':'قیمت پایین‌تر'},
    {group:'trend',name:'EMA (50)',value:context.ema50,distance:round(percentDistance(context.price,context.ema50)),status:context.price>=context.ema50?'قیمت بالاتر':'قیمت پایین‌تر'},
    {group:'trend',name:'EMA20/50 Gap',value:context.ema20_ema50_gap_pct,status:context.ema20_ema50_gap_pct<=8?'فشرده':'باز'},
    {group:'volatility',name:'ATR (14)',value:context.atr14,status:signals.atr_expanding?'در حال گسترش':'عادی'},
    {group:'volatility',name:'BBW',value:context.bbw,status:context.bbw!=null&&context.bbw<=.15?'فشردگی':'عادی'},
    {group:'composite',name:'Tech Recovery Score',value:context.tech_recovery_score,status:context.tech_recovery_score==null?'داده ناکافی':context.tech_recovery_score>=6?'بسیار قوی':context.tech_recovery_score>=5?'قوی':'تأیید ناکافی'}
  ];
  const positive=rows.filter(x=>/مثبت|قوی|بهبود|صعودی|بالاتر|ورود|کراس|خروج اولیه/.test(x.status)).length,negative=rows.filter(x=>/ضعیف|منفی|نزولی|پایین‌تر/.test(x.status)).length;
  return {valid:candles.length>=50,reason:candles.length>=50?null:'برای EMA50 حداقل ۵۰ کندل لازم است.',candleCount:candles.length,asOf:candles.at(-1).date,context,signals,rows,summary:{positive,negative,neutral:rows.length-positive-negative,label:positive>negative+2?'مثبت':negative>positive+2?'منفی':'خنثی'}};
}
