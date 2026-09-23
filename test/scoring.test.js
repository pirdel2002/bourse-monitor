import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSymbol, rankSignals } from '../src/scoring.js';

test('strong demand produces a buy signal', () => {
  const signal = analyzeSymbol({
    symbol: 'TEST', lastPrice: 1000, changePct: 3, volume: 300, avgVolume30: 100,
    buyVolumeReal: 400, buyCountReal: 10, sellVolumeReal: 100, sellCountReal: 10,
    buyQueueValue: 1000, sellQueueValue: 10
  });
  assert.equal(signal.action, 'BUY');
  assert.ok(signal.score >= 70);
  assert.equal(signal.stopLoss, 940);
});

test('weak selling conditions produce a sell signal', () => {
  const signal = analyzeSymbol({
    symbol: 'TEST', lastPrice: 1000, changePct: -5, volume: 20, avgVolume30: 100,
    buyVolumeReal: 20, buyCountReal: 10, sellVolumeReal: 200, sellCountReal: 10,
    buyQueueValue: 0, sellQueueValue: 1000
  });
  assert.equal(signal.action, 'SELL');
  assert.ok(signal.score <= 35);
});

test('watchlist filters and score orders symbols', () => {
  const rows = [
    { symbol: 'A', lastPrice: 100, changePct: 3, volume: 300, avgVolume30: 100, buyVolumeReal: 300, buyCountReal: 10, sellVolumeReal: 100, sellCountReal: 10 },
    { symbol: 'B', lastPrice: 100, changePct: -2, volume: 100, avgVolume30: 100 },
    { symbol: 'C', lastPrice: 100, changePct: 5, volume: 500, avgVolume30: 100 }
  ];
  const ranked = rankSignals(rows, ['A', 'B']);
  assert.deepEqual(ranked.map(x => x.symbol), ['A', 'B']);
});

test('broad negative market reduces the symbol score', () => {
  const row = { symbol: 'A', changePct: 2, volume: 200, avgVolume30: 100, buyVolumeReal: 200, buyCountReal: 10, sellVolumeReal: 100, sellCountReal: 10 };
  const neutral = analyzeSymbol(row);
  const bearish = analyzeSymbol(row, { indexChange: -100, equalWeightChange: -50 });
  assert.equal(neutral.score - bearish.score, 8);
  assert.ok(bearish.reasons.includes('فشار منفی بازار و هم‌وزن'));
});

test('liquidity filters remove thin symbols', () => {
  const rows = [
    { symbol: 'LIQ', lastPrice: 100, tradeCount: 100, tradeValue: 20_000_000_000 },
    { symbol: 'THIN', lastPrice: 100, tradeCount: 5, tradeValue: 100_000_000 }
  ];
  const result = rankSignals(rows, [], null, { minTradeCount: 50, minTradeValue: 10_000_000_000 });
  assert.deepEqual(result.map(x => x.symbol), ['LIQ']);
});
