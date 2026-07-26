import { configuredSolanaRpc } from '../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rpc = configuredSolanaRpc();
  const liveTradingEnabled = process.env.LIVE_TRADING_ENABLED === 'true';
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    liveTradingEnabled,
    signer: 'browser-wallet',
    swapBuilder: '/api/execution-swap',
    broadcaster: '/api/send-signed-transaction',
    quotePreview: '/api/execution-quote',
    rpcProvider: rpc.provider,
    rpcConfigured: rpc.configured,
    enhancedTransactions: rpc.enhancedTransactions,
    limits: {
      maxSolPerSwap: Number(process.env.LIVE_MAX_SOL_PER_SWAP ?? '0.05'),
      maxUsdcPerSwap: Number(process.env.LIVE_MAX_USDC_PER_SWAP ?? '10'),
      maxSlippageBps: Number(process.env.LIVE_MAX_SLIPPAGE_BPS ?? '500')
    },
    engines: {
      bundleClusteringIndex: '/api/bundle-clustering-index?mint=<mint>',
      freshWalletClassifier: '/api/fresh-wallet-classifier?mint=<mint>',
      devSoldClassifier: '/api/dev-sold-classifier?mint=<mint>&devWallets=<csv>',
      lpLockBurnScanner: '/api/lp-lock-burn-scanner?mint=<mint>',
      walletOpsEngine: '/api/wallet-ops-engine',
      deploymentEngine: '/api/deployment-engine',
      terminalOrderEngine: '/api/terminal-order-engine',
      bundleSequencer: '/api/bundle-sequencer',
      terminalBackend: '/api/terminal-backend'
    },
    disabledReason: liveTradingEnabled ? null : 'LIVE_TRADING_ENABLED is false. Quote previews are live; swap signing/broadcast remain blocked.'
  });
}
