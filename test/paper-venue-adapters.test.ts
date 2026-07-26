import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaperOrder } from '../src/execution/order-lifecycle.js';
import { createOpenBookPaperAdapter } from '../src/venue/openbook-paper.js';
import { createPhoenixPaperAdapter } from '../src/venue/phoenix-paper.js';

test('phoenix paper adapter reports paper-only health', async () => {
  const adapter = createPhoenixPaperAdapter();
  const health = await adapter.health();

  assert.equal(adapter.name, 'phoenix');
  assert.equal(adapter.paperOnly, true);
  assert.equal(health.ok, true);
  assert.equal(health.venue, 'phoenix');
  assert.ok(health.reason?.includes('paper adapter only'));
});

test('openbook paper adapter reports paper-only health', async () => {
  const adapter = createOpenBookPaperAdapter();
  const health = await adapter.health();

  assert.equal(adapter.name, 'openbook');
  assert.equal(adapter.paperOnly, true);
  assert.equal(health.ok, true);
  assert.equal(health.venue, 'openbook');
  assert.ok(health.reason?.includes('no SDK'));
});

test('paper adapters place and cancel paper lifecycle-compatible orders', async () => {
  const adapter = createPhoenixPaperAdapter();
  const order = createPaperOrder({
    id: 'paper-1',
    wallet: 'w1',
    side: 'buy',
    price: 0.001,
    sizeUi: 10,
    now: '2026-07-08T05:55:00.000Z'
  });

  const placed = await adapter.placePaperOrder(order);
  assert.equal(placed.status, 'placed');
  assert.equal(adapter.getPaperOrder('paper-1')?.status, 'placed');
  assert.equal(adapter.listPaperOrders().length, 1);

  const cancelled = await adapter.cancelPaperOrder('paper-1', 'test cancel');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.reason, 'test cancel');
  assert.equal(adapter.getPaperOrder('paper-1')?.status, 'cancelled');
});

test('paper adapters reject live-shaped order methods', async () => {
  const adapter = createOpenBookPaperAdapter();
  const order = createPaperOrder({
    id: 'paper-2',
    wallet: 'w1',
    side: 'sell',
    price: 0.001,
    sizeUi: 5
  });

  await assert.rejects(() => adapter.placeOrder(order), /live placeOrder is disabled/);
  await assert.rejects(() => adapter.cancelOrder(order.id), /live cancelOrder is disabled/);
});
