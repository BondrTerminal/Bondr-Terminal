import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePaperRisk } from '../src/runtime/paper-risk.js';
import type { PaperPnlSummary } from '../src/runtime/paper-pnl.js';
import type { MarketMakerConfig } from '../src/types/config.js';

const observedAt = '2026-07-08T22:00:00.000Z';

const config: Pick<MarketMakerConfig, 'globalRisk'> = {
  globalRisk: {
    maxTotalSolExposure: 1,
    maxTradeSol: 0.1,
    maxTradesPerMinute: 2,
    maxSlippageBps: 100,
    maxDailyLossSol: 0.2,
    killSwitchDrawdownBps: 500,
    maxMarketDataAgeMs: 15000
  }
};

function paperPnl(overrides: Partial<PaperPnlSummary> = {}): PaperPnlSummary {
  return {
    observedAt,
    wallet: {
      name: 'w1',
      pubkey: 'Wallet11111111111111111111111111111111111111'
    },
    startingPortfolioValueSol: 10,
    currentPaperPortfolioValueSol: 9.9,
    realizedPnlSol: -0.05,
    realizedPnlFromMatchedPaperBuysSol: -0.05,
    realizedPnlFromStartingInventorySol: 0,
    startingTokenInventoryUi: 0,
    startingTokenCostBasisSol: null,
    startingTokenAverageCostSol: null,
    unrealizedPnlSol: -0.05,
    totalPaperPnlSol: -0.1,
    drawdownBps: 100,
    filledBuyVolumeSol: 1,
    filledSellVolumeSol: 0.95,
    filledBuySizeUi: 1,
    filledSellSizeUi: 1,
    filledBuyGrossVolumeSol: 1,
    filledSellGrossVolumeSol: 0.95,
    filledBuyNetCostSol: 1,
    filledSellNetProceedsSol: 0.95,
    paperFeesSol: 0,
    paperSlippageSol: 0,
    openBidNotionalSol: 0,
    openAskNotionalSol: 0,
    activeOpenOrderCount: 0,
    filledOrderCount: 2,
    skippedCount: 0,
    skippedReasons: [],
    liveExecution: false,
    paperOnly: true,
    ...overrides
  };
}

test('paper PnL inside limits passes', () => {
  const result = evaluatePaperRisk({ config, paperPnl: paperPnl() });

  assert.equal(result.passed, true);
  assert.equal(result.action, 'allow');
  assert.equal(result.lossSol, 0.1);
  assert.equal(result.drawdownBps, 100);
  assert.equal(result.dailyLossSol, 0.1);
  assert.deepEqual(result.reasons, []);
});

test('paper daily loss blocks', () => {
  const result = evaluatePaperRisk({
    config,
    paperPnl: paperPnl({
      currentPaperPortfolioValueSol: 9.9,
      realizedPnlSol: -0.25,
      totalPaperPnlSol: -0.1,
      drawdownBps: 100
    })
  });

  assert.equal(result.passed, false);
  assert.equal(result.action, 'block');
  assert.equal(result.dailyLossSol, 0.25);
  assert.ok(result.reasons.some((reason) => reason.includes('daily loss')));
});

test('paper drawdown halts at kill-switch threshold', () => {
  const result = evaluatePaperRisk({
    config,
    paperPnl: paperPnl({
      currentPaperPortfolioValueSol: 9.5,
      realizedPnlSol: -0.05,
      totalPaperPnlSol: -0.5,
      drawdownBps: 500
    })
  });

  assert.equal(result.passed, false);
  assert.equal(result.action, 'halt');
  assert.equal(result.drawdownBps, 500);
  assert.ok(result.reasons.some((reason) => reason.includes('killSwitchDrawdownBps')));
});

test('null mark-to-market fields block safely without inventing drawdown', () => {
  const result = evaluatePaperRisk({
    config,
    paperPnl: paperPnl({
      currentPaperPortfolioValueSol: null,
      totalPaperPnlSol: null,
      unrealizedPnlSol: null,
      drawdownBps: null,
      skippedReasons: ['paper pnl mark-to-market skipped: market reference price is unavailable']
    })
  });

  assert.equal(result.passed, false);
  assert.equal(result.action, 'block');
  assert.equal(result.lossSol, null);
  assert.equal(result.drawdownBps, null);
  assert.equal(result.dailyLossSol, null);
  assert.ok(result.reasons.some((reason) => reason.includes('paper portfolio value is unmarked')));
  assert.ok(result.reasons.some((reason) => reason.includes('reference price is unavailable')));
});

test('preserves explicit paper-only safety fields', () => {
  const result = evaluatePaperRisk({ config, paperPnl: paperPnl() });

  assert.equal(result.paperOnly, true);
  assert.equal(result.liveExecution, false);
  assert.equal(result.source, 'paper-pnl');
});

test('does not return raw config, secrets, or signer-shaped fields', () => {
  const result = evaluatePaperRisk({ config, paperPnl: paperPnl() });
  const raw = JSON.stringify(result);

  assert.doesNotMatch(raw, /privateKey|secretKey|seed|mnemonic|signer|apiKey|rpcUrl|env|swap/i);
});
