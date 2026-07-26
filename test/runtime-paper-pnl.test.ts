import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaperOrder, markPlaced, applyFill, type PaperOrder } from '../src/execution/order-lifecycle.js';
import { summarizePaperPnl } from '../src/runtime/paper-pnl.js';
import type { MarketSnapshot, WalletSnapshot } from '../src/types/decision.js';

const observedAt = '2026-07-08T14:55:00.000Z';

const wallet: WalletSnapshot = {
  name: 'w1',
  pubkey: 'Wallet11111111111111111111111111111111111111',
  solBalance: 10,
  tokenBalance: 100
};

const market: MarketSnapshot = {
  observedAt,
  tokenMint: 'Token111111111111111111111111111111111111111',
  quoteMint: 'So11111111111111111111111111111111111111112',
  referencePrice: 1.2,
  estimatedSlippageBps: 5,
  volatilityBps: 50
};

function placedOrder(args: { id: string; side: 'buy' | 'sell'; price: number; sizeUi: number; filledUi?: number }): PaperOrder {
  const placed = markPlaced(createPaperOrder({
    id: args.id,
    wallet: wallet.name,
    side: args.side,
    price: args.price,
    sizeUi: args.sizeUi,
    now: observedAt
  }), observedAt);
  if (args.filledUi === undefined || args.filledUi <= 0) return placed;
  return applyFill({ order: placed, fillSizeUi: args.filledUi, now: observedAt });
}

test('computes realized PnL from matched buy and sell paper fills', () => {
  const summary = summarizePaperPnl({
    orders: [
      placedOrder({ id: 'buy-1', side: 'buy', price: 1, sizeUi: 10, filledUi: 10 }),
      placedOrder({ id: 'sell-1', side: 'sell', price: 1.3, sizeUi: 4, filledUi: 4 })
    ],
    wallet,
    market,
    startingPortfolioValueSol: 130
  });

  assert.equal(summary.filledBuyVolumeSol, 10);
  assert.equal(summary.filledSellVolumeSol, 5.2);
  assert.equal(summary.realizedPnlSol, 1.2);
  assert.equal(summary.filledOrderCount, 2);
});

test('uses fee-adjusted net fill values when paper fill accounting is present', () => {
  const buy = applyFill({
    order: markPlaced(createPaperOrder({
      id: 'buy-fee',
      wallet: wallet.name,
      side: 'buy',
      price: 1,
      sizeUi: 10,
      now: observedAt
    }), observedAt),
    fillSizeUi: 10,
    now: observedAt
  });
  const sell = applyFill({
    order: markPlaced(createPaperOrder({
      id: 'sell-fee',
      wallet: wallet.name,
      side: 'sell',
      price: 1.3,
      sizeUi: 10,
      now: observedAt
    }), observedAt),
    fillSizeUi: 10,
    now: observedAt
  });

  const summary = summarizePaperPnl({
    orders: [
      {
        ...buy,
        paperFillAccounting: {
          quotedPrice: 1,
          executedPrice: 1,
          filledSizeUi: 10,
          grossNotionalSol: 10,
          feeSol: 0.01,
          slippageSol: 0,
          netNotionalSol: 10.01,
          makerFeeBps: 10,
          takerFeeBps: 10,
          appliedFeeBps: 10,
          liquidityRole: 'maker',
          fillCount: 1,
          lastObservedAt: observedAt
        }
      },
      {
        ...sell,
        paperFillAccounting: {
          quotedPrice: 1.3,
          executedPrice: 1.3,
          filledSizeUi: 10,
          grossNotionalSol: 13,
          feeSol: 0.013,
          slippageSol: 0,
          netNotionalSol: 12.987,
          makerFeeBps: 10,
          takerFeeBps: 10,
          appliedFeeBps: 10,
          liquidityRole: 'maker',
          fillCount: 1,
          lastObservedAt: observedAt
        }
      }
    ],
    wallet,
    market,
    startingPortfolioValueSol: 130
  });

  assert.equal(summary.filledBuyVolumeSol, 10.01);
  assert.equal(summary.filledSellVolumeSol, 12.987);
  assert.equal(summary.filledBuyGrossVolumeSol, 10);
  assert.equal(summary.filledSellGrossVolumeSol, 13);
  assert.equal(summary.filledBuyNetCostSol, 10.01);
  assert.equal(summary.filledSellNetProceedsSol, 12.987);
  assert.equal(summary.paperFeesSol, 0.023);
  assert.equal(summary.realizedPnlSol, 2.977);
});

