import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRsi, technicalSummary, applyTechnical } from '../src/technical.js';

const candles = (values) => values.map((close, index) => ({ date: `1404/01/${String(index + 1).padStart(2, '0')}`, close }));

test('calculates RSI for rising prices', () => {
  assert.equal(calculateRsi(Array.from({ length: 20 }, (_, i) => 100 + i)), 100);
});

test('identifies an established uptrend', () => {
  const summary = technicalSummary(candles(Array.from({ length: 60 }, (_, i) => 100 + i)));
  assert.equal(summary.valid, true);
  assert.ok(summary.sma20 > summary.sma50);
  assert.ok(summary.reasons.includes('روند میان‌مدت صعودی'));
});

test('technical adjustment can promote a hold signal to buy', () => {
  const result = applyTechnical({ score: 65, action: 'HOLD', reasons: [] }, { valid: true, adjustment: 10, reasons: ['روند میان‌مدت صعودی'] });
  assert.equal(result.score, 75);
  assert.equal(result.action, 'BUY');
});
