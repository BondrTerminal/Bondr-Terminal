import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getPaperFeePreset,
  listPaperFeePresets,
  openBookV2RawFeeUnitsToBps,
  selectPaperFeePreset
} from '../src/runtime/paper-fee-presets.js';
import { runBoundedPaperRunner } from '../src/runtime/paper-runner.js';
import { createOpenBookPaperAdapter } from '../src/venue/openbook-paper.js';
import type { RuntimeStepInput } from '../src/runtime/loop.js';
import type { MarketMakerConfig, WalletConfig } from '../src/types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../src/types/decision.js';

const observedAt = '2026-07-11T21:04:00.000Z';

const walletConfig: WalletConfig = {
  name: 'w1',
  pubkey: 'Wallet11111111111111111111111111111111111111',
  maxSolToUse: 0.2,
  minSolReserve: 0.1,
  maxTokenInventory: 1000,
  targetTokenInventory: 500
};

const wallet: WalletSnapshot = {
  name: 'w1',
  pubkey: walletConfig.pubkey,
  solBalance: 1,
  tokenBalance: 500
};

const config: MarketMakerConfig = {
  mode: 'dry-run',
  cluster: 'mainnet-beta',
  rpcUrlEnv: 'SOLANA_RPC_URL_SHOULD_NOT_APPEAR',
  tokenMint: 'Token111111111111111111111111111111111111111',
  quoteMint: 'So11111111111111111111111111111111111111112',
  wallets: [walletConfig],
  globalRisk: {
    maxTotalSolExposure: 1,
    maxTradeSol: 0.05,
    maxTradesPerMinute: 2,
    maxSlippageBps: 100,
    maxDailyLossSol: 0.2,
    killSwitchDrawdownBps: 500,
    maxMarketDataAgeMs: 15000
  },
  quoting: {
    baseSpreadBps: 100,
    minSpreadBps: 50,
    maxSpreadBps: 500,
    inventorySkewBps: 50,
    volatilitySpreadMultiplier: 1,
    minDelayMs: 1000,
    maxDelayMs: 5000
  },
  execution: {
    venues: ['openbook'],
    priorityFeeLamports: 0,
    useJito: false,
    maxRetries: 0
  }
};

function tempPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-fee-presets-'));
  return {
    statePath: path.join(dir, 'runtime', 'state.json'),
    openOrdersPath: path.join(dir, 'runtime', 'open-orders.json'),
    eventPath: path.join(dir, 'runtime', 'events.ndjson')
  };
}

function inputAt(offsetMs: number): RuntimeStepInput {
  const market: MarketSnapshot = {
    observedAt: new Date(Date.parse(observedAt) + offsetMs).toISOString(),
    tokenMint: config.tokenMint,
    quoteMint: config.quoteMint,
    referencePrice: 1,
    estimatedSlippageBps: 5,
    volatilityBps: 50
  };
  return {
    config,
    walletConfig,
    wallet,
    market,
    startedAt: observedAt,
    startValueSol: 501,
    nowMs: Date.parse(observedAt) + offsetMs,
    quoteLevelOptions: { levelCount: 1 }
  };
}

function assertNoSecrets(value: unknown): void {
  const raw = JSON.stringify(value);
  assert.doesNotMatch(raw, /privateKey|secretKey|seed|mnemonic|signer|apiKey|rpcUrl|env|SOLANA_RPC_URL/i);
}

test('lists deterministic paper-only fee presets', () => {
  const presets = listPaperFeePresets();
  assert.deepEqual(presets.map((preset) => preset.name), ['zero', 'openbook-v2-default', 'phoenix-default']);
  assert.ok(presets.every((preset) => preset.paperOnly));
  assert.ok(presets.every((preset) => !preset.liveExecution));
  assertNoSecrets(presets);
});

test('selects openbook paper fee preset by venue', () => {
  const selected = selectPaperFeePreset({ venue: 'openbook' });
  assert.equal(selected.name, 'openbook-v2-default');
  assert.equal(selected.venue, 'openbook');
  assert.equal(selected.makerFeeBps, 0);
  assert.equal(selected.takerFeeBps, 0);
  assert.equal(selected.requestedVenue, 'openbook');
  assert.equal(selected.requestedPreset, null);
  assertNoSecrets(selected);
});

test('explicit paper fee bps override preset values', () => {
  const selected = selectPaperFeePreset({
    venue: 'openbook',
    presetName: 'openbook-v2-default',
    makerFeeBps: 1.5,
    takerFeeBps: 3.25
  });

  assert.equal(selected.name, 'openbook-v2-default');
  assert.equal(selected.makerFeeBps, 1.5);
  assert.equal(selected.takerFeeBps, 3.25);
  assert.ok(selected.skippedReasons.some((reason) => reason.includes('overridden')));
});

test('rejects invalid explicit paper fee bps', () => {
  assert.throws(() => selectPaperFeePreset({ venue: 'openbook', makerFeeBps: Number.NaN }), /makerFeeBps/);
  assert.throws(() => selectPaperFeePreset({ venue: 'openbook', takerFeeBps: Number.NaN }), /takerFeeBps/);
  assert.throws(() => selectPaperFeePreset({ venue: 'openbook', takerFeeBps: -1 }), /takerFeeBps/);
});

test('converts OpenBook v2 raw fee units to bps including maker rebates', () => {
  assert.equal(openBookV2RawFeeUnitsToBps(100), 1);
  assert.equal(openBookV2RawFeeUnitsToBps(400), 4);
  assert.equal(openBookV2RawFeeUnitsToBps(-200), -2);
  assert.throws(() => openBookV2RawFeeUnitsToBps(Number.NaN), /raw fee units/);
});

test('allows negative maker fee bps for paper maker rebates', () => {
  const selected = selectPaperFeePreset({ venue: 'openbook', makerFeeBps: -2, takerFeeBps: 4 });
  assert.equal(selected.makerFeeBps, -2);
  assert.equal(selected.takerFeeBps, 4);
  assert.ok(selected.skippedReasons.some((reason) => reason.includes('overridden')));
});

test('runner applies selected paper fee preset to simulated fills', async () => {
  const paths = tempPaths();
  const result = await runBoundedPaperRunner({
    inputs: [inputAt(0), { ...inputAt(1000), market: { ...inputAt(1000).market, referencePrice: 0.99 } }],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 2,
    fillRatio: 1,
    paperFeePresetName: 'openbook-v2-default',
    makerFeeBps: 12,
    takerFeeBps: 24
  });

  const cycle = result.cycles[1];
  assert.equal(cycle.paperFeePreset.name, 'openbook-v2-default');
  assert.equal(cycle.paperFeePreset.makerFeeBps, 12);
  assert.equal(cycle.paperFeePreset.takerFeeBps, 24);
  assert.equal(cycle.paperFeePreset.paperOnly, true);
  assert.equal(cycle.paperFeePreset.liveExecution, false);
  assert.ok(cycle.orders.some((order) => order.paperFillAccounting?.makerFeeBps === 12));
  assertNoSecrets(cycle.paperFeePreset);
});

test('getPaperFeePreset returns a defensive copy', () => {
  const preset = getPaperFeePreset('zero');
  preset.notes.push('mutated');
  assert.equal(getPaperFeePreset('zero').notes.includes('mutated'), false);
});
