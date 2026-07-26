import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePaperFillFees, mergePaperFillAccounting } from '../src/runtime/paper-fees.js';

test('calculates maker fee and adverse buy slippage attribution', () => {
  const result = calculatePaperFillFees({
    side: 'buy',
    quotedPrice: 1,
    executedPrice: 1.01,
    sizeUi: 10,
    makerFeeBps: 10,
    observedAt: '2026-07-11T20:10:00.000Z'
  });

  assert.equal(result.grossNotionalSol, 10.1);
  assert.equal(result.feeSol, 0.0101);
  assert.equal(result.slippageSol, 0.1);
  assert.equal(result.netNotionalSol, 10.1101);
  assert.equal(result.appliedFeeBps, 10);
  assert.equal(result.liquidityRole, 'maker');
});

test('calculates sell proceeds net of fees with favorable slippage attribution', () => {
  const result = calculatePaperFillFees({
    side: 'sell',
    quotedPrice: 1,
    executedPrice: 1.02,
    sizeUi: 5,
    makerFeeBps: 20,
    observedAt: '2026-07-11T20:10:00.000Z'
  });

  assert.equal(result.grossNotionalSol, 5.1);
  assert.equal(result.feeSol, 0.0102);
  assert.equal(result.slippageSol, -0.1);
  assert.equal(result.netNotionalSol, 5.0898);
});

test('defaults to zero-fee maker accounting', () => {
  const result = calculatePaperFillFees({
    side: 'buy',
    quotedPrice: 1.01,
    executedPrice: 1,
    sizeUi: 2,
    observedAt: '2026-07-11T20:10:00.000Z'
  });

  assert.equal(result.feeSol, 0);
  assert.equal(result.makerFeeBps, 0);
  assert.equal(result.takerFeeBps, 0);
  assert.equal(result.netNotionalSol, 2);
});

test('supports negative maker fee bps as a paper maker rebate', () => {
  const result = calculatePaperFillFees({
    side: 'sell',
    quotedPrice: 1,
    executedPrice: 1,
    sizeUi: 10,
    makerFeeBps: -2,
    takerFeeBps: 4,
    liquidityRole: 'maker',
    observedAt: '2026-07-11T20:10:00.000Z'
  });

  assert.equal(result.appliedFeeBps, -2);
  assert.equal(result.feeSol, -0.002);
  assert.equal(result.netNotionalSol, 10.002);
});

test('defaults taker fee to zero when maker fee is a rebate', () => {
  const result = calculatePaperFillFees({
    side: 'buy',
    quotedPrice: 1,
    executedPrice: 1,
    sizeUi: 10,
    makerFeeBps: -2,
    liquidityRole: 'taker',
    observedAt: '2026-07-11T20:10:00.000Z'
  });

  assert.equal(result.makerFeeBps, -2);
  assert.equal(result.takerFeeBps, 0);
  assert.equal(result.appliedFeeBps, 0);
  assert.equal(result.feeSol, 0);
});

test('merges partial-fill accounting without raw config or signer-shaped fields', () => {
  const first = calculatePaperFillFees({
    side: 'buy',
    quotedPrice: 1,
    executedPrice: 1.01,
    sizeUi: 4,
    makerFeeBps: 10,
    observedAt: '2026-07-11T20:10:00.000Z'
  });
  const second = calculatePaperFillFees({
    side: 'buy',
    quotedPrice: 1,
    executedPrice: 0.99,
    sizeUi: 6,
    makerFeeBps: 10,
    observedAt: '2026-07-11T20:11:00.000Z'
  });

  const merged = mergePaperFillAccounting({ existing: first, next: second });

  assert.equal(merged.filledSizeUi, 10);
  assert.equal(merged.fillCount, 2);
  assert.equal(merged.grossNotionalSol, 9.98);
  assert.equal(merged.feeSol, 0.00998);
  assert.equal(merged.netNotionalSol, 9.98998);
  assert.equal(merged.lastObservedAt, '2026-07-11T20:11:00.000Z');

  const raw = JSON.stringify(merged);
  assert.doesNotMatch(raw, /privateKey|secretKey|seed|mnemonic|signer|apiKey|rpcUrl|env/i);
});
