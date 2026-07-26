import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFill, cancelOrder, createPaperOrder, expireStaleOrder, markPlaced } from '../src/execution/order-lifecycle.js';

test('tracks paper order placement and partial/full fill lifecycle', () => {
  const planned = createPaperOrder({ id: 'o1', wallet: 'w1', side: 'buy', price: 0.001, sizeUi: 100 });
  const placed = markPlaced(planned);
  assert.equal(placed.status, 'placed');

  const partial = applyFill({ order: placed, fillSizeUi: 40 });
  assert.equal(partial.status, 'partially-filled');
  assert.equal(partial.filledUi, 40);

  const filled = applyFill({ order: partial, fillSizeUi: 999 });
  assert.equal(filled.status, 'filled');
  assert.equal(filled.filledUi, 100);
});

test('cancels active paper order', () => {
  const order = markPlaced(createPaperOrder({ id: 'o2', wallet: 'w1', side: 'sell', price: 0.002, sizeUi: 10 }));
  const cancelled = cancelOrder({ order, reason: 'stale quote' });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.reason, 'stale quote');
});

test('expires stale paper order', () => {
  const createdAt = '2026-07-05T21:00:00.000Z';
  const order = markPlaced(createPaperOrder({ id: 'o3', wallet: 'w1', side: 'buy', price: 1, sizeUi: 1, now: createdAt }), createdAt);
  const expired = expireStaleOrder({
    order,
    maxAgeMs: 1_000,
    nowMs: Date.parse('2026-07-05T21:00:02.000Z')
  });
  assert.equal(expired.status, 'expired');
});
