import test from 'node:test';
import assert from 'node:assert/strict';
import { isMarketWindow } from '../src/schedule.js';

const schedule = { timeZone: 'Asia/Tehran', start: '08:40', end: '12:35' };

test('runs during Tehran market window on a trading day', () => {
  assert.equal(isMarketWindow(schedule, new Date('2026-09-16T06:30:00Z')), true);
});

test('does not run outside market hours', () => {
  assert.equal(isMarketWindow(schedule, new Date('2026-09-16T15:00:00Z')), false);
});

test('does not run on Thursday', () => {
  assert.equal(isMarketWindow(schedule, new Date('2026-09-17T06:30:00Z')), false);
});
