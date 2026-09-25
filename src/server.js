import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadDotEnv,getConfig} from './config.js';
import {openDatabase} from './db.js';
import {ApiQuota} from './quota.js';
import {MonitorEngine} from './monitor-engine.js';
import {fieldCatalog,ruleCatalog,parsePersianCondition,validateExpression} from './conditions.js';
import {AuthService,SecretVault,decryptBackup,encryptBackup} from './security.js';
import {RuntimeSettings} from './runtime-settings.js';
import {parseBulkMonitors} from './bulk-import.js';
import {sendTelegramMany} from './telegram.js';
import {RuleEngineV2,conditionCatalogV2,conditionDefinitionsV2,normalizeRuleExpressionV2,validateRuleExpressionV2} from './rule-engine-v2.js';
import {isMarketWindow} from './schedule.js';
import {defaultRulePackV1} from './rule-pack-v1.js';
import {importRahavardZip,saveHistoryMappings} from './history-import.js';

loadDotEnv();
const config=getConfig(),db=openDatabase(config.dbPath),vault=new SecretVault(process.env.APP_ENCRYPTION_KEY||config.adminToken),runtime=new RuntimeSettings(db,vault,config),auth=new AuthService(db,config.adminToken),quota=new ApiQuota(db,config.quota),engine=new MonitorEngine(config,db,quota,runtime),ruleEngine=new RuleEngineV2(config,db,engine,runtime);
const rulePackKey='rule-pack-1405-07-03',rulePackSetting=`installed:${rulePackKey}`;let rulePackInstall={added:0,total:defaultRulePackV1.length};if(db.getSetting(rulePackSetting)!=='1'){rulePackInstall=db.installRulePack(defaultRulePackV1);db.setSetting(rulePackSetting,'1');}
const installPolicyFlags=()=>{db.setDataState('symbol-policy:همراه',{averageDownAllowed:false,informational:true});db.setDataState('symbol-policy:عیار',{equityBuySellRulesEnabled:false,allowedRuleFamilies:['PROFIT','TRAILING','GOLD_FUND_FUTURE'],informational:true});};installPolicyFlags();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),loginAttempts=new Map();
const securityHeaders={'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const json=(res,status,body,extra={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8',...securityHeaders,...extra});res.end(JSON.stringify(body));};
const binary=(res,status,body,filename)=>{res.writeHead(status,{'content-type':'application/octet-stream','content-disposition':`attachment; filename="${filename}"`,...securityHeaders});res.end(body);};
const bearer=req=>String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
const authorized=req=>auth.authorized(bearer(req));
const clientIp=req=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
const readRaw=(req,max=2_000_000)=>new Promise((resolve,reject)=>{const chunks=[];let size=0;req.on('data',chunk=>{size+=chunk.length;if(size>max){reject(new Error('حجم درخواست بیش از حد مجاز است.'));req.destroy();return;}chunks.push(chunk);});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);});
const readBody=async(req,max)=>{const data=await readRaw(req,max);try{return data.length?JSON.parse(data.toString('utf8')):{};}catch{throw new Error('JSON درخواست معتبر نیست.');}};
const staticFile=(res,name,type)=>{res.writeHead(200,{'content-type':type,'cache-control':'no-cache',...securityHeaders});res.end(fs.readFileSync(path.join(root,'public',name)));};

function loginAllowed(ip,success=false){const now=Date.now(),record=loginAttempts.get(ip)||{count:0,from:now};if(now-record.from>15*60_000){record.count=0;record.from=now;}if(success){loginAttempts.delete(ip);return true;}record.count++;loginAttempts.set(ip,record);return record.count<=8;}

