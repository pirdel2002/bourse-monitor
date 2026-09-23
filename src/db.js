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
    searchSymbols(query='',limit=30) { const q=`%${query.trim()}%`; return db.prepare(`SELECT symbol,name,updated_at FROM symbol_catalog WHERE symbol LIKE ? OR name LIKE ? ORDER BY CASE WHEN symbol=? THEN 0 ELSE 1 END,symbol LIMIT ?`).all(q,q,query.trim(),limit); },
    createMonitor(input) { const stamp=nowIso(); const result=db.prepare(`INSERT INTO monitors(title,symbol,input_mode,source_text,expression_json,action_type,quantity,proposed_price,max_amount_toman,start_at,end_at,interval_minutes,cooldown_minutes,status,next_run_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?)`).run(input.title,input.symbol,input.inputMode,input.sourceText||null,JSON.stringify(input.expression),input.actionType,input.quantity,input.proposedPrice,input.maxAmountToman||null,input.startAt,input.endAt,input.intervalMinutes,input.cooldownMinutes,input.startAt,stamp,stamp); return this.getMonitor(Number(result.lastInsertRowid)); },
    getMonitor(id) { return parseMonitor(db.prepare('SELECT * FROM monitors WHERE id=?').get(id)); },
    listMonitors() { return db.prepare('SELECT * FROM monitors ORDER BY id DESC').all().map(parseMonitor); },
    dueMonitors(at=nowIso()) { return db.prepare(`SELECT * FROM monitors WHERE status='active' AND next_run_at<=? ORDER BY next_run_at`).all(at).map(parseMonitor); },
    updateMonitorStatus(id,status) { db.prepare('UPDATE monitors SET status=?,updated_at=? WHERE id=?').run(status,nowIso(),id); return this.getMonitor(id); },
    updateAfterRun(id,{state,nextRunAt,status='active',notified=false}) { db.prepare(`UPDATE monitors SET last_state=?,last_evaluated_at=?,last_notified_at=CASE WHEN ? THEN ? ELSE last_notified_at END,next_run_at=?,status=?,updated_at=? WHERE id=?`).run(state,nowIso(),notified?1:0,nowIso(),nextRunAt,status,nowIso(),id); },
    addSnapshot(symbol,payload,observedAt=nowIso()) { db.prepare('INSERT INTO snapshots(symbol,payload,observed_at) VALUES (?,?,?)').run(symbol,JSON.stringify(payload),observedAt); },
    snapshotHistory(symbol,sinceIso,limit=200) { return db.prepare(`SELECT payload,observed_at FROM snapshots WHERE symbol=? AND observed_at>=? ORDER BY observed_at ASC LIMIT ?`).all(symbol,sinceIso,limit).map(x=>({...JSON.parse(x.payload),observedAt:x.observed_at})); },
    addEvent(monitorId,state,evidence,snapshot,telegramSent=false) { db.prepare('INSERT INTO monitor_events(monitor_id,state,evidence_json,snapshot_json,telegram_sent,created_at) VALUES (?,?,?,?,?,?)').run(monitorId,state,JSON.stringify(evidence),snapshot?JSON.stringify(snapshot):null,telegramSent?1:0,nowIso()); },
    recentEvents(limit=100) { return db.prepare(`SELECT e.*,m.title,m.symbol,m.action_type,m.quantity,m.proposed_price FROM monitor_events e JOIN monitors m ON m.id=e.monitor_id ORDER BY e.id DESC LIMIT ?`).all(limit).map(x=>({...x,evidence:JSON.parse(x.evidence_json),snapshot:x.snapshot_json?JSON.parse(x.snapshot_json):null})); },
    prune(retentionDays=30) { const cutoff=new Date(Date.now()-retentionDays*86400000).toISOString(); db.prepare('DELETE FROM snapshots WHERE observed_at<?').run(cutoff); db.prepare('DELETE FROM api_usage WHERE updated_at<?').run(cutoff); },
    close(){db.close();}
  };
}
