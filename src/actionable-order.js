const positive=n=>Number.isFinite(Number(n))&&Number(n)>0;
const fa=n=>Number(n).toLocaleString('fa-IR',{maximumFractionDigits:0});
const parts=(date,calendar)=>{
  const values=Object.fromEntries(new Intl.DateTimeFormat(`en-US-u-ca-${calendar}`,{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
  return {date:`${values.year}-${values.month}-${values.day}`,minute:Number(values.hour)*60+Number(values.minute)};
};

export function isFreshActionQuote(row,now=new Date()){
  const quoteDate=String(row?.date||'').replaceAll('/','-').trim(),match=/^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(row?.time||''));
  if(!match)return false;
  const gregorian=parts(now,'gregory'),persian=parts(now,'persian');
  const normalized=quoteDate.split('-').map((item,index)=>index===0?item:item.padStart(2,'0')).join('-');
  const age=gregorian.minute-(Number(match[1])*60+Number(match[2]));
  return (normalized===gregorian.date||normalized===persian.date)&&age>=0&&age<=12;
}

export function resolveActionableOrder(rule,context,cash){
  if(rule.actionParams?.executableOnly!==true)return null;
  const request=rule.actionParams.order||{},row=context.marketRow||{},position=context.portfolio;
  const buy=rule.action==='BUY_ALERT',quantity=buy?Number(request.quantity):Number(position?.quantity);
  const price=buy?Number(request.limitPrice):Number(row.bestBuyPrice);
  if(!Number.isInteger(quantity)||quantity<=0||!positive(price)||!positive(row.lastPrice))return null;
  if(!isFreshActionQuote(row))return null;
  if(row.state&&/(ممنوع|متوقف|بسته)/.test(row.state))return null;
  if(!positive(row.lowerLimit)||!positive(row.upperLimit)||price<row.lowerLimit||price>row.upperLimit)return null;
  if(buy){
    if(row.lastPrice>price||!positive(cash?.availableToman)||!cash?.updatedAt)return null;
    if(!Number.isFinite(Date.parse(cash.updatedAt))||Date.now()-Date.parse(cash.updatedAt)>24*3600_000)return null;
    if(quantity*price/10>Number(cash.availableToman)-2_000_000)return null;
    if(position?.quantity>0)return null; // Do not send a second initial buy for an owned symbol.
  }else{
    if(!positive(position?.avg_price))return null;
    if(!positive(row.bestBuyVolume))return null;
  }
  return {side:buy?'خرید':'فروش',quantity,limitPrice:price,amountToman:Math.ceil(quantity*price/10),
    text:`${buy?'🟢':'🔴'} ${buy?'سفارش خرید':'سفارش فروش'} ${rule.symbol}\nتعداد: ${fa(quantity)}\nسقف قیمت سفارش: ${fa(price)} ریال\nمبلغ تقریبی: ${fa(Math.ceil(quantity*price/10))} تومان`};
}
