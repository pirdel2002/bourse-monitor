import { rankSignals } from './scoring.js';
import { fetchMockSymbols, fetchMockIndex } from './providers/mock.js';
import { fetchBrsSymbols, fetchBrsWatchlist, fetchBrsIndex, fetchBrsCandles } from './providers/brsapi.js';
import { sendTelegram, formatSignal } from './telegram.js';
import { applyTechnical, technicalSummary } from './technical.js';

export class SignalEngine {
  constructor(config, db) {
    this.config = config;
    this.db = db;
    this.latest = [];
    this.market = null;
    this.lastRunAt = null;
    this.lastError = null;
    this.running = false;
  }

  async fetchRows() {
    if (this.config.provider === 'mock') return fetchMockSymbols();
    if (this.config.provider === 'brsapi') {
      if (this.config.brs.allSymbolsPath) return fetchBrsSymbols(this.config.brs);
      return fetchBrsWatchlist(this.config.brs, this.config.watchlist);
    }
    throw new Error(`DATA_PROVIDER ناشناخته: ${this.config.provider}`);
  }


  async fetchMarket() {
    if (this.config.provider === 'mock') return fetchMockIndex();
    if (this.config.provider === 'brsapi') return fetchBrsIndex(this.config.brs, 1);
    return null;
  }

  shouldNotify(signal, previous) {
    if (!['BUY', 'SELL'].includes(signal.action)) return false;
    if (signal.action === 'BUY' && signal.score < this.config.minSignalScore) return false;
    if (!previous || previous.action !== signal.action) return true;
    const elapsed = Date.now() - Date.parse(previous.observedAt);
    return elapsed >= this.config.cooldownMinutes * 60_000 && Math.abs(signal.score - previous.score) >= 8;
  }

  async addTechnical(ranked) {
    if (this.config.provider !== 'brsapi' || this.config.technicalCandidates === 0) return ranked;
    const candidates = ranked.filter(x => x.score >= 55).slice(0, this.config.technicalCandidates);
    const enriched = new Map();
    const tomorrow = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
    for (const signal of candidates) {
      const key = `candles:${this.config.candleType}:${this.config.candleCount}:${signal.symbol}`;
      let candles = this.db.cacheGet(key);
      if (!candles) {
        candles = await fetchBrsCandles(this.config.brs, signal.symbol, this.config.candleType, this.config.candleCount);
        this.db.cacheSet(key, candles, tomorrow);
      }
      enriched.set(signal.symbol, applyTechnical(signal, technicalSummary(candles)));
    }
    return ranked.map(signal => enriched.get(signal.symbol) || signal).sort((a, b) => b.score - a.score);
  }

  async run() {
    if (this.running) return this.latest;
    this.running = true;
    try {
      const [rows, market] = await Promise.all([this.fetchRows(), this.fetchMarket()]);
      this.market = market;
      const filter = this.config.scanScope === 'watchlist' ? this.config.watchlist : [];
      const preliminary = rankSignals(rows, filter, market, {
        minTradeCount: this.config.minTradeCount,
        minTradeValue: this.config.minTradeValue
      });
      const ranked = await this.addTechnical(preliminary);
      const buys = ranked.filter(x => x.action === 'BUY').slice(0, Math.ceil(this.config.maxDashboardSignals / 2));
      const sells = ranked.filter(x => x.action === 'SELL').slice(-Math.floor(this.config.maxDashboardSignals / 3)).reverse();
      const holds = ranked.filter(x => x.action === 'HOLD').slice(0, Math.max(0, this.config.maxDashboardSignals - buys.length - sells.length));
      const signals = [...buys, ...sells, ...holds].slice(0, this.config.maxDashboardSignals);
      let alertsSent = 0;
      for (const signal of signals) {
        const previous = this.db.lastFor(signal.symbol);
        this.db.insertSignal(signal);
        if (alertsSent < this.config.maxAlertsPerScan && this.shouldNotify(signal, previous)) {
          await sendTelegram(this.config.telegram, formatSignal(signal));
          alertsSent += 1;
        }
      }
      this.latest = signals;
      this.lastRunAt = new Date().toISOString();
      this.lastError = null;
      return signals;
    } catch (error) {
      this.lastError = error.message;
      throw error;
    } finally {
      this.running = false;
    }
  }

  status() {
    return { provider: this.config.provider, lastRunAt: this.lastRunAt, lastError: this.lastError, running: this.running, market: this.market };
  }
}
