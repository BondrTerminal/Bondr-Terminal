import 'dotenv/config';
import pino from 'pino';
import { loadConfig } from './config/load-config.js';
import { getMockMarketSnapshot } from './market-data/mock-market.js';
import { getMockWalletSnapshots } from './wallet/mock-wallets.js';
import { decideForWallet } from './decision/decide.js';
import { dryRunExecute } from './execution/dry-run.js';
import { appendDecisionLog } from './ledger/json-ledger.js';
import { buildMetricsSnapshot } from './metrics/snapshot.js';
import type { Decision } from './types/decision.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const configPath = process.argv[2] ?? 'config/market-maker.example.json';
const config = loadConfig(configPath);

logger.info({ mode: config.mode, tokenMint: config.tokenMint }, 'market-maker foundation starting');

const market = getMockMarketSnapshot(config.tokenMint, config.quoteMint);
const wallets = getMockWalletSnapshots(config);
const decisions: Decision[] = [];

for (const wallet of wallets) {
  const walletConfig = config.wallets.find((candidate) => candidate.pubkey === wallet.pubkey);
  if (!walletConfig) {
    logger.warn({ wallet }, 'wallet snapshot has no matching config');
    continue;
  }

  const decision = decideForWallet({ config, walletConfig, wallet, market });
  decisions.push(decision);
  const execution = dryRunExecute(decision);
  appendDecisionLog({ market, wallet, decision });

  logger.info({ wallet: wallet.name, market, decision, execution }, 'decision recorded');
}

const metrics = buildMetricsSnapshot({ mode: config.mode, market, wallets, decisions });
logger.info({ metrics }, 'metrics snapshot');
logger.info('market-maker foundation completed one dry-run pass');
