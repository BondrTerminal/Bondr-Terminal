import fs from 'node:fs';
import path from 'node:path';
import type { MarketMakerConfig, WalletConfig } from '../types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../types/decision.js';
import { createOpenBookPaperAdapter } from '../venue/openbook-paper.js';
import type { RuntimeStepInput } from './loop.js';
import type { PaperFeePresetName } from './paper-fee-presets.js';
import { createPaperSessionReport, type PaperSessionReport } from './paper-session-report.js';
import { runBoundedPaperRunner, type PaperRunnerResult } from './paper-runner.js';

export type LocalPaperSessionFixturePaths = {
  statePath: string;
  openOrdersPath: string;
  eventPath: string;
  reportPath: string;
};

export type LocalPaperSessionFixtureResult = {
  paths: LocalPaperSessionFixturePaths;
  result: PaperRunnerResult;
  report: PaperSessionReport;
};

export type LocalPaperSessionFixtureOptions = Partial<LocalPaperSessionFixturePaths> & {
  baseDir?: string;
  maxCycles?: number;
  paperFeePresetName?: PaperFeePresetName;
  makerFeeBps?: number;
  takerFeeBps?: number;
  clean?: boolean;
};

const startedAt = '2026-07-11T21:15:00.000Z';

const walletConfig: WalletConfig = {
  name: 'fixture-wallet',
  pubkey: 'FixtureWallet111111111111111111111111111111111',
  maxSolToUse: 0.2,
  minSolReserve: 0.1,
  maxTokenInventory: 1_000,
  targetTokenInventory: 500
};

const wallet: WalletSnapshot = {
  name: walletConfig.name,
  pubkey: walletConfig.pubkey,
  solBalance: 1,
  tokenBalance: 500
};

const config: MarketMakerConfig = {
  mode: 'dry-run',
  cluster: 'mainnet-beta',
  rpcUrlEnv: 'LOCAL_FIXTURE_RPC_ENV_SHOULD_NOT_APPEAR_IN_REPORT',
  tokenMint: 'FixtureToken1111111111111111111111111111111111',
  quoteMint: 'So11111111111111111111111111111111111111112',
  wallets: [walletConfig],
  globalRisk: {
    maxTotalSolExposure: 1,
    maxTradeSol: 0.05,
    maxTradesPerMinute: 10,
    maxSlippageBps: 100,
    maxDailyLossSol: 20,
    killSwitchDrawdownBps: 1_000,
    maxMarketDataAgeMs: 15_000
  },
  quoting: {
    baseSpreadBps: 100,
    minSpreadBps: 50,
    maxSpreadBps: 500,
    inventorySkewBps: 50,
    volatilitySpreadMultiplier: 1,
    minDelayMs: 1_000,
    maxDelayMs: 5_000
  },
  execution: {
    venues: ['openbook'],
    priorityFeeLamports: 0,
    useJito: false,
    maxRetries: 0
  }
};

function fixturePath(baseDir: string, fileName: string): string {
  return path.join(baseDir, 'runtime', fileName);
}

function resolvePaths(options: LocalPaperSessionFixtureOptions): LocalPaperSessionFixturePaths {
  const baseDir = options.baseDir ?? process.cwd();
  return {
    statePath: options.statePath ?? fixturePath(baseDir, 'paper-session-fixture-state.json'),
    openOrdersPath: options.openOrdersPath ?? fixturePath(baseDir, 'paper-session-fixture-open-orders.json'),
    eventPath: options.eventPath ?? fixturePath(baseDir, 'paper-session-fixture-events.ndjson'),
    reportPath: options.reportPath ?? fixturePath(baseDir, 'paper-session-report.json')
  };
}

function marketAt(offsetMs: number, referencePrice: number): MarketSnapshot {
  return {
    observedAt: new Date(Date.parse(startedAt) + offsetMs).toISOString(),
    tokenMint: config.tokenMint,
    quoteMint: config.quoteMint,
    referencePrice,
    estimatedSlippageBps: 5,
    volatilityBps: 50
  };
}

export function buildLocalPaperSessionFixtureInputs(): RuntimeStepInput[] {
  const prices = [1, 0.99, 1.01, 1.005];
  return prices.map((referencePrice, index) => {
    const offsetMs = index * 1_000;
    return {
      config,
      walletConfig,
      wallet,
      market: marketAt(offsetMs, referencePrice),
      startedAt,
      startValueSol: wallet.solBalance + wallet.tokenBalance * prices[0],
      nowMs: Date.parse(startedAt) + offsetMs,
      quoteLevelOptions: { levelCount: 1 }
    };
  });
}

function cleanFixtureFiles(paths: LocalPaperSessionFixturePaths): void {
  for (const filePath of Object.values(paths)) {
    fs.rmSync(filePath, { force: true });
  }
}

export async function createLocalPaperSessionFixtureReport(
  options: LocalPaperSessionFixtureOptions = {}
): Promise<LocalPaperSessionFixtureResult> {
  const paths = resolvePaths(options);
  if (options.clean ?? true) cleanFixtureFiles(paths);

  const result = await runBoundedPaperRunner({
    inputs: buildLocalPaperSessionFixtureInputs(),
    statePath: paths.statePath,
    openOrdersPath: paths.openOrdersPath,
    eventPath: paths.eventPath,
    reportPath: paths.reportPath,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: options.maxCycles ?? 4,
    fillRatio: 1,
    paperFeePresetName: options.paperFeePresetName ?? 'openbook-v2-default',
    makerFeeBps: options.makerFeeBps,
    takerFeeBps: options.takerFeeBps,
    stopOnPaperRiskBlock: false
  });

  return {
    paths,
    result,
    report: createPaperSessionReport(result)
  };
}
