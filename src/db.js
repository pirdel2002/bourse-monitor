import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const nowIso = () => new Date().toISOString();

export function openDatabase(filename) {
  fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY AUTOINCREMENT,symbol TEXT NOT NULL,action TEXT NOT NULL,score INTEGER NOT NULL,price REAL NOT NULL,payload TEXT NOT NULL,observed_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_signals_symbol_time ON signals(symbol, observed_at DESC);
    CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS api_usage (endpoint TEXT NOT NULL,window_type TEXT NOT NULL,window_key TEXT NOT NULL,request_count INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(endpoint,window_type,window_key));
    CREATE TABLE IF NOT EXISTS symbol_catalog (symbol TEXT PRIMARY KEY,name TEXT NOT NULL DEFAULT '',payload TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,symbol TEXT NOT NULL,input_mode TEXT NOT NULL CHECK(input_mode IN ('text','builder')),source_text TEXT,expression_json TEXT NOT NULL,
      action_type TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity > 0),proposed_price REAL NOT NULL CHECK(proposed_price > 0),max_amount_toman REAL,
      start_at TEXT NOT NULL,end_at TEXT NOT NULL,interval_minutes INTEGER NOT NULL CHECK(interval_minutes >= 1),cooldown_minutes INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'active',next_run_at TEXT NOT NULL,last_state TEXT,last_evaluated_at TEXT,last_notified_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_monitors_due ON monitors(status,next_run_at);
    CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT,symbol TEXT NOT NULL,payload TEXT NOT NULL,observed_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_time ON snapshots(symbol,observed_at DESC);
    CREATE TABLE IF NOT EXISTS monitor_events (id INTEGER PRIMARY KEY AUTOINCREMENT,monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,state TEXT NOT NULL,evidence_json TEXT NOT NULL,snapshot_json TEXT,telegram_sent INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_events_monitor_time ON monitor_events(monitor_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS app_settings (setting_key TEXT PRIMARY KEY,value_text TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_credentials (id INTEGER PRIMARY KEY CHECK(id=1),password_hash TEXT NOT NULL,updated_at TEXT NOT NULL);
  `);

  const parseMonitor = row => row && ({ ...row, expression: JSON.parse(row.expression_json), maxAmountToman: row.max_amount_toman,
    actionType: row.action_type, proposedPrice: row.proposed_price, intervalMinutes: row.interval_minutes,
    cooldownMinutes: row.cooldown_minutes, startAt: row.start_at, endAt: row.end_at, nextRunAt: row.next_run_at,
    lastState: row.last_state, lastEvaluatedAt: row.last_evaluated_at, lastNotifiedAt: row.last_notified_at,
    inputMode: row.input_mode, sourceText: row.source_text });

  return {
    raw: db,
    insertSignal(signal) { db.prepare('INSERT INTO signals(symbol,action,score,price,payload,observed_at) VALUES (?,?,?,?,?,?)').run(signal.symbol,signal.action,signal.score,signal.price,JSON.stringify(signal),signal.observedAt); },
    recent(limit=100) { return db.prepare('SELECT payload FROM signals ORDER BY id DESC LIMIT ?').all(limit).map(x=>JSON.parse(x.payload)); },
    lastFor(symbol) { const row=db.prepare('SELECT payload FROM signals WHERE symbol=? ORDER BY id DESC LIMIT 1').get(symbol); return row?JSON.parse(row.payload):null; },
    cacheGet(key) { const row=db.prepare('SELECT payload,expires_at FROM api_cache WHERE cache_key=?').get(key); return !row||Date.parse(row.expires_at)<=Date.now()?null:JSON.parse(row.payload); },
    cacheSet(key,value,expiresAt) { db.prepare(`INSERT INTO api_cache(cache_key,payload,expires_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at`).run(key,JSON.stringify(value),expiresAt); },
    reserveApi(endpoint,windows) {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const item of windows) { const bucket=item.endpoint||endpoint; const row=db.prepare('SELECT request_count FROM api_usage WHERE endpoint=? AND window_type=? AND window_key=?').get(bucket,item.type,item.key); if ((row?.request_count||0)>=item.limit) { db.exec('ROLLBACK'); return {allowed:false,blockedBy:item.type,limit:item.limit,used:row.request_count}; } }
        for (const item of windows) { const bucket=item.endpoint||endpoint; db.prepare(`INSERT INTO api_usage(endpoint,window_type,window_key,request_count,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(endpoint,window_type,window_key) DO UPDATE SET request_count=request_count+1,updated_at=excluded.updated_at`).run(bucket,item.type,item.key,nowIso()); }
        db.exec('COMMIT'); return {allowed:true};
      } catch(error) { db.exec('ROLLBACK'); throw error; }
    },
    apiUsage() { return db.prepare('SELECT endpoint,window_type,window_key,request_count,updated_at FROM api_usage ORDER BY updated_at DESC LIMIT 100').all(); },
    upsertSymbols(rows) { const stmt=db.prepare(`INSERT INTO symbol_catalog(symbol,name,payload,updated_at) VALUES (?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name,payload=excluded.payload,updated_at=excluded.updated_at`); const stamp=nowIso(); db.exec('BEGIN'); try { for(const row of rows) stmt.run(row.symbol,row.name||'',JSON.stringify(row),stamp); db.exec('COMMIT'); } catch(error){db.exec('ROLLBACK');throw error;} },
    searchSymbols(query='',limit=30) { const term=query.trim(),contains=`%${term}%`,starts=`${term}%`;return db.prepare(`SELECT symbol,name,payload,updated_at FROM symbol_catalog WHERE symbol LIKE ? OR name LIKE ? ORDER BY CASE WHEN symbol=? THEN 0 WHEN symbol LIKE ? THEN 1 WHEN symbol LIKE ? THEN 2 WHEN name LIKE ? THEN 3 ELSE 4 END,symbol LIMIT ?`).all(contains,contains,term,starts,contains,starts,limit).map(row=>{const payload=JSON.parse(row.payload);return {symbol:row.symbol,name:row.name,updatedAt:row.updated_at,lastPrice:payload.lastPrice,closePrice:payload.closePrice,lowerLimit:payload.lowerLimit,upperLimit:payload.upperLimit,state:payload.state};}); },
    symbolDetail(symbol) { const row=db.prepare('SELECT symbol,name,payload,updated_at FROM symbol_catalog WHERE symbol=?').get(symbol);if(!row)return null;return {...JSON.parse(row.payload),symbol:row.symbol,name:row.name,updatedAt:row.updated_at}; },
    createMonitor(input) { const stamp=nowIso(); const result=db.prepare(`INSERT INTO monitors(title,symbol,input_mode,source_text,expression_json,action_type,quantity,proposed_price,max_amount_toman,start_at,end_at,interval_minutes,cooldown_minutes,status,next_run_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?)`).run(input.title,input.symbol,input.inputMode,input.sourceText||null,JSON.stringify(input.expression),input.actionType,input.quantity,input.proposedPrice,input.maxAmountToman||null,input.startAt,input.endAt,input.intervalMinutes,input.cooldownMinutes,input.startAt,stamp,stamp); return this.getMonitor(Number(result.lastInsertRowid)); },
    getMonitor(id) { return parseMonitor(db.prepare('SELECT * FROM monitors WHERE id=?').get(id)); },
    listMonitors({symbol='',archive=false,limit=500}={}) { const where=[],args=[];if(symbol){where.push('symbol=?');args.push(symbol);}where.push(archive?`status IN ('completed','cancelled','expired')`:`status NOT IN ('completed','cancelled','expired')`);args.push(Math.min(1000,Math.max(1,Number(limit)||500)));return db.prepare(`SELECT * FROM monitors WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...args).map(parseMonitor); },
    dueMonitors(at=nowIso()) { return db.prepare(`SELECT * FROM monitors WHERE status='active' AND next_run_at<=? ORDER BY next_run_at`).all(at).map(parseMonitor); },
    updateMonitorStatus(id,status) { db.prepare('UPDATE monitors SET status=?,updated_at=? WHERE id=?').run(status,nowIso(),id); return this.getMonitor(id); },
    deleteMonitor(id) { if(!this.getMonitor(id))return false;db.prepare('DELETE FROM monitors WHERE id=?').run(id);return true; },
    updateAfterRun(id,{state,nextRunAt,status='active',notified=false}) { db.prepare(`UPDATE monitors SET last_state=?,last_evaluated_at=?,last_notified_at=CASE WHEN ? THEN ? ELSE last_notified_at END,next_run_at=?,status=?,updated_at=? WHERE id=?`).run(state,nowIso(),notified?1:0,nowIso(),nextRunAt,status,nowIso(),id); },
    addSnapshot(symbol,payload,observedAt=nowIso()) { db.prepare('INSERT INTO snapshots(symbol,payload,observed_at) VALUES (?,?,?)').run(symbol,JSON.stringify(payload),observedAt); },
    snapshotHistory(symbol,sinceIso,limit=200) { return db.prepare(`SELECT payload,observed_at FROM snapshots WHERE symbol=? AND observed_at>=? ORDER BY observed_at ASC LIMIT ?`).all(symbol,sinceIso,limit).map(x=>({...JSON.parse(x.payload),observedAt:x.observed_at})); },
    addEvent(monitorId,state,evidence,snapshot,telegramSent=false) { db.prepare('INSERT INTO monitor_events(monitor_id,state,evidence_json,snapshot_json,telegram_sent,created_at) VALUES (?,?,?,?,?,?)').run(monitorId,state,JSON.stringify(evidence),snapshot?JSON.stringify(snapshot):null,telegramSent?1:0,nowIso()); },
    recentEvents(limit=100,{symbol='',monitorId=null,sent=''}={}) { const where=[],args=[];if(symbol){where.push('m.symbol=?');args.push(symbol);}if(monitorId){where.push('e.monitor_id=?');args.push(Number(monitorId));}if(sent==='yes'||sent==='no'){where.push('e.telegram_sent=?');args.push(sent==='yes'?1:0);}args.push(Math.min(2000,Math.max(1,Number(limit)||100)));return db.prepare(`SELECT e.*,m.title,m.symbol,m.action_type,m.quantity,m.proposed_price FROM monitor_events e JOIN monitors m ON m.id=e.monitor_id ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY e.id DESC LIMIT ?`).all(...args).map(x=>({...x,evidence:JSON.parse(x.evidence_json),snapshot:x.snapshot_json?JSON.parse(x.snapshot_json):null})); },
    stats() { return {monitors:Number(db.prepare(`SELECT count(*) count FROM monitors WHERE status='active'`).get().count),alerts:Number(db.prepare(`SELECT count(*) count FROM monitor_events WHERE telegram_sent=1`).get().count),symbols:Number(db.prepare('SELECT count(*) count FROM symbol_catalog').get().count),events:Number(db.prepare('SELECT count(*) count FROM monitor_events').get().count)}; },
    getSetting(key) { return db.prepare('SELECT value_text FROM app_settings WHERE setting_key=?').get(key)?.value_text||null; },
    setSetting(key,value) { db.prepare(`INSERT INTO app_settings(setting_key,value_text,updated_at) VALUES (?,?,?) ON CONFLICT(setting_key) DO UPDATE SET value_text=excluded.value_text,updated_at=excluded.updated_at`).run(key,String(value),nowIso()); },
    getCredential() { return db.prepare('SELECT password_hash,updated_at FROM admin_credentials WHERE id=1').get()||null; },
    setCredential(hash) { db.prepare(`INSERT INTO admin_credentials(id,password_hash,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at`).run(hash,nowIso()); },
    exportPortable() { const tables=['signals','api_cache','api_usage','symbol_catalog','monitors','snapshots','monitor_events','admin_credentials'];return Object.fromEntries(tables.map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()])); },
    restorePortable(data) { const orderDelete=['monitor_events','snapshots','monitors','signals','api_cache','api_usage','symbol_catalog','admin_credentials'];const orderInsert=['signals','api_cache','api_usage','symbol_catalog','monitors','snapshots','monitor_events','admin_credentials'];db.exec('BEGIN IMMEDIATE');try{for(const table of orderDelete)db.exec(`DELETE FROM ${table}`);for(const table of orderInsert){const rows=Array.isArray(data?.[table])?data[table]:[];const allowed=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name));for(const row of rows){const keys=Object.keys(row).filter(x=>allowed.has(x));if(!keys.length)continue;db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));}}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;} },
    prune(retentionDays=30) { const cutoff=new Date(Date.now()-retentionDays*86400000).toISOString(); db.prepare('DELETE FROM snapshots WHERE observed_at<?').run(cutoff); db.prepare('DELETE FROM api_usage WHERE updated_at<?').run(cutoff); },
    close(){db.close();}
  };
}
