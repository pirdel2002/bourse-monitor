const migrations=[
  {version:1,sql:`
    CREATE TABLE IF NOT EXISTS rules_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,rule_id TEXT NOT NULL UNIQUE,legacy_monitor_id INTEGER UNIQUE,symbol TEXT,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 1,
      scope TEXT NOT NULL CHECK(scope IN ('SYMBOL','PORTFOLIO','MARKET')),severity TEXT NOT NULL CHECK(severity IN ('INFO','WATCH','BUY','STRONG_BUY','WARNING','SELL','EXIT')),
      expression_json TEXT NOT NULL,action TEXT NOT NULL,action_params_json TEXT NOT NULL DEFAULT '{}',cooldown_minutes INTEGER NOT NULL DEFAULT 30,once_per_day INTEGER NOT NULL DEFAULT 0,
      interval_minutes INTEGER NOT NULL DEFAULT 5,start_at TEXT,end_at TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rules_v2_due ON rules_v2(enabled,status,scope,symbol);
    CREATE TABLE IF NOT EXISTS rule_states_v2 (
      rule_id INTEGER PRIMARY KEY REFERENCES rules_v2(id) ON DELETE CASCADE,state TEXT NOT NULL DEFAULT 'unknown',armed INTEGER NOT NULL DEFAULT 1,last_evaluated_at TEXT,last_transition_at TEXT,last_triggered_at TEXT,last_notified_at TEXT,last_triggered_day TEXT,last_error TEXT,evidence_json TEXT
    );
    CREATE TABLE IF NOT EXISTS rule_events_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,rule_id INTEGER NOT NULL REFERENCES rules_v2(id) ON DELETE CASCADE,state TEXT NOT NULL,effective_severity TEXT,evidence_json TEXT NOT NULL,context_json TEXT,telegram_sent INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rule_events_v2_time ON rule_events_v2(rule_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS daily_candles (
      symbol TEXT NOT NULL,trade_date TEXT NOT NULL,open REAL NOT NULL,high REAL NOT NULL,low REAL NOT NULL,close REAL NOT NULL,volume REAL NOT NULL,source TEXT NOT NULL DEFAULT 'brsapi',adjusted INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,PRIMARY KEY(symbol,trade_date,adjusted)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_candles_symbol_date ON daily_candles(symbol,trade_date DESC);
    CREATE TABLE IF NOT EXISTS symbol_ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id TEXT NOT NULL,symbol TEXT NOT NULL,payload TEXT NOT NULL,observed_at TEXT NOT NULL,UNIQUE(batch_id,symbol)
    );
    CREATE INDEX IF NOT EXISTS idx_symbol_ticks_symbol_time ON symbol_ticks(symbol,observed_at DESC);
    CREATE TABLE IF NOT EXISTS market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,observed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portfolio_positions (
      symbol TEXT PRIMARY KEY,quantity INTEGER NOT NULL DEFAULT 0,avg_price REAL NOT NULL DEFAULT 0,entry_date TEXT,highest_price_since_entry REAL,stop_price REAL,target_price REAL,updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS data_sync_state (
      sync_key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL
    );
  `},
  {version:2,sql:`
    ALTER TABLE rules_v2 ADD COLUMN next_run_at TEXT;
    UPDATE rules_v2 SET next_run_at=COALESCE(start_at,created_at) WHERE next_run_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_rules_v2_next_run ON rules_v2(enabled,status,next_run_at);
  `},
  {version:3,sql:`
    ALTER TABLE portfolio_positions ADD COLUMN initial_stop_price REAL;
    CREATE TABLE IF NOT EXISTS strategy_symbol_states (
      strategy_key TEXT NOT NULL,
      symbol TEXT NOT NULL,
      state TEXT NOT NULL,
      buy_enabled INTEGER NOT NULL DEFAULT 1,
      trigger_rule_id TEXT,
      last_decision TEXT,
      last_reason_json TEXT NOT NULL DEFAULT '{}',
      triggered_at TEXT,
      confirmed_at TEXT,
      last_notified_at TEXT,
      last_notified_day TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(strategy_key,symbol)
    );
    CREATE INDEX IF NOT EXISTS idx_strategy_symbol_states_state ON strategy_symbol_states(strategy_key,state,updated_at);
  `}
];

export function runMigrations(db){
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)');
  const applied=new Set(db.prepare('SELECT version FROM schema_migrations').all().map(x=>Number(x.version)));
  for(const migration of migrations){if(applied.has(migration.version))continue;db.exec('BEGIN IMMEDIATE');try{db.exec(migration.sql);db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES (?,?)').run(migration.version,new Date().toISOString());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
}
