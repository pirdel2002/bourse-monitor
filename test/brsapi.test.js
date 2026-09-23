import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrsSymbol, normalizeBrsIndex, normalizeCandles, brsHeaders } from '../src/providers/brsapi.js';

test('uses an explicit browser User-Agent for every BRSAPI request', () => {
  const headers = brsHeaders({ userAgent: 'Mozilla/5.0 TestBrowser' });
  assert.equal(headers['user-agent'], 'Mozilla/5.0 TestBrowser');
  assert.equal(headers.accept, 'application/json');
});

test('normalizes the documented comprehensive symbol fields', () => {
  const row = normalizeBrsSymbol({
    date: '1403-12-22', time: '15:53:06', state: 'مجاز', l18: 'خودرو', l30: 'ایران خودرو',
    pl: 3863, plp: -2.99, pc: 3864, tvol: 1521006030, tvol_avg_1m: 662783913,
    Buy_CountI: 7279, Sell_CountI: 3620, Buy_I_Volume: 858040544, Sell_I_Volume: 1274483625,
    tmin: 3863, tmax: 4101, pd1: 3863, qd1: 444690, po1: 3863, qo1: 8000,
    bvol: 30310685,
    cs: 'خودرو و ساخت قطعات', m: 'بورس', eps: -784, pe: -4.93, g_pe: -11.57
  });
  assert.equal(row.symbol, 'خودرو');
  assert.equal(row.lastPrice, 3863);
  assert.equal(row.changePct, -2.99);
  assert.equal(row.avgVolume30, 662783913);
  assert.equal(row.volumeBenchmarkType, 'میانگین ماه');
  assert.equal(row.sellQueueValue, 3863 * 8000);
  assert.equal(row.buyQueueValue, 0);
  assert.equal(row.industry, 'خودرو و ساخت قطعات');
});

test('uses base volume as the AllSymbols volume benchmark', () => {
  const row = normalizeBrsSymbol({ l18: 'شتران', pl: 4499, pc: 4529, plp: 1.4, tvol: 174743191, bvol: 27485112 });
  assert.equal(row.avgVolume30, 27485112);
  assert.equal(row.volumeBenchmarkType, 'حجم مبنا');
});

test('does not use the artificial ETF base volume of one', () => {
  const row = normalizeBrsSymbol({ l18: 'عیار', pl: 315399, pc: 315703, tvol: 109631798, bvol: 1, tno: 85036, tval: 34611114638167 });
  assert.equal(row.avgVolume30, 0);
  assert.equal(row.volumeBenchmarkType, null);
  assert.equal(row.tradeCount, 85036);
});

test('maps assembly items from comprehensive symbol response', () => {
  const row = normalizeBrsSymbol({ l18: 'خودرو', pl: 3863, assembly: [{ title: 'دعوت به مجمع', date_publish: '1403/12/16', content: 'افزایش سرمایه' }] });
  assert.equal(row.assemblies.length, 1);
  assert.equal(row.assemblies[0].datePublish, '1403/12/16');
});

test('normalizes the documented index response', () => {
  const index = normalizeBrsIndex({ index: 2756970.28, index_change: -33000.22, index_equalWeight: 814270.85, index_equalWeight_change: -9859.51 });
  assert.equal(index.indexChange, -33000.22);
  assert.equal(index.equalWeight, 814270.85);
});

test('reads adjusted candles from the real response envelope', () => {
  const rows = normalizeCandles({
    l18: 'فملی', type: 3, count: 2,
    candle_daily_adjusted: [
      { date: '1404-02-24', open: 7380, high: 7400, low: 7280, close: 7340, volume: 180715348 },
      { date: '1404-02-23', open: 7490, high: 7500, low: 7280, close: 7390, volume: 610004111 }
    ]
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '1404-02-24');
  assert.equal(rows[0].close, 7340);
});
