import { mkdir, writeFile } from 'node:fs/promises';
import pino from 'pino';
import { loadConfig } from '../src/config/load-config.js';
import { loadEnv } from '../src/config/env.js';
import { createConnection } from '../src/solana/connection.js';
import { getTokenInfo } from '../src/solana/token-info.js';
import { getWalletSnapshots } from '../src/wallet/balances.js';
import { getJupiterMarketSnapshot } from '../src/market-data/jupiter-market.js';
import { createObservedPaperSessionReport } from '../src/runtime/observed-paper-session.js';
import type { MarketSnapshot } from '../src/types/decision.js';

function valueAfterFlag(name: string): string | undefined {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw?.slice(prefix.length);
}

function numberAfterFlag(name: string): number | undefined {
  const raw = valueAfterFlag(name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number; received ${raw}`);
  return parsed;
}

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL });
const configPath = valueAfterFlag('--config') ?? process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'config/market-maker.local.json';
const reportPath = valueAfterFlag('--report');
const walletName = valueAfterFlag('--wallet');
const makerFeeBps = numberAfterFlag('--maker-fee-bps');
const takerFeeBps = numberAfterFlag('--taker-fee-bps');
const mockSolBalance = numberAfterFlag('--mock-sol');
const mockTokenBalance = numberAfterFlag('--mock-token');
const cycles = Math.max(1, Math.floor(numberAfterFlag('--cycles') ?? 1));
const intervalMs = Math.max(0, Math.floor(numberAfterFlag('--interval-ms') ?? 0));

const config = loadConfig(configPath);
const paperConfig = config.execution.venues.includes('openbook')
  ? config
  : {
    ...config,
    execution: {
      ...config.execution,
      venues: ['openbook' as const, ...config.execution.venues]
    }
  };
const connection = createConnection(env);

logger.info({ configPath, tokenMint: config.tokenMint }, 'starting read-only observed paper report');

const tokenInfo = await getTokenInfo(connection, config.tokenMint);
const observedWallets = await getWalletSnapshots({ connection, wallets: config.wallets, tokenMint: config.tokenMint });
const wallets = observedWallets.map((wallet, index) => {
  if (index !== 0 || (mockSolBalance === undefined && mockTokenBalance === undefined)) return wallet;
  return {
    ...wallet,
    solBalance: mockSolBalance ?? wallet.solBalance,
    tokenBalance: mockTokenBalance ?? wallet.tokenBalance
  };
});
const markets: MarketSnapshot[] = [];
for (let index = 0; index < cycles; index += 1) {
  if (index > 0 && intervalMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  markets.push(await getJupiterMarketSnapshot({
    tokenMint: config.tokenMint,
    tokenDecimals: tokenInfo.decimals,
    quoteMint: config.quoteMint,
    quoteDecimals: 9,
    quoteSizeSol: Math.min(config.globalRisk.maxTradeSol, 0.01),
    slippageBps: config.globalRisk.maxSlippageBps,
    quoteUrl: env.JUPITER_QUOTE_URL,
    apiKey: env.JUPITER_API_KEY
  }));
}
const latestMarket = markets.at(-1)!;

const { paths, report, result, wallet } = await createObservedPaperSessionReport({
  config: paperConfig,
  wallets,
  markets,
  options: {
    reportPath,
    walletName,
    makerFeeBps,
    takerFeeBps
  }
});
const finalOpenOrderCount = report.totals.finalOpenOrderCount;
const configuredWallet = config.wallets.find((candidate) => candidate.pubkey === wallet.pubkey || candidate.name === wallet.name);

const status = {
  mode: config.mode,
  health: 'warning' as const,
  cluster: config.cluster,
  venue: config.execution.venues.includes('openbook') ? 'jupiter-read-only + openbook-paper' : 'jupiter-read-only + openbook-paper-overlay',
  lastObservationAt: latestMarket.observedAt,
  liveTradingEnabled: false as const,
  wallet: {
    name: wallet.name,
    pubkey: wallet.pubkey,
    solBalance: wallets.find((candidate) => candidate.pubkey === wallet.pubkey)?.solBalance ?? null,
    tokenBalance: wallets.find((candidate) => candidate.pubkey === wallet.pubkey)?.tokenBalance ?? null
  },
  token: {
    mint: tokenInfo.mint,
    symbol: tokenInfo.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? 'USDC' : 'TOKEN',
    decimals: tokenInfo.decimals,
    supplyUi: tokenInfo.supplyUi
  },
  quote: {
    mint: config.quoteMint,
    symbol: config.quoteMint === 'So11111111111111111111111111111111111111112' ? 'SOL' : 'QUOTE',
    decimals: 9
  },
  market: {
    referencePrice: latestMarket.referencePrice,
    estimatedSlippageBps: latestMarket.estimatedSlippageBps,
    volatilityBps: latestMarket.volatilityBps
  },
  risk: config.globalRisk,
  strategy: {
    autonomy: config.mode === 'dry-run' ? 'autonomous-paper' as const : 'autonomous-live-disabled' as const,
    objective: 'Continuously quote both sides, scalp spread when fills occur, and keep inventory near target inside the risk envelope.',
    engineState: finalOpenOrderCount > 0 ? 'waiting-for-fills' as const : 'observing' as const,
    baseSpreadBps: config.quoting.baseSpreadBps,
    minSpreadBps: config.quoting.minSpreadBps,
    maxSpreadBps: config.quoting.maxSpreadBps,
    inventorySkewBps: config.quoting.inventorySkewBps,
    targetInventoryUi: configuredWallet?.targetTokenInventory ?? null,
    maxInventoryUi: configuredWallet?.maxTokenInventory ?? null,
    minDelayMs: config.quoting.minDelayMs,
    maxDelayMs: config.quoting.maxDelayMs
  },
  notes: [
    mockSolBalance === undefined && mockTokenBalance === undefined
      ? 'Generated by scripts/generate-observed-paper-report.ts from public read-only market/wallet data.'
      : 'Generated by scripts/generate-observed-paper-report.ts from public read-only market data with explicit mock paper balances.',
    'The paper report uses paper-only OpenBook-style order placement and simulated fills.',
    'No private keys, signing, swaps, transactions, live order placement, or cancels were used.',
    'Live trading remains disabled.'
  ],
  source: 'status-file' as const
};

await mkdir('runtime', { recursive: true });
await writeFile('runtime/market-maker-status.local.json', `${JSON.stringify(status, null, 2)}\n`);

logger.info({
  reportPath: paths.reportPath,
  statusFile: 'runtime/market-maker-status.local.json',
  wallet,
  executedCycleCount: report.executedCycleCount,
  stoppedReason: report.stoppedReason,
  finalOpenOrderCount: report.totals.finalOpenOrderCount,
  filledOrderCount: report.totals.filledOrderCount,
  finalPaperPnlSol: report.final.paperPnl?.totalPaperPnlSol ?? null,
  finalPaperRisk: report.final.paperRisk?.action ?? null,
  paperOnly: report.paperOnly,
  liveExecution: report.liveExecution,
  resultPaperOnly: result.summary.paperOnly,
  mockSolBalance: mockSolBalance ?? null,
  mockTokenBalance: mockTokenBalance ?? null,
  cycles,
  intervalMs
}, 'generated read-only observed paper report');
