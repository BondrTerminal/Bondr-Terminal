import assert from 'node:assert/strict';
import test from 'node:test';
import { simulatePaperFill } from '../src/execution/paper-fill.js';
import type { Decision, MarketSnapshot } from '../src/types/decision.js';

const market: MarketSnapshot = {
  observedAt: new Date().toISOString(),
  tokenMint: 'Token111111111111111111111111111111111111111',
  quoteMint: 'So11111111111111111111111111111111111111112',
  referencePrice: 0.001,
  estimatedSlippageBps: 100,
  volatilityBps: null
};

const baseDecision: Decision = {
  observedAt: new Date().toISOString(),
  side: 'buy',
  sizeSol: 1,
  reason: 'test',
  riskPassed: true,
  riskReasons: [],
  wallet: 'w1'
};

test('simulates buy with slippage', () => {
  const fill = simulatePaperFill({ decision: baseDecision, market });
  assert.ok(fill);
  assert.equal(fill.side, 'buy');
  assert.equal(fill.inputAmountUi, 1);
  assert.ok(fill.outputAmountUi < 1000);
});

test('returns null for wait decision', () => {
  const fill = simulatePaperFill({ decision: { ...baseDecision, side: 'wait', sizeSol: 0 }, market });
  assert.equal(fill, null);
});
