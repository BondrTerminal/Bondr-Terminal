import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMetricsSnapshot } from '../src/metrics/snapshot.js';

test('builds bot metrics snapshot from decisions and wallets', () => {
  const snapshot = buildMetricsSnapshot({
    mode: 'dry-run',
    nowMs: Date.parse('2026-07-05T22:00:10.000Z'),
    market: {
      observedAt: '2026-07-05T22:00:00.000Z',
      tokenMint: 'Token111111111111111111111111111111111111111',
      quoteMint: 'So11111111111111111111111111111111111111112',
      referencePrice: 0.001,
      estimatedSlippageBps: 10,
      volatilityBps: null
    },
    wallets: [
      { name: 'w1', pubkey: 'p1', solBalance: 1, tokenBalance: 10 },
      { name: 'w2', pubkey: 'p2', solBalance: 2, tokenBalance: 20 }
    ],
    decisions: [
      { observedAt: 'x', side: 'buy', sizeSol: 0.1, reason: 'r', riskPassed: true, riskReasons: [], wallet: 'w1' },
      { observedAt: 'x', side: 'wait', sizeSol: 0, reason: 'risk-off', riskPassed: false, riskReasons: ['x'], wallet: 'w2' }
    ]
  });

  assert.equal(snapshot.marketAgeMs, 10_000);
  assert.equal(snapshot.walletCount, 2);
  assert.equal(snapshot.decisionCounts.buy, 1);
  assert.equal(snapshot.decisionCounts.wait, 1);
  assert.equal(snapshot.riskBlockedCount, 1);
  assert.equal(snapshot.totalSolBalance, 3);
  assert.equal(snapshot.totalTokenBalance, 30);
});
