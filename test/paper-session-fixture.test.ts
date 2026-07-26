import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildLocalPaperSessionFixtureInputs,
  createLocalPaperSessionFixtureReport
} from '../src/runtime/paper-session-fixture.js';
import { readPaperSessionReport } from '../src/runtime/paper-session-report.js';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mm-paper-fixture-'));
}

function assertNoSecrets(value: unknown): void {
  const raw = JSON.stringify(value);
  assert.doesNotMatch(raw, /privateKey|secretKey|seed|mnemonic|signer|apiKey|rpcUrl|env|LOCAL_FIXTURE_RPC_ENV/i);
}

test('builds deterministic local paper-session fixture inputs', () => {
  const inputs = buildLocalPaperSessionFixtureInputs();

  assert.equal(inputs.length, 4);
  assert.deepEqual(inputs.map((input) => input.market.referencePrice), [1, 0.99, 1.01, 1.005]);
  assert.deepEqual(inputs.map((input) => input.market.observedAt), [
    '2026-07-11T21:15:00.000Z',
    '2026-07-11T21:15:01.000Z',
    '2026-07-11T21:15:02.000Z',
    '2026-07-11T21:15:03.000Z'
  ]);
  assert.equal(inputs.every((input) => input.config.mode === 'dry-run'), true);
});

test('creates a safe local paper-session report fixture under runtime paths', async () => {
  const baseDir = tempDir();
  const { paths, report, result } = await createLocalPaperSessionFixtureReport({ baseDir, makerFeeBps: 8 });
  const readBack = readPaperSessionReport(paths.reportPath);

  assert.equal(paths.reportPath, path.join(baseDir, 'runtime', 'paper-session-report.json'));
  assert.equal(fs.existsSync(paths.statePath), true);
  assert.equal(fs.existsSync(paths.openOrdersPath), true);
  assert.equal(fs.existsSync(paths.eventPath), true);
  assert.deepEqual(readBack, report);
  assert.equal(report.generatedAt, '2026-07-11T21:15:03.000Z');
  assert.equal(report.executedCycleCount, 4);
  assert.equal(report.paperOnly, true);
  assert.equal(report.liveExecution, false);
  assert.equal(result.summary.paperOnly, true);
  assert.ok(report.totals.placedOrderCount > 0);
  assert.ok(report.totals.filledOrderCount + report.totals.partiallyFilledOrderCount > 0);
  assertNoSecrets(report);
});

test('fixture generator cleans stale fixture files before writing', async () => {
  const baseDir = tempDir();
  const stalePaths = {
    statePath: path.join(baseDir, 'runtime', 'paper-session-fixture-state.json'),
    openOrdersPath: path.join(baseDir, 'runtime', 'paper-session-fixture-open-orders.json'),
    eventPath: path.join(baseDir, 'runtime', 'paper-session-fixture-events.ndjson'),
    reportPath: path.join(baseDir, 'runtime', 'paper-session-report.json')
  };
  fs.mkdirSync(path.join(baseDir, 'runtime'), { recursive: true });
  fs.writeFileSync(stalePaths.eventPath, 'stale-event\n');

  await createLocalPaperSessionFixtureReport({ baseDir });
  const events = fs.readFileSync(stalePaths.eventPath, 'utf8');

  assert.equal(events.includes('stale-event'), false);
  assert.ok(events.includes('paper runner:'));
});
