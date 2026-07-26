import fs from 'node:fs';
import path from 'node:path';
import type { MarketMakerConfig, WalletConfig } from '../types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../types/decision.js';
import { createOpenBookPaperAdapter } from '../venue/openbook-paper.js';
import type { RuntimeStepInput } from './loop.js';
import type { PaperFeePresetName } from './paper-fee-presets.js';
import { createPaperSessionReport, type PaperSessionReport } from './paper-session-report.js';
import { runBoundedPaperRunner, type PaperRunnerResult } from './paper-runner.js';

export type ObservedPaperSessionPaths = {
  statePath: string;
  openOrdersPath: string;
  eventPath: string;
  reportPath: string;
};

export type ObservedPaperSessionResult = {
  wallet: {
    name: string;
    pubkey: string;
  };
  paths: ObservedPaperSessionPaths;
  result: PaperRunnerResult;
  report: PaperSessionReport;
};

export type ObservedPaperSessionOptions = Partial<ObservedPaperSessionPaths> & {
  baseDir?: string;
  walletName?: string;
  startedAt?: string;
  startValueSol?: number;
  maxCycles?: number;
  paperFeePresetName?: PaperFeePresetName;
  makerFeeBps?: number;
  takerFeeBps?: number;
  clean?: boolean;
};

function observedPath(baseDir: string, fileName: string): string {
  return path.join(baseDir, 'runtime', fileName);
}

function resolvePaths(options: ObservedPaperSessionOptions): ObservedPaperSessionPaths {
  const baseDir = options.baseDir ?? process.cwd();
  return {
    statePath: options.statePath ?? observedPath(baseDir, 'paper-observed-state.json'),
    openOrdersPath: options.openOrdersPath ?? observedPath(baseDir, 'paper-observed-open-orders.json'),
    eventPath: options.eventPath ?? observedPath(baseDir, 'paper-observed-events.ndjson'),
    reportPath: options.reportPath ?? observedPath(baseDir, 'paper-session-report.json')
  };
}

function cleanObservedFiles(paths: ObservedPaperSessionPaths): void {
  for (const filePath of Object.values(paths)) {
    fs.rmSync(filePath, { force: true });
  }
}

function selectWallet(args: {
  config: MarketMakerConfig;
  wallets: WalletSnapshot[];
  walletName?: string;
}): { walletConfig: WalletConfig; wallet: WalletSnapshot } {
  const walletConfig = args.walletName === undefined
    ? args.config.wallets[0]
    : args.config.wallets.find((candidate) => candidate.name === args.walletName || candidate.pubkey === args.walletName);

  if (walletConfig === undefined) {
    throw new Error(`observed paper session wallet not found in config: ${args.walletName ?? 'first wallet'}`);
  }

  const wallet = args.wallets.find((candidate) => candidate.pubkey === walletConfig.pubkey || candidate.name === walletConfig.name);
  if (wallet === undefined) {
    throw new Error(`observed paper session snapshot not found for wallet ${walletConfig.name}`);
  }

  return { walletConfig, wallet };
}

export function buildObservedPaperRuntimeInput(args: {
  config: MarketMakerConfig;
  walletConfig: WalletConfig;
  wallet: WalletSnapshot;
  wallets?: WalletSnapshot[];
  market: MarketSnapshot;
  startedAt?: string;
  startValueSol?: number;
}): RuntimeStepInput {
  if (args.config.mode === 'live') {
    throw new Error('observed paper sessions refuse live mode; use dry-run or paper config only');
  }

  const observedAtMs = Date.parse(args.market.observedAt);
  if (!Number.isFinite(observedAtMs)) {
    throw new Error(`observed paper session market.observedAt is invalid: ${args.market.observedAt}`);
  }

  const startValueSol = args.startValueSol
    ?? (args.market.referencePrice === null
      ? args.wallet.solBalance
      : args.wallet.solBalance + args.wallet.tokenBalance * args.market.referencePrice);

  return {
    config: args.config,
    walletConfig: args.walletConfig,
    wallet: args.wallet,
    wallets: args.wallets ?? [args.wallet],
    market: args.market,
    startedAt: args.startedAt ?? args.market.observedAt,
    startValueSol,
    nowMs: observedAtMs,
    quoteLevelOptions: { levelCount: 1 }
  };
}

export async function createObservedPaperSessionReport(args: {
  config: MarketMakerConfig;
  wallets: WalletSnapshot[];
  market?: MarketSnapshot;
  markets?: MarketSnapshot[];
  options?: ObservedPaperSessionOptions;
}): Promise<ObservedPaperSessionResult> {
  const options = args.options ?? {};
  const paths = resolvePaths(options);
  if (options.clean ?? true) cleanObservedFiles(paths);

  const { walletConfig, wallet } = selectWallet({
    config: args.config,
    wallets: args.wallets,
    walletName: options.walletName
  });

  const markets = args.markets ?? (args.market === undefined ? [] : [args.market]);
  if (markets.length === 0) {
    throw new Error('observed paper session requires at least one market snapshot');
  }

  const startedAt = options.startedAt ?? markets[0]!.observedAt;
  const startValueSol = options.startValueSol
    ?? (markets[0]!.referencePrice === null
      ? wallet.solBalance
      : wallet.solBalance + wallet.tokenBalance * markets[0]!.referencePrice);

  const inputs = markets.map((market) => buildObservedPaperRuntimeInput({
    config: args.config,
    walletConfig,
    wallet,
    wallets: args.wallets,
    market,
    startedAt,
    startValueSol
  }));

  const result = await runBoundedPaperRunner({
    inputs,
    statePath: paths.statePath,
    openOrdersPath: paths.openOrdersPath,
    eventPath: paths.eventPath,
    reportPath: paths.reportPath,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: options.maxCycles ?? markets.length,
    fillRatio: 1,
    paperFeePresetName: options.paperFeePresetName ?? 'openbook-v2-default',
    makerFeeBps: options.makerFeeBps,
    takerFeeBps: options.takerFeeBps,
    stopOnPaperRiskBlock: false
  });

  return {
    wallet: {
      name: wallet.name,
      pubkey: wallet.pubkey
    },
    paths,
    result,
    report: createPaperSessionReport(result)
  };
}
