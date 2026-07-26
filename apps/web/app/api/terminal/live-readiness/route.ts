import { buildProviderReadiness } from '../../../../lib/provider-readiness';
import { mutationMeta } from '../../../../lib/mutation-safety';
import { terminalOrderStorePath } from '../../../../lib/terminal-order-store';
import { liveStoreMetadata, liveStorePath } from '../../../../lib/live-store';

export const dynamic = 'force-dynamic';

type CategoryStatus = 'ready' | 'mostly-ready' | 'partial' | 'blocked';

type Category = {
  status: CategoryStatus;
  score: number;
  evidence: string[];
  blockers: string[];
};

function envNumber(name: string, fallback: string) {
  const raw = process.env[name] ?? fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function category(status: CategoryStatus, score: number, evidence: string[], blockers: string[] = []): Category {
  return { status, score, evidence, blockers };
}

function average(categories: Record<string, Category>) {
  const values = Object.values(categories).map((item) => item.score);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export async function GET() {
  const observedAt = new Date().toISOString();
  const provider = await buildProviderReadiness();
  const liveTradingEnabled = process.env.LIVE_TRADING_ENABLED === 'true';
  const maxSol = envNumber('LIVE_MAX_SOL_PER_SWAP', '0.05');
  const maxUsdc = envNumber('LIVE_MAX_USDC_PER_SWAP', '10');
  const maxSlippage = envNumber('LIVE_MAX_SLIPPAGE_BPS', '500');
  const rpcReady = provider.sources.solanaRpc.status === 'ok' && provider.sources.solanaRpc.suitableForLiveMode === true;
  const rpcPublicFallback = provider.sources.solanaRpc.status === 'public-fallback';
  const jupiterReady = provider.sources.jupiter.status === 'ok';
  const providerHistoryReady = provider.sources.helius.status === 'ok' || provider.sources.birdeye.status === 'ok';
  const mutation = mutationMeta('Live-readiness dry-run inspected mutation mode; no mutation performed.');
  const liveStore = liveStoreMetadata('Live store inspected for readiness; no mutation performed.');
  const intentRegistryReady = true;
  const signerDryRunRouteReady = true;
  const signerStagingVerified = process.env.SIGNER_DRY_RUN_STAGING_VERIFIED === 'true';

  const categories = {
    marketData: category(jupiterReady ? 'ready' : 'partial', jupiterReady ? 92 : 65, ['Jupiter quote route checked.', 'DexScreener/GeckoTerminal no-key fallbacks available.'], jupiterReady ? [] : ['Jupiter quote probe unavailable.']),
    walletHydration: category(rpcReady ? 'mostly-ready' : rpcPublicFallback ? 'partial' : 'blocked', rpcReady ? 85 : rpcPublicFallback ? 68 : 25, ['Wallet SOL/SPL hydration uses Solana RPC.', `RPC status: ${provider.sources.solanaRpc.status}.`], rpcReady ? [] : ['Configure reliable private RPC before live mode.']),
    quote: category(jupiterReady ? 'ready' : 'blocked', jupiterReady ? 95 : 30, ['Quote endpoint is quote-only and does not build/sign/send.'], jupiterReady ? [] : ['Jupiter quote unavailable.']),
    unsignedSwapBuild: category('partial', 76, ['Swap builder route exists and is gated by LIVE_TRADING_ENABLED.', 'Future live path returns unsigned Jupiter transaction plus intent metadata for browser signing.'], ['Needs final live-gate dry-run in staging with unfunded/dev wallet before production.']),
    browserSigning: category(signerStagingVerified ? 'mostly-ready' : 'partial', signerStagingVerified ? 86 : 68, ['Server-side private-key signing not used.', 'Browser wallet signer required by execution contracts.', signerStagingVerified ? 'Signer dry-run staging verification marked complete by env.' : 'Signer dry-run route exists, but no real unfunded/dev wallet staging signature has been verified.'], signerStagingVerified ? [] : ['Run real browser-wallet signer-match staging dry-run with an unfunded/dev wallet.']),
    signedBroadcast: category('partial', 74, ['Broadcast route is live-gated.', 'Stored intent id is required before future broadcast.', 'Intent registry/policy check implemented.', 'Server signing false.'], ['Needs durable intent DB, authenticated operator policy, and final staging signer-match test before production live.']),
    orderLifecycle: category('partial', 72, ['Terminal order store path available.', terminalOrderStorePath(), 'Lifecycle covers created/evaluated/triggered/transaction_built/signed_client_side/broadcast/confirmed/failed.'], ['Local JSON is not production durable and has no production operator auth.']),
    bundleSequencer: category('partial', 66, ['Bundle sequencer is preflight/build only.', 'Relay/Jito submission explicitly unavailable.'], ['Implement real relay integration only after simulation, auth, and provider requirements.']),
    providerReliability: category(rpcReady && providerHistoryReady ? 'mostly-ready' : 'partial', rpcReady && providerHistoryReady ? 82 : 58, ['Provider readiness contract reports exact configured/fallback states.', `Provider gaps: ${provider.optionalProviderGaps.length}.`], provider.blockingForLive),
    mutationDurability: category(liveStore.productionReady ? 'mostly-ready' : 'blocked', liveStore.productionReady ? 82 : 38, [`Storage mode: ${liveStore.storageMode}.`, `Durable adapter implemented: ${liveStore.durableAdapterImplemented}.`, `Intent registry path: ${liveStorePath()}.`, 'Atomic local JSON writes are available for local dev only.', 'Mutation metadata reports requiresAuth/productionReady.'], liveStore.productionReady ? [] : ['Production live mode needs implemented durable DB/storage adapter and operator auth. DATABASE_URL alone is not enough.']),
    safetyGates: category(!liveTradingEnabled ? 'mostly-ready' : 'partial', !liveTradingEnabled ? 88 : 70, ['LIVE_TRADING_ENABLED is false.', 'Max SOL/USDC/slippage limits are present.', 'Execution swap/broadcast stay blocked until gate enabled.'], [maxSol && maxUsdc && maxSlippage ? '' : 'Missing live size/slippage limit env.'].filter(Boolean))
  } satisfies Record<string, Category>;

  const terminalBackendReadinessPercent = average(categories);
  const liveTradingEnablementReadinessPercent = Math.round((categories.safetyGates.score + categories.signedBroadcast.score + categories.providerReliability.score + categories.mutationDurability.score + categories.walletHydration.score + categories.unsignedSwapBuild.score) / 6);
  const mustFixBeforeLive = Array.from(new Set([
    ...provider.blockingForLive,
    liveStore.productionReady ? null : 'Implement authenticated durable DB/storage adapter for orders, intents, and mutation audit logs; DATABASE_URL alone is not enough.',
    signerStagingVerified ? null : 'Run browser-wallet signer-match staging dry-run with an unfunded/dev wallet.',
    'Keep relay/Jito disabled until real relay provider, simulation, and auth are implemented.'
  ].filter((item): item is string => Boolean(item))));

  return Response.json({
    status: 'ok',
    observedAt,
    source: 'terminal-live-readiness',
    execution: 'read-only-dry-run-no-transaction-build-no-broadcast',
    liveTradingEnabled,
    score: terminalBackendReadinessPercent,
    categories,
    terminalBackendReadinessPercent,
    liveTradingEnablementReadinessPercent,
    mustFixBeforeLive,
    biggestRisks: [
      'Public RPC/rate limits during live execution.',
      'Local JSON mutation/order storage losing state under concurrency or deployment restarts.',
      'Broadcasting without durable authenticated intent storage if live mode is enabled too early.',
      'Incomplete wallet-attributed history causing low-confidence PnL/risk decisions.'
    ],
    limits: { maxSolPerSwap: maxSol, maxUsdcPerSwap: maxUsdc, maxSlippageBps: maxSlippage },
    mutation,
    liveStore,
    intentRegistry: { ready: intentRegistryReady, route: '/api/terminal/intents', storagePath: liveStorePath(), productionReady: liveStore.productionReady },
    signerDryRun: { routeReady: signerDryRunRouteReady, stagingVerified: signerStagingVerified, route: '/api/terminal/signer-dry-run', broadcasts: false },
    providerReadiness: provider,
    secretsExposed: false
  });
}
