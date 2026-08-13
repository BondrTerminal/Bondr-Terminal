import assert from 'node:assert/strict';
import test from 'node:test';
import { computeRealizedPnl, type WalletTradeFill } from '../apps/web/lib/realized-pnl.js';

const baseFill = (fill: Partial<WalletTradeFill> & Pick<WalletTradeFill, 'id' | 'timestamp' | 'side' | 'tokenAmount' | 'quoteAmountSol'>): WalletTradeFill => ({
  wallet: 'wallet-1',
  projectId: 'project-1',
  mint: 'mint-1',
  priceUsd: 100,
  source: 'unit-test',
  confidence: 'provider-backed',
  ...fill
});

test('computes high-confidence weighted-average realized PnL with event-time USD', () => {
  const summary = computeRealizedPnl([
    baseFill({ id: 'buy-1', timestamp: '2026-08-01T00:00:00.000Z', side: 'buy', tokenAmount: 100, quoteAmountSol: 1 }),
    baseFill({ id: 'buy-2', timestamp: '2026-08-01T01:00:00.000Z', side: 'buy', tokenAmount: 100, quoteAmountSol: 3 }),
    baseFill({ id: 'sell-1', timestamp: '2026-08-01T02:00:00.000Z', side: 'sell', tokenAmount: 100, quoteAmountSol: 3, priceUsd: 120 })
  ], 'weighted-average');

  assert.equal(summary.confidence, 'high');
  assert.equal(summary.realizedPnlSol, 1);
  assert.equal(summary.realizedPnlUsd, 120);
  assert.equal(summary.openInventoryTokens, 100);
  assert.equal(summary.openCostSol, 2);
});

test('computes FIFO realized PnL separately from weighted average', () => {
  const fills = [
    baseFill({ id: 'buy-1', timestamp: '2026-08-01T00:00:00.000Z', side: 'buy', tokenAmount: 100, quoteAmountSol: 1 }),
    baseFill({ id: 'buy-2', timestamp: '2026-08-01T01:00:00.000Z', side: 'buy', tokenAmount: 100, quoteAmountSol: 3 }),
    baseFill({ id: 'sell-1', timestamp: '2026-08-01T02:00:00.000Z', side: 'sell', tokenAmount: 100, quoteAmountSol: 3, priceUsd: 100 })
  ];

  assert.equal(computeRealizedPnl(fills, 'fifo').realizedPnlSol, 2);
  assert.equal(computeRealizedPnl(fills, 'weighted-average').realizedPnlSol, 1);
});

test('excludes unmatched sells from realized PnL and downgrades confidence', () => {
  const summary = computeRealizedPnl([
    baseFill({ id: 'sell-1', timestamp: '2026-08-01T02:00:00.000Z', side: 'sell', tokenAmount: 100, quoteAmountSol: 3 })
  ], 'weighted-average');

  assert.equal(summary.confidence, 'unavailable');
  assert.equal(summary.realizedPnlSol, 0);
  assert.equal(summary.unmatchedSellTokens, 100);
  assert.ok(summary.gaps.some((gap) => gap.includes('unmatched')));
});
