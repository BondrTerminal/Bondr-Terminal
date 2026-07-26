import { configuredSolanaRpc } from '../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rpc = configuredSolanaRpc();
  return Response.json({
    phase: 'live-data-and-gated-execution',
    observedAt: new Date().toISOString(),
    execution: process.env.LIVE_TRADING_ENABLED === 'true' ? 'browser-wallet-live-enabled' : 'browser-wallet-live-gated',
    obligation: 'Report which scanner, reader, indexer, quote, swap-build, signing, and broadcast paths are installed, credential-dependent, or blocked by live-mode gates.',
    sources: {
      solanaRpc: { provider: rpc.provider, configured: rpc.configured, heliusEnhancedTransactions: rpc.enhancedTransactions },
      tokenIntel: '/api/token-intel?mint=<mint>',
      tokenStats: '/api/token-stats?mint=<mint>',
      tokenTransactions: '/api/token-transactions?mint=<mint>',
      tokenMarketFeed: '/api/token-market-feed?mint=<mint>',
      tokenPoolIndex: '/api/token-pool-index?mint=<mint>',
      tokenChart: '/api/token-chart?mint=<mint>&frame=5m',
      walletBalances: '/api/wallet-balances',
      walletTokenBalances: '/api/wallet-token-balances?mint=<mint>',
      walletFundingIndex: '/api/wallet-funding-index?wallet=<wallet>',
      bundleClusteringIndex: '/api/bundle-clustering-index?mint=<mint>',
      freshWalletClassifier: '/api/fresh-wallet-classifier?mint=<mint>',
      devSoldClassifier: '/api/dev-sold-classifier?mint=<mint>&devWallets=<csv>',
      lpLockBurnScanner: '/api/lp-lock-burn-scanner?mint=<mint>',
      walletOpsEngine: '/api/wallet-ops-engine',
      deploymentEngine: '/api/deployment-engine',
      terminalOrderEngine: '/api/terminal-order-engine',
      bundleSequencer: '/api/bundle-sequencer',
      terminalBackend: '/api/terminal-backend',
      jupiterQuote: '/api/execution-quote',
      jupiterSwapBuilder: '/api/execution-swap',
      signedBroadcast: '/api/send-signed-transaction'
    },
    liveGuards: {
      liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === 'true',
      maxSolPerSwap: Number(process.env.LIVE_MAX_SOL_PER_SWAP ?? '0.05'),
      maxUsdcPerSwap: Number(process.env.LIVE_MAX_USDC_PER_SWAP ?? '10'),
      maxSlippageBps: Number(process.env.LIVE_MAX_SLIPPAGE_BPS ?? '500'),
      signer: 'browser-wallet'
    },
    secretsExposed: false
  });
}
