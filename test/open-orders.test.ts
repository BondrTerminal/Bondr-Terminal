import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaperOrder, markPlaced } from '../src/execution/order-lifecycle.js';
import {
  filterActivePaperOrders,
  readPaperOpenOrders,
  replacePaperOpenOrders,
  writePaperOpenOrders
} from '../src/runtime/open-orders.js';

const observedAt = '2026-07-08T14:42:00.000Z';

function tmpFile(name: string): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mm-open-orders-')), name);
}

function placedOrder(id: string) {
  return markPlaced(createPaperOrder({
    id,
    wallet: 'w1',
    side: 'buy',
    price: 1,
    sizeUi: 10,
    now: observedAt
  }), observedAt);
}

test('writes and reads whitelisted paper open orders', () => {
  const file = tmpFile('open-orders.json');
  const order = { ...placedOrder('safe-order'), extraSecret: 'must-not-persist' };

  writePaperOpenOrders(file, [order]);
  const raw = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(raw, /extraSecret/);
  assert.doesNotMatch(raw, /private|secret|apiKey|signer/i);

  const readBack = readPaperOpenOrders(file);
  assert.equal(readBack.length, 1);
  assert.equal(readBack[0]?.id, 'safe-order');
  assert.equal(readBack[0]?.status, 'placed');
});

test('missing paper open-order file returns empty list', () => {
  assert.deepEqual(readPaperOpenOrders(tmpFile('missing.json')), []);
});

test('corrupt paper open-order file errors clearly', () => {
  const file = tmpFile('corrupt.json');
  fs.writeFileSync(file, '{not json', 'utf8');
  assert.throws(() => readPaperOpenOrders(file), /failed to read paper open orders/);
});

test('filters active paper orders and replace writes only active orders', () => {
  const file = tmpFile('replace.json');
  const active = placedOrder('active');
  const terminal = { ...placedOrder('terminal'), status: 'filled' as const, filledUi: 10 };

  assert.deepEqual(filterActivePaperOrders([active, terminal]).map((order) => order.id), ['active']);
  replacePaperOpenOrders(file, [active, terminal]);
  assert.deepEqual(readPaperOpenOrders(file).map((order) => order.id), ['active']);
});
