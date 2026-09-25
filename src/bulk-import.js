const actionMap=new Map([['خرید','BUY'],['buy','BUY'],['میانگین کم‌کردن','AVERAGE_DOWN'],['میانگین کم کردن','AVERAGE_DOWN'],['average_down','AVERAGE_DOWN'],['حد زیان','SELL_STOP_LOSS'],['فروش در حد زیان','SELL_STOP_LOSS'],['sell_stop_loss','SELL_STOP_LOSS'],['سیو سود','SELL_TAKE_PROFIT'],['فروش برای سیو سود','SELL_TAKE_PROFIT'],['sell_take_profit','SELL_TAKE_PROFIT']]);
const digits=s=>String(s??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬،]/g,'').trim();
const keyMap={'عنوان':'title','نماد':'symbol','اقدام':'actionType','نوع اقدام':'actionType','تعداد':'quantity','قیمت':'proposedPrice','قیمت پیشنهادی':'proposedPrice','سقف مبلغ':'maxAmountToman','شروع':'startAt','پایان':'endAt','فاصله':'intervalMinutes','فاصله بررسی':'intervalMinutes','شرط':'sourceText'};
function localParts(date=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return p;}
function weekday(date){return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short'}).format(date);}
function nextTradingDay(now){let day=new Date(now);do{day=new Date(day.getTime()+86400000);}while(!['Sat','Sun','Mon','Tue','Wed'].includes(weekday(day)));return day;}
function nextSaturday(now){let day=new Date(now);do{day=new Date(day.getTime()+86400000);}while(weekday(day)!=='Sat');return day;}
function iranLocalToIso(text,now=new Date()){
  const raw=digits(text).toLowerCase(),p=localParts(now);let date=`${p.year}-${p.month}-${p.day}`,time=`${p.hour}:${p.minute}`;
  if(['اکنون','الان','now'].includes(raw))return now.toISOString();
  if(/نیم\s*ساعت/.test(raw))return new Date(now.getTime()+30*60000).toISOString();
  if(/یک\s*ساعت/.test(raw))return new Date(now.getTime()+60*60000).toISOString();
  if(/پایان\s*(امروز|روز|بازار)/.test(raw))time='12:30';
  else if(/^(فردا|روز معاملاتی بعد)/.test(raw)){const tomorrow=nextTradingDay(now),t=localParts(tomorrow);date=`${t.year}-${t.month}-${t.day}`;time=raw.match(/(\d{1,2}):(\d{2})/)?.slice(1).join(':')||(raw.includes('پایان')?'12:30':time);}
  else if(/^شنبه/.test(raw)){const saturday=nextSaturday(now),t=localParts(saturday);date=`${t.year}-${t.month}-${t.day}`;time=raw.match(/(\d{1,2}):(\d{2})/)?.slice(1).join(':')||(raw.includes('پایان')||raw.includes('آخر')?'12:30':time);}
  else {const match=raw.match(/(\d{4}-\d{2}-\d{2})[ t](\d{1,2}:\d{2})/);if(match){date=match[1];time=match[2];}else if(/^\d{1,2}:\d{2}$/.test(raw))time=raw;else if(!/پایان/.test(raw))throw new Error(`زمان «${text}» شناخته نشد. از اکنون، نیم ساعت دیگر، یک ساعت دیگر، پایان بازار، روز معاملاتی بعد 09:30، شنبه 09:30 یا YYYY-MM-DD HH:mm استفاده کنید.`);}
  return new Date(`${date}T${time}:00+03:30`).toISOString();
}
function normalizeObject(item,now){const action=actionMap.get(String(item.actionType||'').trim().toLowerCase())||item.actionType,structured=item.inputMode==='builder'||(item.expression&&typeof item.expression==='object');return {title:item.title,symbol:item.symbol,actionType:action,quantity:Number(digits(item.quantity)),proposedPrice:Number(digits(item.proposedPrice)),maxAmountToman:item.maxAmountToman?Number(digits(item.maxAmountToman)):null,startAt:iranLocalToIso(item.startAt||'اکنون',now),endAt:iranLocalToIso(item.endAt||'یک ساعت دیگر',now),intervalMinutes:Number(digits(item.intervalMinutes||10)),cooldownMinutes:Number(digits(item.cooldownMinutes||30)),inputMode:structured?'builder':'text',sourceText:String(item.sourceText||'').trim(),expression:structured?item.expression:undefined};}
export function parseBulkMonitors(text,now=new Date()){
  const raw=String(text||'').trim();if(!raw)throw new Error('متن ورود گروهی خالی است.');
  if(raw.startsWith('[')||raw.startsWith('{')){const parsed=JSON.parse(raw),items=Array.isArray(parsed)?parsed:parsed.monitors;if(!Array.isArray(items))throw new Error('JSON باید آرایه یا دارای monitors باشد.');return items.map(x=>normalizeObject(x,now));}
  const blocks=raw.split(/^\s*---+\s*$/m).map(x=>x.trim()).filter(Boolean);
  return blocks.map((block,index)=>{const item={};for(const line of block.split(/\r?\n/)){if(!line.trim()||line.trim().startsWith('#'))continue;const at=line.indexOf(':');if(at<1)throw new Error(`خط نامعتبر در بلوک ${index+1}: ${line}`);const key=keyMap[line.slice(0,at).trim()]||line.slice(0,at).trim();item[key]=line.slice(at+1).trim();}return normalizeObject(item,now);});
}
