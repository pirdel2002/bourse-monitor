import fs from 'node:fs';
import path from 'node:path';

export function loadDotEnv(file = '.env') {
  const target = path.resolve(file);
  if (!fs.existsSync(target)) return;
  for (const raw of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 1) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function number(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function secret(name,fallback=''){return process.env[name]||fallback;}

export function getConfig() {
  return {
    port: number('PORT', 3000),
    appName: process.env.APP_NAME || 'ربات پیشنهاد بورس',
    pollIntervalSeconds: Math.max(5, number('POLL_INTERVAL_SECONDS', 15)),
    marketCacheSeconds: Math.max(30,number('MARKET_CACHE_SECONDS',150)),
    adminToken: secret('ADMIN_TOKEN'),
    publicUrl: secret('PUBLIC_URL'),
    retentionDays: Math.max(7,number('RETENTION_DAYS',90)),
    cooldownMinutes: Math.max(1, number('SIGNAL_COOLDOWN_MINUTES', 30)),
    minSignalScore: Math.min(100, Math.max(0, number('MIN_SIGNAL_SCORE', 65))),
    scanScope: process.env.SCAN_SCOPE === 'watchlist' ? 'watchlist' : 'all',
    maxDashboardSignals: Math.max(5, number('MAX_DASHBOARD_SIGNALS', 30)),
    maxAlertsPerScan: Math.max(0, number('MAX_ALERTS_PER_SCAN', 3)),
    minTradeCount: Math.max(0, number('MIN_TRADE_COUNT', 50)),
    minTradeValue: Math.max(0, number('MIN_TRADE_VALUE', 10_000_000_000)),
    technicalCandidates: Math.max(0, number('TECHNICAL_CANDIDATES', 10)),
    candleType: number('CANDLE_TYPE', 3),
    candleCount: Math.max(50, number('CANDLE_COUNT', 120)),
    marketSchedule: {
      timeZone: process.env.MARKET_TIMEZONE || 'Asia/Tehran',
      start: process.env.MARKET_START || '08:40',
      end: process.env.MARKET_END || '12:35'
    },
    provider: process.env.DATA_PROVIDER || 'mock',
    watchlist: (process.env.WATCHLIST || '').split(',').map(x => x.trim()).filter(Boolean),
    dbPath: process.env.DB_PATH || './data/signals.db',
    brs: {
      apiKey: process.env.BRS_API_KEY || '',
      baseUrl: process.env.BRS_BASE_URL || '',
      allSymbolsPath: process.env.BRS_ALL_SYMBOLS_PATH || '',
      allSymbolsType: number('BRS_ALL_SYMBOLS_TYPE', 1),
      symbolPath: process.env.BRS_SYMBOL_PATH || '/Tsetmc/Symbol.php',
      indexPath: process.env.BRS_INDEX_PATH || '/Tsetmc/Index.php',
      candlePath: process.env.BRS_CANDLE_PATH || '/Tsetmc/Candlestick.php',
      apiKeyHeader: process.env.BRS_API_KEY_HEADER || 'X-API-Key',
      apiKeyQuery: process.env.BRS_API_KEY_QUERY || ''
    },
    telegram: {
      token: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.TELEGRAM_CHAT_ID || ''
    },
    quota: {
      timeZone: process.env.MARKET_TIMEZONE || 'Asia/Tehran',
      globalFiveMinutes: Math.max(1,number('BRS_GLOBAL_5MIN_LIMIT',300)),
      endpoints: {
        allSymbols:{daily:Math.max(1,number('BRS_ALL_SYMBOLS_DAILY_LIMIT',100)),fiveMinutes:Math.max(1,number('BRS_ALL_SYMBOLS_5MIN_LIMIT',2))},
        symbol:{daily:Math.max(1,number('BRS_SYMBOL_DAILY_LIMIT',10)),fiveMinutes:Math.max(1,number('BRS_SYMBOL_5MIN_LIMIT',2))},
        index:{daily:Math.max(1,number('BRS_INDEX_DAILY_LIMIT',100)),fiveMinutes:Math.max(1,number('BRS_INDEX_5MIN_LIMIT',2))},
        candlestick:{daily:Math.max(1,number('BRS_CANDLE_DAILY_LIMIT',10)),fiveMinutes:Math.max(1,number('BRS_CANDLE_5MIN_LIMIT',2))}
      }
    }
  };
}
