import {fetchBrsSymbols,fetchBrsCandles,fetchBrsIndex} from './providers/brsapi.js';
import {fetchMockSymbols,fetchMockIndex} from './providers/mock.js';
import {evaluateExpression} from './conditions.js';
import {sendMonitorAlertMany} from './telegram.js';
import {buildIndicatorAnalysis} from './indicator-engine.js';

const nowIso=()=>new Date().toISOString();

export class MonitorEngine{
  constructor(config,db,quota,runtime=null){this.config=config;this.db=db;this.quota=quota;this.runtime=runtime;this.running=false;this.lastRunAt=null;this.lastError=null;this.lastProvider=null;}

  async marketRows({force=false}={}){
    const cacheKey='market:all-symbols';
    if(!force){const cached=this.db.cacheGet(cacheKey);if(cached)return cached;}
    let rows;const providerMode=this.runtime?.hasApiProviders?.()?'brsapi':this.config.provider;
    if(providerMode==='mock') rows=await fetchMockSymbols();
    else if(providerMode==='brsapi'){
      const providers=this.runtime?.orderedProviders?.()||[{id:'default',...this.config.brs}],errors=[];
      if(!providers.length)throw new Error('هیچ کلید فعال BRSAPI تعریف نشده است.');
      for(const provider of providers){try{rows=await fetchBrsSymbols(provider,endpoint=>this.quota.reserve(endpoint,new Date(),provider.id));this.runtime?.reportProvider?.(provider.id,true);this.lastProvider=provider.name||provider.id;break;}catch(error){this.runtime?.reportProvider?.(provider.id,false);errors.push(`${provider.name||provider.id}: ${error.message}`);}}
      if(!rows)throw new Error(`همه مسیرهای BRSAPI ناموفق بودند؛ ${errors.join(' | ')}`);
    }
    else throw new Error(`منبع داده ناشناخته است: ${this.config.provider}`);
    const expires=new Date(Date.now()+this.config.marketCacheSeconds*1000).toISOString();
    this.db.cacheSet(cacheKey,rows,expires); this.db.upsertSymbols(rows); return rows;
  }

  async refreshCatalog(force=false){const rows=await this.marketRows({force});return {count:rows.length};}

  async marketIndex({force=false}={}){const cacheKey='market:index';if(!force){const cached=this.db.cacheGet(cacheKey);if(cached)return cached;}const providerMode=this.runtime?.hasApiProviders?.()?'brsapi':this.config.provider;let value;if(providerMode==='mock')value=await fetchMockIndex();else{const providers=this.runtime?.orderedProviders?.()||[{id:'default',...this.config.brs}],errors=[];for(const provider of providers){try{value=await fetchBrsIndex(provider,1,endpoint=>this.quota.reserve(endpoint,new Date(),provider.id));this.runtime?.reportProvider?.(provider.id,true);break;}catch(error){this.runtime?.reportProvider?.(provider.id,false);errors.push(`${provider.name||provider.id}: ${error.message}`);}}if(!value)throw new Error(`شاخص بازار دریافت نشد؛ ${errors.join(' | ')}`);}this.db.cacheSet(cacheKey,value,new Date(Date.now()+this.config.marketCacheSeconds*1000).toISOString());return value;}

  async candlesFor(symbol,{force=false}={}){
    const stored=this.db.candles(symbol,this.config.candleCount||120);if(!force&&stored.length>=50)return stored;
    const providerMode=this.runtime?.hasApiProviders?.()?'brsapi':this.config.provider;
    if(providerMode==='mock')return stored;
    const providers=this.runtime?.orderedProviders?.()||[{id:'default',...this.config.brs}],errors=[];
    for(const provider of providers){try{const candles=await fetchBrsCandles(provider,symbol,this.config.candleType||3,this.config.candleCount||120,endpoint=>this.quota.reserve(endpoint,new Date(),provider.id));this.db.upsertCandles(symbol,candles,'brsapi',1);this.runtime?.reportProvider?.(provider.id,true);return this.db.candles(symbol,this.config.candleCount||120);}catch(error){this.runtime?.reportProvider?.(provider.id,false);errors.push(`${provider.name||provider.id}: ${error.message}`);}}
    if(stored.length)return stored;throw new Error(`تاریخچه ${symbol} دریافت نشد؛ ${errors.join(' | ')}`);
  }

  async analyzeSymbol(symbol,{forceHistory=false}={}){
    let row=this.db.symbolDetail(symbol);if(!row){const rows=await this.marketRows();row=rows.find(x=>x.symbol===symbol);}if(!row)throw new Error('نماد در فهرست بازار پیدا نشد.');
    const candles=await this.candlesFor(symbol,{force:forceHistory}),analysis=buildIndicatorAnalysis(candles,row);return {symbol:row,analysis,historySource:candles.length?'کش محلی کندل تعدیل‌شده':'فاقد تاریخچه'};
  }

