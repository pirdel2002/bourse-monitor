import {fetchBrsSymbols} from './providers/brsapi.js';
import {fetchMockSymbols} from './providers/mock.js';
import {evaluateExpression} from './conditions.js';
import {sendMonitorAlert} from './telegram.js';

const nowIso=()=>new Date().toISOString();

export class MonitorEngine{
  constructor(config,db,quota){this.config=config;this.db=db;this.quota=quota;this.running=false;this.lastRunAt=null;this.lastError=null;}

  async marketRows({force=false}={}){
    const cacheKey='market:all-symbols';
    if(!force){const cached=this.db.cacheGet(cacheKey);if(cached)return cached;}
    let rows;
    if(this.config.provider==='mock') rows=await fetchMockSymbols();
    else if(this.config.provider==='brsapi') rows=await fetchBrsSymbols(this.config.brs,endpoint=>this.quota.reserve(endpoint));
    else throw new Error(`منبع داده ناشناخته است: ${this.config.provider}`);
    const expires=new Date(Date.now()+this.config.marketCacheSeconds*1000).toISOString();
    this.db.cacheSet(cacheKey,rows,expires); this.db.upsertSymbols(rows); return rows;
  }

  async refreshCatalog(force=false){const rows=await this.marketRows({force});return {count:rows.length};}

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
    const observedAt=nowIso(); this.db.addSnapshot(monitor.symbol,row,observedAt);
    const since=new Date(Date.now()-this.historyWindow(monitor.expression)*60000).toISOString();
    const history=this.db.snapshotHistory(monitor.symbol,since);
    const result=evaluateExpression(monitor.expression,{...row,observedAt},history);
    let notified=false;
    if(this.shouldNotify(monitor,result)){
      const sent=await sendMonitorAlert(this.config.telegram,monitor,row,result);
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
      const rows=await this.marketRows({force:forceFetch}); const bySymbol=new Map(rows.map(x=>[x.symbol,x])); const results=[];
      for(const monitor of monitors){
        const row=bySymbol.get(monitor.symbol);
        if(!row){const result={state:'insufficient',description:'نماد در پاسخ منبع داده پیدا نشد.'};this.db.addEvent(monitor.id,'insufficient',result,null,false);const schedule=this.nextSchedule(monitor);this.db.updateAfterRun(monitor.id,{state:'insufficient',...schedule});results.push({monitorId:monitor.id,state:'insufficient'});continue;}
        results.push(await this.evaluateMonitor(monitor,row));
      }
      this.lastRunAt=nowIso();this.lastError=null;return {monitors:monitors.length,results};
    }catch(error){this.lastError=error.message;throw error;}finally{this.running=false;}
  }

  status(){return {provider:this.config.provider,running:this.running,lastRunAt:this.lastRunAt,lastError:this.lastError};}
}
