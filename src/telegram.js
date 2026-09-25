const actionLabels={BUY:'خرید',AVERAGE_DOWN:'میانگین کم‌کردن',SELL_STOP_LOSS:'فروش در حد زیان',SELL_TAKE_PROFIT:'فروش برای سیو سود'};
const fa=value=>Number(value||0).toLocaleString('fa-IR',{maximumFractionDigits:2});

export function formatMonitorAlert(monitor,snapshot,result){
  const amountToman=Math.round(Number(monitor.quantity)*Number(monitor.proposedPrice)/10);
  const evidence=[]; const walk=node=>{if(node.description&&node.rule)evidence.push(`• ${node.description}`);(node.children||[]).forEach(walk);}; walk(result);
  return [
    `🚨 شرط ${actionLabels[monitor.actionType]||monitor.actionType} فعال شد`,
    `نماد: ${monitor.symbol}`,
    `عنوان: ${monitor.title}`,
    '',
    `اقدام پیشنهادی: ${actionLabels[monitor.actionType]||monitor.actionType}`,
    `تعداد: ${fa(monitor.quantity)} سهم`,
    `قیمت پیشنهادی: ${fa(monitor.proposedPrice)} ریال`,
    `مبلغ تقریبی: ${fa(amountToman)} تومان`,
    monitor.maxAmountToman?`سقف تعیین‌شده: ${fa(monitor.maxAmountToman)} تومان`:null,
    '',
    `آخرین قیمت تابلو: ${fa(snapshot.lastPrice)} ریال`,
    `قیمت پایانی: ${fa(snapshot.closePrice)} ریال`,
    Number.isFinite(snapshot.buyerPower)?`قدرت خریدار: ${fa(snapshot.buyerPower)}`:null,
    Number.isFinite(snapshot.bidAskRatio)?`نسبت تقاضا به عرضه: ${fa(snapshot.bidAskRatio)}`:null,
    evidence.length?'شواهد:':null,
    ...evidence,
    '',
    'این پیام تصمیم‌یار است. سفارش واقعی ثبت نشده است.'
  ].filter(x=>x!==null).join('\n');
}

export async function sendTelegram(config,text){
  if(!config.token||!config.chatId) return {skipped:true};
  const response=await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:config.chatId,text,disable_web_page_preview:true}),signal:AbortSignal.timeout(10000)
  });
  if(!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  return response.json();
}

export async function sendMonitorAlert(config,monitor,snapshot,result){return sendTelegram(config,formatMonitorAlert(monitor,snapshot,result));}

export async function sendTelegramMany(configs,text){
  const targets=Array.isArray(configs)?configs:configs?[configs]:[];if(!targets.length)return {skipped:true,results:[]};
  const settled=await Promise.allSettled(targets.map(config=>sendTelegram(config,text)));const ok=settled.filter(x=>x.status==='fulfilled'&&!x.value?.skipped).length;
  if(!ok){const reason=settled.find(x=>x.status==='rejected')?.reason;throw reason||new Error('هیچ ربات تلگرامی برای ارسال فعال نیست.');}
  return {skipped:false,sent:ok,failed:settled.length-ok,results:settled};
}

export async function sendMonitorAlertMany(configs,monitor,snapshot,result){return sendTelegramMany(configs,formatMonitorAlert(monitor,snapshot,result));}

export function formatSignal(signal){
  return [`📊 ${signal.symbol} — ${signal.action}`,`امتیاز: ${signal.score}/100`,`قیمت: ${fa(signal.price)}`,signal.stopLoss?`حد زیان پیشنهادی: ${fa(signal.stopLoss)}`:null,signal.takeProfit?`هدف اولیه: ${fa(signal.takeProfit)}`:null].filter(Boolean).join('\n');
}
