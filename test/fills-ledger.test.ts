import assert from 'node:assert/strict';
import test from 'node:test';
import { openLedger } from '../src/ledger/sqlite-ledger.js';
import { getFillById, insertFill, insertPaperFill, listRecentFills, recentFillsAsTradeEvents } from '../src/ledger/fills.js';
import type { PaperFill } from '../src/execution/paper-fill.js';

const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

test('inserts and reads a normalized fill record', () => {
  const db = openLedger(':memory:');
  const id = insertFill({
    db,
    fill: {
      mode: 'paper',
      side: 'buy',
      inputMint: SOL,
      outputMint: USDC,
      inputAmountUi: 0.1,
      outputAmountUi: 20,
      price: 0.005,
      slippageBps: 12,
      createdAt: '2026-07-06T20:27:00.000Z'
    }
  });

  const fill = getFillById({ db, id });
  assert.ok(fill);
  assert.equal(fill.id, id);
  assert.equal(fill.mode, 'paper');
  assert.equal(fill.side, 'buy');
  assert.equal(fill.inputMint, SOL);
  assert.equal(fill.outputMint, USDC);
  assert.equal(fill.feeSol, 0);
  assert.equal(fill.slippageBps, 12);
  assert.equal(fill.createdAt, '2026-07-06T20:27:00.000Z');

  db.close();
});

test('inserts a paper fill from simulated execution output', () => {
  const db = openLedger(':memory:');
  const paperFill: PaperFill = {
    mode: 'paper',
    side: 'sell',
    inputAmountUi: 10,
    outputAmountUi: 0.049,
    price: 0.0049,
    slippageBps: 20
  };

  const id = insertPaperFill({
    db,
    fill: paperFill,
    inputMint: USDC,
    outputMint: SOL,
    decisionId: null,
    createdAt: '2026-07-06T20:28:00.000Z'
  });

  const fill = getFillById({ db, id });
  assert.ok(fill);
  assert.equal(fill.decisionId, null);
  assert.equal(fill.side, 'sell');
  assert.equal(fill.inputAmountUi, 10);
  assert.equal(fill.outputAmountUi, 0.049);

  db.close();
});

test('lists recent fills and converts them to rate-limit trade events', () => {
  const db = openLedger(':memory:');
  insertFill({
    db,
    fill: {
      mode: 'paper',
      side: 'buy',
      inputMint: SOL,
      outputMint: USDC,
      inputAmountUi: 0.1,
      outputAmountUi: 20,
      price: 0.005,
      createdAt: '2026-07-06T20:20:00.000Z'
    }
  });
  insertFill({
    db,
    fill: {
      mode: 'paper',
      side: 'sell',
      inputMint: USDC,
      outputMint: SOL,
      inputAmountUi: 20,
      outputAmountUi: 0.09,
      price: 0.0045,
      createdAt: '2026-07-06T20:29:00.000Z'
    }
  });

  const recent = listRecentFills({ db, sinceIso: '2026-07-06T20:25:00.000Z' });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].side, 'sell');

  const trades = recentFillsAsTradeEvents({ db, wallet: 'w1', sinceIso: '2026-07-06T20:25:00.000Z' });
  assert.deepEqual(trades, [{
    observedAt: '2026-07-06T20:29:00.000Z',
    wallet: 'w1',
    side: 'sell'
  }]);

  db.close();
});

test('rejects invalid fill amounts before database insert', () => {
  const db = openLedger(':memory:');
  assert.throws(() => insertFill({
    db,
    fill: {
      mode: 'paper',
      side: 'buy',
      inputMint: SOL,
      outputMint: USDC,
      inputAmountUi: -1,
      outputAmountUi: 20,
      price: 0.005
    }
  }), /inputAmountUi must be non-negative and finite/);
  db.close();
});
