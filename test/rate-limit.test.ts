import assert from 'node:assert/strict';
import test from 'node:test';
import { tradesInWindow, wouldExceedTradesPerMinute } from '../src/risk/rate-limit.js';

const now = Date.parse('2026-07-05T21:30:00.000Z');

const trades = [
  { observedAt: '2026-07-05T21:29:05.000Z', wallet: 'w1', side: 'buy' as const },
  { observedAt: '2026-07-05T21:29:45.000Z', wallet: 'w1', side: 'sell' as const },
  { observedAt: '2026-07-05T21:28:00.000Z', wallet: 'w1', side: 'buy' as const },
  { observedAt: '2026-07-05T21:29:50.000Z', wallet: 'w2', side: 'buy' as const }
];

test('counts trades inside time window', () => {
  assert.equal(tradesInWindow({ trades, nowMs: now, windowMs: 60_000 }), 3);
  assert.equal(tradesInWindow({ trades, nowMs: now, windowMs: 60_000, wallet: 'w1' }), 2);
});

test('detects trades-per-minute cap', () => {
  assert.equal(wouldExceedTradesPerMinute({ trades, maxTradesPerMinute: 2, nowMs: now, wallet: 'w1' }), true);
  assert.equal(wouldExceedTradesPerMinute({ trades, maxTradesPerMinute: 3, nowMs: now, wallet: 'w1' }), false);
});