function validateMonitor(input){
  const symbol=String(input.symbol||'').trim();if(!symbol||symbol.length>30)throw new Error('نماد معتبر نیست.');
  const inputMode=input.inputMode==='text'?'text':'builder',expression=inputMode==='text'?parsePersianCondition(input.sourceText):input.expression;validateExpression(expression);
  const allowedActions=['BUY','AVERAGE_DOWN','SELL_STOP_LOSS','SELL_TAKE_PROFIT'];if(!allowedActions.includes(input.actionType))throw new Error('نوع اقدام معتبر نیست.');
  const quantity=Math.floor(Number(input.quantity)),proposedPrice=Number(input.proposedPrice),maxAmountToman=input.maxAmountToman?Number(input.maxAmountToman):null;if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(proposedPrice)||proposedPrice<=0)throw new Error('تعداد و قیمت پیشنهادی باید بزرگ‌تر از صفر باشند.');
  const computedAmount=quantity*proposedPrice/10;if(maxAmountToman&&computedAmount>maxAmountToman)throw new Error(`مبلغ سفارش ${Math.round(computedAmount).toLocaleString('fa-IR')} تومان از سقف تعیین‌شده بیشتر است.`);
  const startAt=new Date(input.startAt),endAt=new Date(input.endAt);if(!Number.isFinite(startAt.getTime())||!Number.isFinite(endAt.getTime())||endAt<=startAt)throw new Error('بازه زمانی معتبر نیست.');
  const intervalMinutes=Math.max(1,Math.floor(Number(input.intervalMinutes||10))),cooldownMinutes=Math.max(intervalMinutes,Math.floor(Number(input.cooldownMinutes||30)));
  return {title:String(input.title||`${symbol} - ${input.actionType}`).slice(0,120),symbol,inputMode,sourceText:String(input.sourceText||'').slice(0,4000),expression,actionType:input.actionType,quantity,proposedPrice,maxAmountToman,startAt:startAt.toISOString(),endAt:endAt.toISOString(),intervalMinutes,cooldownMinutes,computedAmountToman:computedAmount};
}

function validateRuleV2(input){const scope=['SYMBOL','PORTFOLIO','MARKET'].includes(input.scope)?input.scope:'SYMBOL',symbol=scope==='MARKET'?null:String(input.symbol||'').trim();if(scope!=='MARKET'&&!symbol)throw new Error('برای Rule نماد یا سبد، نماد الزامی است.');const expression=normalizeRuleExpressionV2(input.expression||{conditions:input.conditions,condition_logic:input.conditionLogic||input.condition_logic});validateRuleExpressionV2(expression);const severity=['INFO','WATCH','BUY','STRONG_BUY','WARNING','SELL','EXIT'].includes(input.severity)?input.severity:'INFO',actions=['ALERT','BUY_ALERT','SELL_ALERT','PARTIAL_PROFIT','PROFIT_REVIEW','EXIT_ALERT','CANCEL_ORDER','MOVE_STOP','TRAILING_STOP'];if(!actions.includes(input.action))throw new Error('Action معتبر نیست.');return {ruleId:String(input.ruleId||input.rule_id||`${scope}_${symbol||'MARKET'}_${Date.now()}`).slice(0,120),symbol,name:String(input.name||'Rule جدید').slice(0,160),description:String(input.description||'').slice(0,2000),enabled:input.enabled!==false,scope,severity,expression,action:input.action,actionParams:input.actionParams||input.action_params||{},cooldownMinutes:Math.max(1,Number(input.cooldownMinutes||input.cooldown_minutes||30)),oncePerDay:Boolean(input.oncePerDay||input.once_per_day),intervalMinutes:Math.max(1,Number(input.intervalMinutes||input.interval_minutes||5)),startAt:input.startAt||input.start_at||null,endAt:input.endAt||input.end_at||null};}

