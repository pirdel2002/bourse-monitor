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
  `},
  {version:4,sql:`
    ALTER TABLE portfolio_positions ADD COLUMN buy_fee_pct REAL NOT NULL DEFAULT 1.262;
  `},
  {version:5,sql:`
    UPDATE portfolio_positions SET buy_fee_pct=1.262 WHERE ABS(buy_fee_pct-0.3712)<0.000001;
  `},
  {version:6,sql:`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('SENIOR','NORMAL')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );
    ALTER TABLE admin_sessions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE monitors ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE rules_v2 ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE rules_v2 ADD COLUMN visibility TEXT NOT NULL DEFAULT 'PERSONAL' CHECK(visibility IN ('PERSONAL','GLOBAL'));
    ALTER TABLE rules_v2 ADD COLUMN managed_pack TEXT;
    CREATE INDEX IF NOT EXISTS idx_monitors_user ON monitors(user_id,status,next_run_at);
    CREATE INDEX IF NOT EXISTS idx_rules_v2_user ON rules_v2(user_id,visibility,enabled,status);
    CREATE TABLE IF NOT EXISTS user_portfolio_positions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      avg_price REAL NOT NULL DEFAULT 0,
      entry_date TEXT,
      highest_price_since_entry REAL,
      stop_price REAL,
      target_price REAL,
      updated_at TEXT NOT NULL,
      initial_stop_price REAL,
      buy_fee_pct REAL NOT NULL DEFAULT 1.262,
      PRIMARY KEY(user_id,symbol)
    );
    CREATE TABLE IF NOT EXISTS user_strategy_symbol_states (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
      PRIMARY KEY(user_id,strategy_key,symbol)
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      setting_key TEXT NOT NULL,
      value_text TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,setting_key)
    );
    CREATE TABLE IF NOT EXISTS global_rule_subscriptions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rule_id INTEGER NOT NULL REFERENCES rules_v2(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,rule_id)
    );
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      requested_at TEXT NOT NULL
    );
  `}
];

export function runMigrations(db){
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)');
  const applied=new Set(db.prepare('SELECT version FROM schema_migrations').all().map(x=>Number(x.version)));
  for(const migration of migrations){if(applied.has(migration.version))continue;db.exec('BEGIN IMMEDIATE');try{db.exec(migration.sql);db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES (?,?)').run(migration.version,new Date().toISOString());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
}