  async ruleContext(symbol,row,market){
    if(!row)return {current:{},previous:{},liveHistory:[],portfolio:null,market};
    const candles=await this.candlesFor(symbol),analysis=buildIndicatorAnalysis(candles,row),history=this.db.symbolTickHistory(symbol,50),previous=history.at(-1)||{},batchId=`${row.date||'live'}:${row.time||Math.floor(Date.now()/300000)}`;
    const current=analysis.context||{price:row.lastPrice,close:row.closePrice};this.db.addSymbolTick(batchId,symbol,current);
    const position=this.db.portfolioPosition(symbol);if(position&&position.quantity>0&&position.avg_price>0)position.profit_pct=(Number(current.price)/Number(position.avg_price)-1)*100;
    return {current,previous,liveHistory:history,portfolio:position,market,analysis};
  }

  historyWindow(expression){
    let minutes=60;
    const visit=node=>{if(node.options?.minutes)minutes=Math.max(minutes,Number(node.options.minutes));(node.children||[]).forEach(visit);};visit(expression);
    return Math.min(Math.max(minutes,15),1440);
  }

  shouldNotify(monitor,result){
    if(result.state!=='active'||monitor.lastState==='active')return false;
    if(!monitor.lastNotifiedAt)return true;
    return Date.now()-Date.parse(monitor.lastNotifiedAt)>=monitor.cooldownMinutes*60000;
  }

  nextSchedule(monitor){
    const next=new Date(Math.max(Date.now(),Date.parse(monitor.nextRunAt))+monitor.intervalMinutes*60000);
    const end=Date.parse(monitor.endAt); return {nextRunAt:next.toISOString(),status:next.getTime()>end?'expired':'active'};
  }

  async evaluateMonitor(monitor,row){
    if(!Number.isFinite(Number(row.lastPrice))||Number(row.lastPrice)<=0||/(ممنوع|متوقف|بسته)/.test(String(row.state||''))){
      const result={state:'insufficient',description:`وضعیت داده یا نماد معتبر نیست: ${row.state||'قیمت نامعتبر'}`};
      this.db.addEvent(monitor.id,'insufficient',result,row,false);const schedule=this.nextSchedule(monitor);this.db.updateAfterRun(monitor.id,{state:'insufficient',...schedule});return {monitorId:monitor.id,symbol:monitor.symbol,state:'insufficient',result,telegramSent:false};
    }
    const observedAt=nowIso();
    const since=new Date(Date.now()-this.historyWindow(monitor.expression)*60000).toISOString();
    const history=this.db.snapshotHistory(monitor.symbol,since);
    const result=evaluateExpression(monitor.expression,{...row,observedAt},history);
    let notified=false;
    if(this.shouldNotify(monitor,result)){
      const targets=this.runtime?.telegramTargets?.()||[this.config.telegram];
      const sent=await sendMonitorAlertMany(targets,monitor,row,result);
      notified=!sent.skipped;
    }
    this.db.addEvent(monitor.id,result.state,result,row,notified);
    const schedule=this.nextSchedule(monitor);
    this.db.updateAfterRun(monitor.id,{state:result.state,nextRunAt:schedule.nextRunAt,status:schedule.status,notified});
    return {monitorId:monitor.id,symbol:monitor.symbol,state:result.state,result,telegramSent:notified};
  }

  async runDue({forceMonitorId=null,forceFetch=false}={}){
    if(this.running) return {skipped:true,reason:'running'};
    this.running=true;
    try{
      let monitors=forceMonitorId?[this.db.getMonitor(Number(forceMonitorId))].filter(Boolean):this.db.dueMonitors();
      if(!forceMonitorId){for(const expired of monitors.filter(x=>Date.parse(x.endAt)<Date.now()))this.db.updateMonitorStatus(expired.id,'expired');monitors=monitors.filter(x=>Date.parse(x.endAt)>=Date.now());}
      if(!monitors.length)return {monitors:0,results:[]};
      const rows=await this.marketRows({force:forceFetch}); const bySymbol=new Map(rows.map(x=>[x.symbol,x])); const results=[],batchId=`${rows[0]?.date||'live'}:${rows[0]?.time||Math.floor(Date.now()/300000)}`;for(const symbol of new Set(monitors.map(x=>x.symbol))){const row=bySymbol.get(symbol);if(row)this.db.addSnapshot(symbol,row,nowIso());}
      for(const monitor of monitors){
        const row=bySymbol.get(monitor.symbol);
        if(!row){const result={state:'insufficient',description:'نماد در پاسخ منبع داده پیدا نشد.'};this.db.addEvent(monitor.id,'insufficient',result,null,false);const schedule=this.nextSchedule(monitor);this.db.updateAfterRun(monitor.id,{state:'insufficient',...schedule});results.push({monitorId:monitor.id,state:'insufficient'});continue;}
        results.push(await this.evaluateMonitor(monitor,row));
      }
      this.lastRunAt=nowIso();this.lastError=null;return {monitors:monitors.length,results};
    }catch(error){this.lastError=error.message;throw error;}finally{this.running=false;}
  }

  status(){return {provider:this.runtime?.hasApiProviders?.()?'brsapi':this.config.provider,running:this.running,lastRunAt:this.lastRunAt,lastError:this.lastError,lastProvider:this.lastProvider};}
}