async function publicAuth(req,res,url){
  if(url.pathname==='/api/auth/login'&&req.method==='POST'){const ip=clientIp(req);if(!loginAllowed(ip))return json(res,429,{error:'تعداد تلاش‌های ورود بیش از حد مجاز است. ۱۵ دقیقه صبر کنید.'});const body=await readBody(req,20_000),session=auth.login(body.password,body.remember===true);if(!session)return json(res,401,{error:'رمز عبور صحیح نیست.'});loginAllowed(ip,true);return json(res,200,session);}
  if(url.pathname==='/api/auth/reset/request'&&req.method==='POST'){const target=runtime.primaryTelegram();if(!target)throw new Error('ربات اصلی تلگرام برای بازیابی رمز تنظیم نشده است.');const code=auth.requestReset();await sendTelegramMany([target],`🔐 کد بازیابی رمز پایش بورس: ${code}\nاعتبار: ۱۰ دقیقه\nاگر این درخواست از طرف شما نیست، آن را نادیده بگیرید.`);return json(res,200,{ok:true,message:'کد بازیابی به تلگرام مدیر ارسال شد.'});}
  if(url.pathname==='/api/auth/reset/complete'&&req.method==='POST'){const body=await readBody(req,20_000);auth.completeReset(body.code,body.password);return json(res,200,{ok:true,message:'رمز عبور تغییر کرد. اکنون وارد شوید.'});}
  return false;
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname==='/'||url.pathname==='/index.html')return staticFile(res,'index.html','text/html; charset=utf-8');
    if(url.pathname==='/app.js')return staticFile(res,'app.js','text/javascript; charset=utf-8');
    if(url.pathname==='/theme.css')return staticFile(res,'theme.css','text/css; charset=utf-8');
    if(url.pathname==='/jalali.js')return staticFile(res,'jalali.js','text/javascript; charset=utf-8');
    if(url.pathname==='/healthz')return json(res,200,{ok:true,time:new Date().toISOString(),timezone:'Asia/Tehran'});
    if(!url.pathname.startsWith('/api/'))return json(res,404,{error:'یافت نشد'});
    const handled=await publicAuth(req,res,url);if(handled!==false)return handled;
    if(!authorized(req))return json(res,401,{error:'نشست ورود معتبر نیست.'});

    if(url.pathname==='/api/auth/logout'&&req.method==='POST'){auth.logout(bearer(req));return json(res,200,{ok:true});}
    if(url.pathname==='/api/auth/password'&&req.method==='PUT'){const body=await readBody(req,20_000);auth.setPassword(body.password);return json(res,200,{ok:true,relogin:true});}
    if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{...engine.status(),ruleEngine:{lastRunAt:ruleEngine.lastRunAt,lastError:ruleEngine.lastError,running:ruleEngine.running,pack:rulePackInstall},telegramConfigured:runtime.telegramTargets().length>0,authEnabled:true,timezone:'Asia/Tehran',now:new Date().toISOString(),stats:db.stats()});
    if(url.pathname==='/api/meta'&&req.method==='GET')return json(res,200,{fields:fieldCatalog,rules:ruleCatalog,conditionsV2:conditionCatalogV2,conditionDefinitionsV2,actions:[{value:'BUY',label:'خرید'},{value:'AVERAGE_DOWN',label:'میانگین کم‌کردن'},{value:'SELL_STOP_LOSS',label:'فروش در حد زیان'},{value:'SELL_TAKE_PROFIT',label:'فروش برای سیو سود'}],actionsV2:[{value:'ALERT',label:'هشدار'},{value:'BUY_ALERT',label:'هشدار خرید'},{value:'SELL_ALERT',label:'هشدار فروش'},{value:'PARTIAL_PROFIT',label:'سیو سود بخشی'},{value:'PROFIT_REVIEW',label:'بازبینی سود'},{value:'EXIT_ALERT',label:'هشدار خروج'},{value:'CANCEL_ORDER',label:'لغو سفارش'},{value:'MOVE_STOP',label:'انتقال حد زیان'},{value:'TRAILING_STOP',label:'حد زیان متحرک'}]});
    if(url.pathname==='/api/conditions/parse'&&req.method==='POST'){const body=await readBody(req);return json(res,200,{expression:parsePersianCondition(body.text)});}
    if(url.pathname==='/api/monitors/import/preview'&&req.method==='POST'){const body=await readBody(req);const monitors=parseBulkMonitors(body.text).map(validateMonitor);return json(res,200,{count:monitors.length,monitors});}
    if(url.pathname==='/api/monitors/import'&&req.method==='POST'){const body=await readBody(req);const validated=parseBulkMonitors(body.text).map(validateMonitor),monitors=validated.map(x=>db.createMonitor(x));return json(res,201,{count:monitors.length,monitors});}
    if(url.pathname==='/api/symbols'&&req.method==='GET')return json(res,200,{symbols:db.searchSymbols(url.searchParams.get('q')||'',30)});
    if(url.pathname==='/api/symbols/detail'&&req.method==='GET')return json(res,200,{symbol:db.symbolDetail(url.searchParams.get('symbol')||'')});
    if(url.pathname==='/api/symbols/analysis'&&req.method==='GET'){const symbol=String(url.searchParams.get('symbol')||'').trim();if(!symbol)throw new Error('نماد را انتخاب کنید.');return json(res,200,await engine.analyzeSymbol(symbol,{forceHistory:url.searchParams.get('refresh')==='1'}));}
    if(url.pathname==='/api/symbols/refresh'&&req.method==='POST')return json(res,200,await engine.refreshCatalog(false));
    if(url.pathname==='/api/monitors'&&req.method==='GET')return json(res,200,{monitors:db.listMonitors({symbol:url.searchParams.get('symbol')||'',archive:url.searchParams.get('archive')==='1'})});
    if(url.pathname==='/api/monitors'&&req.method==='POST')return json(res,201,{monitor:db.createMonitor(validateMonitor(await readBody(req)))});
    if(url.pathname==='/api/rules'&&req.method==='GET')return json(res,200,{rules:db.listRulesV2()});
    if(url.pathname==='/api/rules'&&req.method==='POST')return json(res,201,{rule:db.createRuleV2(validateRuleV2(await readBody(req)))});
    if(url.pathname==='/api/monitoring/bulk-delete'&&req.method==='POST'){const body=await readBody(req,200_000),items=Array.isArray(body.items)?body.items.slice(0,2000):[];return json(res,200,db.bulkDeleteMonitoring(items,body.all===true));}
    if(url.pathname==='/api/rules/run'&&req.method==='POST')return json(res,200,await ruleEngine.run());
    if(url.pathname==='/api/portfolio'&&req.method==='PUT')return json(res,200,{position:db.savePortfolioPosition(await readBody(req))});
    if(url.pathname==='/api/events'&&req.method==='GET'){const limit=Number(url.searchParams.get('limit')||200),filter={symbol:url.searchParams.get('symbol')||'',monitorId:url.searchParams.get('monitorId'),sent:url.searchParams.get('sent')||''},legacy=db.recentEvents(limit,filter),v2=filter.monitorId?[]:db.recentRuleEventsV2(limit,filter);return json(res,200,{events:[...legacy,...v2].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,limit)});}
    if(url.pathname==='/api/quota'&&req.method==='GET')return json(res,200,{usage:db.apiUsage(),limits:config.quota});
    if(url.pathname==='/api/settings'&&req.method==='GET')return json(res,200,{settings:runtime.public()});
    if(url.pathname==='/api/settings'&&req.method==='PUT'){const body=await readBody(req);return json(res,200,{settings:runtime.mergeMasked(body)});}
    if(url.pathname==='/api/settings/test/telegram'&&req.method==='POST'){const body=await readBody(req),targets=runtime.telegramTargets().filter(x=>!body.id||x.id===body.id),result=await sendTelegramMany(targets,'✅ اتصال ربات تلگرام سامانه پایش بورس با موفقیت آزمایش شد.');return json(res,200,{ok:true,sent:result.sent});}
    if(url.pathname==='/api/settings/test/brsapi'&&req.method==='POST'){const result=await engine.refreshCatalog(true);return json(res,200,{ok:true,...result,provider:engine.lastProvider});}
    if(url.pathname==='/api/history/status'&&req.method==='GET')return json(res,200,{lastImport:db.getDataState('history-import:last'),mappings:Object.keys(db.getDataState('history-symbol-map')||{}).length});
    if(url.pathname==='/api/history/mappings'&&req.method==='POST'){const body=await readBody(req,200_000),saved=saveHistoryMappings(db,body.mappings);return json(res,200,{ok:true,mappings:Object.keys(saved).length});}
    if(url.pathname==='/api/history/import'&&req.method==='POST'){const file=await readRaw(req,35_000_000),result=importRahavardZip(file,db,{limit:300});return json(res,200,result);}
    if(url.pathname==='/api/backup'&&req.method==='POST'){const body=await readBody(req,20_000),payload={format:'bourse-monitor-portable',version:1,exportedAt:new Date().toISOString(),database:db.exportPortable(),runtime:runtime.internal()};return binary(res,200,encryptBackup(payload,body.password),`bourse-monitor-${new Date().toISOString().slice(0,10)}.bmon`);}
    if(url.pathname==='/api/restore'&&req.method==='POST'){const passphrase=String(req.headers['x-backup-passphrase']||''),file=await readRaw(req,100_000_000),payload=decryptBackup(file,passphrase);if(payload?.format!=='bourse-monitor-portable'||payload.version!==1)throw new Error('محتوای فایل پشتیبان معتبر نیست.');db.restorePortable(payload.database);if(!db.hasRulePack(rulePackKey))db.installRulePack(defaultRulePackV1);installPolicyFlags();runtime.save(payload.runtime);auth.invalidateSessions();return json(res,200,{ok:true,relogin:true,message:'بازیابی کامل شد. دوباره وارد شوید.'});}
    const statusMatch=/^\/api\/monitors\/(\d+)\/status$/.exec(url.pathname);if(statusMatch&&req.method==='PATCH'){const body=await readBody(req);if(!['active','paused','completed','cancelled'].includes(body.status))throw new Error('وضعیت معتبر نیست.');return json(res,200,{monitor:db.updateMonitorStatus(Number(statusMatch[1]),body.status)});}
    const updateMonitorMatch=/^\/api\/monitors\/(\d+)$/.exec(url.pathname);if(updateMonitorMatch&&req.method==='PUT')return json(res,200,{monitor:db.updateMonitor(Number(updateMonitorMatch[1]),validateMonitor(await readBody(req)))});
    const deleteMatch=/^\/api\/monitors\/(\d+)$/.exec(url.pathname);if(deleteMatch&&req.method==='DELETE')return json(res,200,{deleted:db.deleteMonitor(Number(deleteMatch[1]))});
    const ruleStatusMatch=/^\/api\/rules\/(\d+)\/status$/.exec(url.pathname);if(ruleStatusMatch&&req.method==='PATCH'){const body=await readBody(req);if(!['active','paused'].includes(body.status))throw new Error('وضعیت Rule معتبر نیست.');return json(res,200,{rule:db.updateRuleStatusV2(Number(ruleStatusMatch[1]),body.status)});}
    const updateRuleMatch=/^\/api\/rules\/(\d+)$/.exec(url.pathname);if(updateRuleMatch&&req.method==='PUT')return json(res,200,{rule:db.updateRuleV2(Number(updateRuleMatch[1]),validateRuleV2(await readBody(req)))});
    const ruleDeleteMatch=/^\/api\/rules\/(\d+)$/.exec(url.pathname);if(ruleDeleteMatch&&req.method==='DELETE')return json(res,200,{deleted:db.deleteRuleV2(Number(ruleDeleteMatch[1]))});
    const runMatch=/^\/api\/monitors\/(\d+)\/run$/.exec(url.pathname);if(runMatch&&req.method==='POST')return json(res,200,await engine.runDue({forceMonitorId:Number(runMatch[1])}));
    if(url.pathname==='/api/run-due'&&req.method==='POST')return json(res,200,await engine.runDue());
    return json(res,404,{error:'یافت نشد'});
  }catch(error){console.error(error);return json(res,error.code==='API_QUOTA_EXCEEDED'?429:400,{error:error.message,code:error.code||'BAD_REQUEST'});}
});

server.listen(config.port,()=>console.log(`${config.appName}: http://localhost:${config.port} | timezone Asia/Tehran`));
const timer=setInterval(()=>{if(!isMarketWindow(config.marketSchedule))return;Promise.allSettled([engine.runDue(),ruleEngine.run()]).then(results=>{for(const item of results)if(item.status==='rejected')console.error(item.reason?.message||item.reason);});},config.pollIntervalSeconds*1000);timer.unref();
const prune=setInterval(()=>db.prune(config.retentionDays),24*60*60*1000);prune.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);clearInterval(prune);db.close();server.close(()=>process.exit(0));});
