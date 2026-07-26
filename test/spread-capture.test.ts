import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaperOrder, markPlaced, applyFill, type PaperOrder } from '../src/execution/order-lifecycle.js';
import { summarizePaperSpreadCapture } from '../src/runtime/spread-capture.js';

const observedAt = '2026-07-11T20:25:00.000Z';

function filledOrder(args: {
  id: string;
  side: 'buy' | 'sell';
  quotedPrice: number;
  executedPrice: number;
  sizeUi: number;
  feeSol: number;
  slippageSol?: number;
  netNotionalSol: number;
}): PaperOrder {
  const order = applyFill({
    order: markPlaced(createPaperOrder({
      id: args.id,
      wallet: 'w1',
      side: args.side,
      price: args.quotedPrice,
      sizeUi: args.sizeUi,
      now: observedAt
    }), observedAt),
    fillSizeUi: args.sizeUi,
    now: observedAt
  });

  return {
    ...order,
    paperFillAccounting: {
      quotedPrice: args.quotedPrice,
      executedPrice: args.executedPrice,
      filledSizeUi: args.sizeUi,
      grossNotionalSol: args.executedPrice * args.sizeUi,
      feeSol: args.feeSol,
      slippageSol: args.slippageSol ?? 0,
      netNotionalSol: args.netNotionalSol,
      makerFeeBps: 10,
      takerFeeBps: 10,
      appliedFeeBps: 10,
      liquidityRole: 'maker',
      fillCount: 1,
      lastObservedAt: observedAt
    }
  };
}

test('summarizes matched quoted, executed, gross, and fee-adjusted spread capture', () => {
  const summary = summarizePaperSpreadCapture({
    orders: [
      filledOrder({
        id: 'buy-1',
        side: 'buy',
        quotedPrice: 0.99,
        executedPrice: 1,
        sizeUi: 10,
        feeSol: 0.01,
        slippageSol: 0.1,
        netNotionalSol: 10.01
      }),
      filledOrder({
        id: 'sell-1',
        side: 'sell',
        quotedPrice: 1.01,
        executedPrice: 1.02,
        sizeUi: 10,
        feeSol: 0.0102,
        slippageSol: -0.1,
        netNotionalSol: 10.1898
      })
    ]
  });

  assert.equal(summary.matchedSizeUi, 10);
  assert.equal(summary.unmatchedInventoryUi, 0);
  assert.equal(summary.quotedSpreadSol, 0.02);
  assert.equal(summary.quotedSpreadBps, 200);
  assert.equal(summary.executedSpreadSol, 0.02);
  assert.equal(summary.grossSpreadCapturedSol, 0.2);
  assert.equal(summary.feeAdjustedSpreadCapturedSol, 0.1798);
  assert.equal(summary.totalFeesSol, 0.0202);
  assert.equal(summary.slippageAttributionSol, 0);
  assert.equal(summary.buyFillCount, 1);
  assert.equal(summary.sellFillCount, 1);
  assert.equal(summary.paperOnly, true);
  assert.equal(summary.liveExecution, false);
});

test('tracks unmatched inventory when buy and sell sizes differ', () => {
  const summary = summarizePaperSpreadCapture({
    orders: [
      filledOrder({ id: 'buy-1', side: 'buy', quotedPrice: 1, executedPrice: 1, sizeUi: 10, feeSol: 0, netNotionalSol: 10 }),
      filledOrder({ id: 'sell-1', side: 'sell', quotedPrice: 1.02, executedPrice: 1.02, sizeUi: 4, feeSol: 0, netNotionalSol: 4.08 })
    ]
  });

  assert.equal(summary.matchedSizeUi, 4);
  assert.equal(summary.unmatchedInventoryUi, 6);
  assert.equal(summary.grossSpreadCapturedSol, 0.08);
});

test('handles empty fills without inventing spread', () => {
  const summary = summarizePaperSpreadCapture({ orders: [] });

  assert.equal(summary.matchedSizeUi, 0);
  assert.equal(summary.unmatchedInventoryUi, 0);
  assert.equal(summary.quotedSpreadSol, null);
  assert.equal(summary.executedSpreadSol, null);
  assert.equal(summary.grossSpreadCapturedSol, 0);
  assert.equal(summary.feeAdjustedSpreadCapturedSol, 0);
});

test('skips filled orders that lack paper fill accounting', () => {
  const order = applyFill({
    order: markPlaced(createPaperOrder({ id: 'legacy', wallet: 'w1', side: 'buy', price: 1, sizeUi: 1, now: observedAt }), observedAt),
    fillSizeUi: 1,
    now: observedAt
  });

  const summary = summarizePaperSpreadCapture({ orders: [order] });

  assert.equal(summary.skippedCount, 1);
  assert.ok(summary.skippedReasons.some((reason) => reason.includes('missing paper fill accounting')));
});

test('does not return raw config, secrets, or signer-shaped fields', () => {
  const summary = summarizePaperSpreadCapture({
    orders: [filledOrder({ id: 'buy-1', side: 'buy', quotedPrice: 1, executedPrice: 1, sizeUi: 1, feeSol: 0, netNotionalSol: 1 })]
  });

  const raw = JSON.stringify(summary);
  assert.doesNotMatch(raw, /privateKey|secretKey|seed|mnemonic|signer|apiKey|rpcUrl|env/i);
});
