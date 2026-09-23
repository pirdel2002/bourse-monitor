import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {loadDotEnv,getConfig} from './config.js';
import {openDatabase} from './db.js';
import {ApiQuota} from './quota.js';
import {MonitorEngine} from './monitor-engine.js';
import {fieldCatalog,ruleCatalog,parsePersianCondition,validateExpression} from './conditions.js';

loadDotEnv();
const config=getConfig();
const db=openDatabase(config.dbPath);
const quota=new ApiQuota(db,config.quota);
const engine=new MonitorEngine(config,db,quota);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
const sameToken=(a,b)=>{try{const aa=Buffer.from(a||'');const bb=Buffer.from(b||'');return aa.length===bb.length&&aa.length>0&&timingSafeEqual(aa,bb);}catch{return false;}};
const authorized=req=>!config.adminToken||sameToken(req.headers['x-admin-token'],config.adminToken)||sameToken(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''),config.adminToken);
const readBody=req=>new Promise((resolve,reject)=>{let data='';req.on('data',chunk=>{data+=chunk;if(data.length>100_000){reject(new Error('بدنه درخواست بیش از حد بزرگ است.'));req.destroy();}});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(new Error('JSON درخواست معتبر نیست.'));}});req.on('error',reject);});
const staticFile=(res,name,type)=>{res.writeHead(200,{'content-type':type,'cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(fs.readFileSync(path.join(root,'public',name)));};

function validateMonitor(input){
  const symbol=String(input.symbol||'').trim(); if(!symbol||symbol.length>30)throw new Error('نماد معتبر نیست.');
  const inputMode=input.inputMode==='text'?'text':'builder';
  const expression=inputMode==='text'?parsePersianCondition(input.sourceText):input.expression;
  validateExpression(expression);
  const allowedActions=['BUY','AVERAGE_DOWN','SELL_STOP_LOSS','SELL_TAKE_PROFIT']; if(!allowedActions.includes(input.actionType))throw new Error('نوع اقدام معتبر نیست.');
  const quantity=Math.floor(Number(input.quantity));const proposedPrice=Number(input.proposedPrice);const maxAmountToman=input.maxAmountToman?Number(input.maxAmountToman):null;
  if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(proposedPrice)||proposedPrice<=0)throw new Error('تعداد و قیمت پیشنهادی باید بزرگ‌تر از صفر باشند.');
  const computedAmount=quantity*proposedPrice/10;if(maxAmountToman&&computedAmount>maxAmountToman)throw new Error(`مبلغ سفارش ${Math.round(computedAmount).toLocaleString('fa-IR')} تومان از سقف تعیین‌شده بیشتر است.`);
  const startAt=new Date(input.startAt);const endAt=new Date(input.endAt);if(!Number.isFinite(startAt.getTime())||!Number.isFinite(endAt.getTime())||endAt<=startAt)throw new Error('بازه زمانی معتبر نیست.');
  const intervalMinutes=Math.max(1,Math.floor(Number(input.intervalMinutes||10)));const cooldownMinutes=Math.max(intervalMinutes,Math.floor(Number(input.cooldownMinutes||30)));
  return {title:String(input.title||`${symbol} - ${input.actionType}`).slice(0,120),symbol,inputMode,sourceText:String(input.sourceText||'').slice(0,2000),expression,actionType:input.actionType,quantity,proposedPrice,maxAmountToman,startAt:startAt.toISOString(),endAt:endAt.toISOString(),intervalMinutes,cooldownMinutes,computedAmountToman:computedAmount};
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname==='/'||url.pathname==='/index.html')return staticFile(res,'index.html','text/html; charset=utf-8');
    if(url.pathname==='/app.js')return staticFile(res,'app.js','text/javascript; charset=utf-8');
    if(url.pathname==='/healthz')return json(res,200,{ok:true});
    if(!url.pathname.startsWith('/api/'))return json(res,404,{error:'یافت نشد'});
    if(!authorized(req))return json(res,401,{error:'توکن مدیریت معتبر نیست.'});

    if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{...engine.status(),telegramConfigured:Boolean(config.telegram.token&&config.telegram.chatId),authEnabled:Boolean(config.adminToken)});
    if(url.pathname==='/api/meta'&&req.method==='GET')return json(res,200,{fields:fieldCatalog,rules:ruleCatalog,actions:[{value:'BUY',label:'خرید'},{value:'AVERAGE_DOWN',label:'میانگین کم‌کردن'},{value:'SELL_STOP_LOSS',label:'فروش در حد زیان'},{value:'SELL_TAKE_PROFIT',label:'فروش برای سیو سود'}]});
    if(url.pathname==='/api/conditions/parse'&&req.method==='POST'){const body=await readBody(req);const expression=parsePersianCondition(body.text);return json(res,200,{expression});}
    if(url.pathname==='/api/symbols'&&req.method==='GET')return json(res,200,{symbols:db.searchSymbols(url.searchParams.get('q')||'',30)});
    if(url.pathname==='/api/symbols/refresh'&&req.method==='POST')return json(res,200,await engine.refreshCatalog(false));
    if(url.pathname==='/api/monitors'&&req.method==='GET')return json(res,200,{monitors:db.listMonitors()});
    if(url.pathname==='/api/monitors'&&req.method==='POST'){const monitor=db.createMonitor(validateMonitor(await readBody(req)));return json(res,201,{monitor});}
    if(url.pathname==='/api/events'&&req.method==='GET')return json(res,200,{events:db.recentEvents(Math.min(200,Number(url.searchParams.get('limit')||100)))});
    if(url.pathname==='/api/quota'&&req.method==='GET')return json(res,200,{usage:db.apiUsage(),limits:config.quota});
    const statusMatch=/^\/api\/monitors\/(\d+)\/status$/.exec(url.pathname);
    if(statusMatch&&req.method==='PATCH'){const body=await readBody(req);if(!['active','paused','completed','cancelled'].includes(body.status))throw new Error('وضعیت معتبر نیست.');return json(res,200,{monitor:db.updateMonitorStatus(Number(statusMatch[1]),body.status)});}
    const runMatch=/^\/api\/monitors\/(\d+)\/run$/.exec(url.pathname);
    if(runMatch&&req.method==='POST')return json(res,200,await engine.runDue({forceMonitorId:Number(runMatch[1])}));
    if(url.pathname==='/api/run-due'&&req.method==='POST')return json(res,200,await engine.runDue());
    return json(res,404,{error:'یافت نشد'});
  }catch(error){console.error(error);return json(res,error.code==='API_QUOTA_EXCEEDED'?429:400,{error:error.message,code:error.code||'BAD_REQUEST'});}
});

server.listen(config.port,()=>console.log(`${config.appName}: http://localhost:${config.port}`));
const timer=setInterval(()=>engine.runDue().catch(error=>console.error(error.message)),config.pollIntervalSeconds*1000);timer.unref();
const prune=setInterval(()=>db.prune(config.retentionDays),24*60*60*1000);prune.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);clearInterval(prune);db.close();server.close(()=>process.exit(0));});
