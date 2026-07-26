import assert from 'node:assert/strict';
import test from 'node:test';
import { drawdownBps, markPortfolio } from '../src/risk/pnl.js';

test('marks portfolio in SOL terms', () => {
  const value = markPortfolio({ solBalance: 1, tokenBalance: 1000, tokenPriceSol: 0.001 });
  assert.equal(value.solValue, 1);
  assert.equal(value.tokenValueSol, 1);
  assert.equal(value.totalValueSol, 2);
});

test('drawdown bps rounds loss relative to start', () => {
  assert.equal(drawdownBps({ startValueSol: 10, currentValueSol: 9.5 }), 500);
  assert.equal(drawdownBps({ startValueSol: 10, currentValueSol: 10.5 }), 0);
});
