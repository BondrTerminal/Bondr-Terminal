import assert from 'node:assert/strict';
import test from 'node:test';
import { createDisabledOrderbookAdapter } from '../src/venue/disabled-orderbook.js';
import { bestBidAsk } from '../src/venue/types.js';

test('computes best bid ask and mid from orderbook snapshot', () => {
  const result = bestBidAsk({
    venue: 'openbook',
    market: 'SOL/USDC',
    observedAt: new Date().toISOString(),
    bids: [{ price: 100, sizeUi: 1 }, { price: 101, sizeUi: 2 }],
    asks: [{ price: 103, sizeUi: 1 }, { price: 102, sizeUi: 2 }]
  });
  assert.deepEqual(result, { bestBid: 101, bestAsk: 102, mid: 101.5 });
});

test('disabled orderbook adapter reports not implemented', async () => {
  const adapter = createDisabledOrderbookAdapter('phoenix');
  const health = await adapter.health();
  assert.equal(health.ok, false);
  await assert.rejects(() => adapter.getOrderbook!('SOL/USDC'), /not implemented/);
});