test('realizes PnL when selling from starting inventory cost basis', () => {
  const summary = summarizePaperPnl({
    orders: [placedOrder({ id: 'sell-starting-inventory', side: 'sell', price: 1.3, sizeUi: 10, filledUi: 10 })],
    wallet,
    market,
    startingPortfolioValueSol: 110,
    startingTokenCostBasisSol: 100
  });

  assert.equal(summary.startingTokenInventoryUi, 100);
  assert.equal(summary.startingTokenCostBasisSol, 100);
  assert.equal(summary.startingTokenAverageCostSol, 1);
  assert.equal(summary.realizedPnlFromMatchedPaperBuysSol, 0);
  assert.equal(summary.realizedPnlFromStartingInventorySol, 3);
  assert.equal(summary.realizedPnlSol, 3);
  assert.equal(summary.skippedReasons.length, 0);
});

test('infers starting inventory cost basis from starting portfolio value', () => {
  const summary = summarizePaperPnl({
    orders: [placedOrder({ id: 'sell-inferred-cost', side: 'sell', price: 1.3, sizeUi: 10, filledUi: 10 })],
    wallet,
    market,
    startingPortfolioValueSol: 130
  });

  assert.equal(summary.startingTokenCostBasisSol, 120);
  assert.equal(summary.startingTokenAverageCostSol, 1.2);
  assert.equal(summary.realizedPnlFromStartingInventorySol, 1);
  assert.equal(summary.realizedPnlSol, 1);
});

test('marks unrealized inventory and total paper PnL from virtual wallet balances', () => {
  const summary = summarizePaperPnl({
    orders: [placedOrder({ id: 'buy-1', side: 'buy', price: 1, sizeUi: 10, filledUi: 10 })],
    wallet: { ...wallet, solBalance: 0, tokenBalance: 0 },
    market,
    startingPortfolioValueSol: 10
  });

  assert.equal(summary.currentPaperPortfolioValueSol, 2);
  assert.equal(summary.totalPaperPnlSol, -8);
  assert.equal(summary.unrealizedPnlSol, -8);
  assert.equal(summary.drawdownBps, 8000);
});

test('splits open bid and ask notional by remaining active size', () => {
  const partialSell = placedOrder({ id: 'ask-1', side: 'sell', price: 2, sizeUi: 5, filledUi: 2 });
  const summary = summarizePaperPnl({
    orders: [
      placedOrder({ id: 'bid-1', side: 'buy', price: 1, sizeUi: 3 }),
      partialSell
    ],
    wallet,
    market,
    startingPortfolioValueSol: 130
  });

  assert.equal(summary.openBidNotionalSol, 3);
  assert.equal(summary.openAskNotionalSol, 6);
  assert.equal(summary.activeOpenOrderCount, 2);
});

test('handles empty fills and open orders', () => {
  const summary = summarizePaperPnl({
    orders: [],
    wallet,
    market,
    startingPortfolioValueSol: 130
  });

  assert.equal(summary.realizedPnlSol, 0);
  assert.equal(summary.filledBuyVolumeSol, 0);
  assert.equal(summary.filledSellVolumeSol, 0);
  assert.equal(summary.openBidNotionalSol, 0);
  assert.equal(summary.openAskNotionalSol, 0);
  assert.equal(summary.activeOpenOrderCount, 0);
  assert.equal(summary.currentPaperPortfolioValueSol, 130);
  assert.equal(summary.totalPaperPnlSol, 0);
});

test('handles null reference price safely', () => {
  const summary = summarizePaperPnl({
    orders: [placedOrder({ id: 'buy-1', side: 'buy', price: 1, sizeUi: 10, filledUi: 10 })],
    wallet,
    market: { ...market, referencePrice: null },
    startingPortfolioValueSol: 130
  });

  assert.equal(summary.currentPaperPortfolioValueSol, null);
  assert.equal(summary.totalPaperPnlSol, null);
  assert.equal(summary.unrealizedPnlSol, null);
  assert.equal(summary.drawdownBps, null);
  assert.match(summary.skippedReasons.join('; '), /reference price is unavailable/);
});

test('preserves explicit paper-only safety fields', () => {
  const summary = summarizePaperPnl({
    orders: [],
    wallet,
    market,
    startingPortfolioValueSol: 130
  });

  assert.equal(summary.paperOnly, true);
  assert.equal(summary.liveExecution, false);
});

test('does not return raw config, secrets, or signer-shaped fields', () => {
  const summary = summarizePaperPnl({
    orders: [placedOrder({ id: 'buy-1', side: 'buy', price: 1, sizeUi: 10, filledUi: 10 })],
    wallet,
    market,
    startingPortfolioValueSol: 130
  });

  const raw = JSON.stringify(summary);
  assert.doesNotMatch(raw, /privateKey|secretKey|seed|mnemonic|signer|apiKey|rpcUrl|env/i);
});
