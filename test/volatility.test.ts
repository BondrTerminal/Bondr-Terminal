import assert from 'node:assert/strict';
import test from 'node:test';
import { appendPricePoint, estimateVolatilityBps, returnBpsSeries } from '../src/market-data/volatility.js';

test('keeps only newest price points by observedAt', () => {
  const points = appendPricePoint({
    points: [
      { observedAt: '2026-07-05T00:00:02.000Z', price: 1.02 },
      { observedAt: '2026-07-05T00:00:01.000Z', price: 1.01 }
    ],
    point: { observedAt: '2026-07-05T00:00:03.000Z', price: 1.03 },
    maxPoints: 2
  });
  assert.deepEqual(points.map((point) => point.price), [1.02, 1.03]);
});

test('computes return series in bps', () => {
  const returns = returnBpsSeries([
    { observedAt: '2026-07-05T00:00:01.000Z', price: 1 },
    { observedAt: '2026-07-05T00:00:02.000Z', price: 1.01 },
    { observedAt: '2026-07-05T00:00:03.000Z', price: 1 }
  ]);
  assert.equal(Math.round(returns[0]!), 100);
  assert.equal(Math.round(returns[1]!), -99);
});

test('estimates nonzero volatility for moving prices', () => {
  const vol = estimateVolatilityBps([
    { observedAt: '2026-07-05T00:00:01.000Z', price: 1 },
    { observedAt: '2026-07-05T00:00:02.000Z', price: 1.01 },
    { observedAt: '2026-07-05T00:00:03.000Z', price: 0.99 },
    { observedAt: '2026-07-05T00:00:04.000Z', price: 1.02 }
  ]);
  assert.ok(vol !== null && vol > 0);
});
