import { Connection } from '@solana/web3.js';
import { serverEnvConfigured } from './server-env';
import { configuredSolanaRpc } from './solana-rpc';
import { gmgnReadiness } from './gmgn';
import { getSolanaTrackerConfig, getSolanaTrackerCredits, getSolanaTrackerPrice } from './solana-tracker';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TIMEOUT_MS = 5_000;

export type ProviderState = 'ok' | 'partial' | 'unavailable' | 'public-fallback' | 'optional-not-configured' | 'blocked-by-live-gate' | 'error';

type RuntimeProbe = {
  status: ProviderState;
  latencyMs: number | null;
  checkedAt: string;
  error: string | null;
  [key: string]: unknown;
};


function providerCapabilityMatrix() {
  return {
    dexscreener: {
      unlocks: ['pool discovery', 'price', 'liquidity', 'volume', 'active-token probe candidates'],
      missingImpact: 'Market context degraded, but not wallet-attributed trade tape.',
      classification: 'optional-market-context'
    },
    jupiter: {
      unlocks: ['quote checks', 'route labels', 'route preview'],
      missingImpact: 'Quote preview and swap-build readiness degrade; no server signing.',
      classification: 'execution-preview'
    },
    birdeye: {
      unlocks: ['preferred token trade tape', 'wallet-attributed transaction history', 'PnL confidence'],
      missingImpact: 'Trade tape degraded; wallet-attributed history degraded; PnL confidence reduced.',
      classification: 'confidence-reducing'
    },
    helius: {
      unlocks: ['parsed transactions', 'token-transfer fallback', 'holder/history enrichment', 'private RPC option'],
      missingImpact: 'Trade tape fallback degraded; holders/history/PnL confidence reduced; private RPC still required before live.',
      classification: 'confidence-reducing-and-live-rpc-gate'
    },
    solscan: {
      unlocks: ['ranked token holder list', 'holder-count cross-check'],
      missingImpact: 'Holder rows fall back to Helius/RPC/Pump.fun/RugCheck; exact ranked holder coverage can degrade.',
      classification: 'optional-holder-enrichment'
    },
    pumpfun: {
      unlocks: ['bonding/pump token tape', 'creator token context', 'migration context'],
      missingImpact: 'Only affects pump/bonding tokens. Non-pump 404 is not a fatal provider outage.',
      classification: 'optional-token-specific'
    },
    geckoterminal: {
      unlocks: ['best-effort pool trades', 'chart candles'],
      missingImpact: 'Can rate-limit; should never block terminal snapshot.',
      classification: 'best-effort-fallback'
    },
    bitquery: {
      unlocks: ['pool age', 'deep historical DEX context', 'same-block clustering research'],
      missingImpact: 'Pool-age and deep clustering confidence reduced.',
      classification: 'optional-confidence'
    },
    gmgn: {
      unlocks: ['GMGN token info', 'GMGN security', 'GMGN pools', 'GMGN holders/traders', 'GMGN trending/hot-search discovery'],
      missingImpact: 'GMGN intelligence unavailable; terminal falls back to existing providers.',
      classification: 'optional-market-and-risk-intelligence'
    },
    solanaTracker: {
      unlocks: ['token price', 'token metadata', 'holders', 'pools/liquidity', 'OHLCV chart', 'sniper/insider/bundler analytics', 'trade feed/events'],
      missingImpact: 'Primary BONDR token intelligence degrades to GMGN/Birdeye/Helius/Solscan/DexScreener fallbacks.',
      classification: 'preferred-primary-token-intelligence'
    }
  };
}

function configured(name: string) {
  return serverEnvConfigured(name);
}

async function timed<T>(fn: () => Promise<T>, timeoutMs = TIMEOUT_MS): Promise<{ value: T | null; probe: RuntimeProbe }> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const value = await Promise.race([
      fn(),
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    ]);
    clearTimeout(timeout);
    return { value, probe: { status: 'ok', latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: null } };
  } catch (error) {
    clearTimeout(timeout);
    return { value: null, probe: { status: 'unavailable', latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'unknown error' } };
  }
}

async function fetchProbe(url: string) {
  return timed(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (process.env.JUPITER_API_KEY && url.includes('jup.ag')) headers['x-api-key'] = process.env.JUPITER_API_KEY;
      const response = await fetch(url, { signal: controller.signal, headers, cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.status;
    } finally {
      clearTimeout(timeout);
    }
  });
}

async function fetchProbeWithHeaders(url: string, headers: Record<string, string>) {
  return timed(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json', ...headers }, cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.status;
    } finally {
      clearTimeout(timeout);
    }
  });
}

export async function buildProviderReadiness() {
  const observedAt = new Date().toISOString();
  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  const birdeyeKey = process.env.BIRDEYE_API_KEY?.trim();
  const solanaTrackerConfig = getSolanaTrackerConfig();
  const [slotProbe, blockhashProbe, jupiterProbe, dexProbe, geckoProbe, rugProbe, birdeyeProbe, solanaTrackerPriceProbe, solanaTrackerCreditsProbe] = await Promise.all([
    timed(async () => connection.getSlot('confirmed')),
    timed(async () => connection.getLatestBlockhash('confirmed')),
    fetchProbe(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=1000000&slippageBps=100`),
    fetchProbe(`https://api.dexscreener.com/latest/dex/tokens/${SOL_MINT}`),
    fetchProbe('https://api.geckoterminal.com/api/v2/networks/solana/pools/BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU'),
    fetchProbe(`https://api.rugcheck.xyz/v1/tokens/${USDC_MINT}/report/summary`),
    birdeyeKey ? fetchProbeWithHeaders(`https://public-api.birdeye.so/defi/txs/token?address=${USDC_MINT}&offset=0&limit=1`, { 'X-API-KEY': birdeyeKey, 'x-chain': 'solana' }) : Promise.resolve({ value: null, probe: { status: 'optional-not-configured' as ProviderState, latencyMs: null, checkedAt: new Date().toISOString(), error: null } }),
    getSolanaTrackerPrice(SOL_MINT),
    getSolanaTrackerCredits()
  ]);

  const heliusConfigured = rpc.provider === 'helius-rpc-url' || rpc.provider === 'helius-api-key';
  const rpcLatencyOk = (slotProbe.probe.latencyMs ?? 9999) < 1500 && (blockhashProbe.probe.latencyMs ?? 9999) < 1500;
  const rpcHealthy = slotProbe.probe.status === 'ok' && blockhashProbe.probe.status === 'ok';
  const rpcLiveSuitable = rpc.configured && rpcHealthy && rpcLatencyOk;
  const rpcStatus: ProviderState = rpc.configured ? (rpcLiveSuitable ? 'ok' : rpcHealthy ? 'partial' : 'unavailable') : (slotProbe.probe.status === 'ok' ? 'public-fallback' : 'unavailable');
  const heliusSourceStatus: ProviderState = heliusConfigured ? (rpc.provider === 'helius-api-key' || rpc.provider === 'helius-rpc-url' ? (rpcHealthy ? 'ok' : 'unavailable') : 'ok') : 'optional-not-configured';
  const birdeyeSourceStatus: ProviderState = birdeyeKey ? (birdeyeProbe.probe.status === 'ok' ? 'ok' : birdeyeProbe.probe.status === 'unavailable' && String(birdeyeProbe.probe.error ?? '').includes('429') ? 'partial' : 'unavailable') : 'optional-not-configured';
  const solanaTrackerSourceStatus: ProviderState = !solanaTrackerConfig.configured ? 'optional-not-configured' : solanaTrackerPriceProbe.status === 'ok' ? 'ok' : solanaTrackerPriceProbe.status === 'rate-limited' ? 'partial' : 'unavailable';
  const gmgn = gmgnReadiness();
  const sources = {
    solanaRpc: {
      status: rpcStatus,
      configured: rpc.configured,
      provider: rpc.provider,
      recentSlot: slotProbe.value,
      latestBlockhashAvailable: blockhashProbe.probe.status === 'ok',
      latestBlockhashLatencyMs: blockhashProbe.probe.latencyMs,
      suitableForLiveMode: rpcLiveSuitable,
      minimumReliabilityThreshold: { configuredPrivateRpc: true, currentSlotAvailable: true, latestBlockhashAvailable: true, slotLatencyMsUnder: 1500, blockhashLatencyMsUnder: 1500, noPublicFallback: true },
      thresholdPasses: { configuredPrivateRpc: rpc.configured, currentSlotAvailable: slotProbe.probe.status === 'ok', latestBlockhashAvailable: blockhashProbe.probe.status === 'ok', slotLatencyOk: (slotProbe.probe.latencyMs ?? 9999) < 1500, blockhashLatencyOk: (blockhashProbe.probe.latencyMs ?? 9999) < 1500, noPublicFallback: rpc.configured },
      remediation: rpc.configured ? null : 'Set SOLANA_RPC_URL, QUICKNODE_RPC_URL, TRITON_RPC_URL, SYNDICA_RPC_URL, ALCHEMY_RPC_URL, CHAINSTACK_RPC_URL, ANKR_RPC_URL, JITO_RPC_URL, HELIUS_RPC_URL, or HELIUS_API_KEY before live trading.',
      latencyMs: slotProbe.probe.latencyMs,
      rateLimitOrError: slotProbe.probe.error,
      features: ['wallet SOL balances', 'SPL token account scans', 'recent blockhash', 'current slot'],
      note: rpcLiveSuitable ? 'Configured private Solana RPC meets current live-readiness threshold.' : rpc.configured ? 'Configured Solana RPC is present but does not meet every live-readiness threshold yet.' : 'Using public fallback RPC; safe for read-only checks but not reliable enough for production live mode.'
    },
    helius: {
      status: heliusSourceStatus,
      configured: heliusConfigured,
      credentialProbeLatencyMs: heliusConfigured ? slotProbe.probe.latencyMs : null,
      credentialProbeError: heliusConfigured && heliusSourceStatus !== 'ok' ? slotProbe.probe.error ?? blockhashProbe.probe.error ?? 'Helius RPC probe failed.' : null,
      featuresUnlockedIfConfigured: ['enhanced transaction history', 'more reliable RPC', 'wallet/token transfer parsing', 'holder/fresh-wallet enrichment'],
      note: heliusConfigured ? (heliusSourceStatus === 'ok' ? 'Helius detected and RPC probe succeeded; secret value not exposed.' : 'Helius env is present, but the provider rejected or failed the runtime probe. Verify the key/value in Vercel.') : 'Optional but strongly recommended before live terminal operation.'
    },
    birdeye: {
      status: birdeyeSourceStatus,
      configured: Boolean(birdeyeKey),
      credentialProbeLatencyMs: birdeyeProbe.probe.latencyMs,
      credentialProbeError: birdeyeKey && birdeyeSourceStatus !== 'ok' ? birdeyeProbe.probe.error : null,
      featuresUnlockedIfConfigured: ['preferred token transaction history', 'wallet-attributed trade history', 'higher-confidence PnL inputs'],
      note: birdeyeKey ? (birdeyeSourceStatus === 'ok' ? 'Birdeye configured and credential probe succeeded.' : 'Birdeye env is present, but the provider rejected or failed the runtime probe. Verify the API key and plan access.') : 'Optional provider for better token history/PnL.'
    },
    solanaTracker: {
      status: solanaTrackerSourceStatus,
      configured: solanaTrackerConfig.configured,
      authMode: solanaTrackerConfig.authMode,
      keyLooksLikeUrl: solanaTrackerConfig.keyLooksLikeUrl,
      credentialProbeLatencyMs: solanaTrackerPriceProbe.latencyMs,
      credentialProbeError: solanaTrackerSourceStatus !== 'ok' ? solanaTrackerPriceProbe.note : null,
      creditsStatus: solanaTrackerCreditsProbe.status,
      creditsLatencyMs: solanaTrackerCreditsProbe.latencyMs,
      creditsNote: solanaTrackerCreditsProbe.note,
      featuresUnlockedIfConfigured: ['token price', 'token metadata', 'holders', 'pools/liquidity', 'OHLCV chart', 'sniper/insider/bundler analytics', 'trade feed/events'],
      note: solanaTrackerConfig.configured ? (solanaTrackerSourceStatus === 'ok' ? 'Solana Tracker configured and runtime price probe succeeded; secret value not exposed.' : solanaTrackerPriceProbe.note ?? 'Solana Tracker configured but runtime probe did not pass.') : 'Preferred primary token intelligence provider. Set SOLANATRACKER_API_KEY.'
    },
    bitquery: {
      status: configured('BITQUERY_API_KEY') ? 'ok' : 'optional-not-configured',
      configured: configured('BITQUERY_API_KEY'),
      featuresUnlockedIfConfigured: ['same-block clustering', 'bundle analysis', 'advanced trade graph enrichment'],
      note: configured('BITQUERY_API_KEY') ? 'Bitquery configured server-side.' : 'Optional provider for bundle/fresh-wallet analytics.'
    },
    solscan: {
      status: configured('SOLSCAN_API_KEY') || configured('SOLSCAN_PRO_API_KEY') ? 'ok' : 'optional-not-configured',
      configured: configured('SOLSCAN_API_KEY') || configured('SOLSCAN_PRO_API_KEY'),
      featuresUnlockedIfConfigured: ['ranked token holders before RPC/RugCheck fallbacks', 'holder-count cross-check'],
      note: configured('SOLSCAN_API_KEY') || configured('SOLSCAN_PRO_API_KEY') ? 'Solscan holder API configured server-side.' : 'Optional holder source. Terminal falls back to Helius DAS, Solana RPC largest accounts, Pump.fun, then RugCheck.'
    },
    jupiter: {
      status: jupiterProbe.probe.status,
      configured: true,
      quoteLatencyMs: jupiterProbe.probe.latencyMs,
      quoteError: jupiterProbe.probe.error,
      features: ['quote preview', 'unsigned swap build when live gate allows'],
      note: 'No-key quote route available; swap build remains live-gated and browser-signed.'
    },
    dexscreener: {
      status: dexProbe.probe.status,
      configured: true,
      latencyMs: dexProbe.probe.latencyMs,
      error: dexProbe.probe.error,
      features: ['pairs', 'liquidity', 'volume', 'aggregate tx windows'],
      note: 'No-key market data fallback.'
    },
    geckoterminal: {
      status: geckoProbe.probe.status,
      configured: true,
      latencyMs: geckoProbe.probe.latencyMs,
      error: geckoProbe.probe.error,
      features: ['OHLCV chart', 'pool trade rows'],
      note: 'No-key chart/trade fallback.'
    },
    rugcheck: {
      status: rugProbe.probe.status,
      configured: true,
      latencyMs: rugProbe.probe.latencyMs,
      error: rugProbe.probe.error,
      features: ['risk summary', 'holder/rug hints where available'],
      note: 'No-key risk fallback; availability can vary by token.'
    },
    gmgn: {
      status: gmgn.status,
      configured: gmgn.configured,
      cliInstalled: gmgn.cliInstalled,
      execution: gmgn.execution,
      featuresUnlockedIfConfigured: gmgn.featuresUnlockedIfConfigured,
      disabledCapabilities: gmgn.disabledCapabilities,
      note: gmgn.note
    }
  } as const;

  const blockingForLive = [
    !rpc.configured ? 'Configure reliable private Solana RPC before live trading.' : null,
    rpc.configured && !rpcLiveSuitable ? 'Configured Solana RPC does not meet live reliability threshold.' : null,
    blockhashProbe.probe.status !== 'ok' ? 'RPC latest blockhash probe unavailable.' : null,
    jupiterProbe.probe.status !== 'ok' ? 'Jupiter quote route unavailable.' : null
  ].filter((item): item is string => Boolean(item));

  const optionalProviderGaps = [
    !heliusConfigured ? 'Helius optional-not-configured: enhanced transaction history unavailable.' : heliusSourceStatus !== 'ok' ? 'Helius configured but runtime probe failed: verify API key/RPC URL.' : null,
    !birdeyeKey ? 'Birdeye optional-not-configured: preferred token transaction history unavailable.' : birdeyeSourceStatus !== 'ok' ? 'Birdeye configured but credential probe failed: verify API key and plan access.' : null,
    !solanaTrackerConfig.configured ? 'Solana Tracker optional-not-configured: preferred token intelligence unavailable.' : solanaTrackerSourceStatus !== 'ok' ? 'Solana Tracker configured but runtime probe failed: verify key/base URL/plan access.' : null,
    !configured('SOLSCAN_API_KEY') && !configured('SOLSCAN_PRO_API_KEY') ? 'Solscan optional-not-configured: preferred ranked holder API unavailable.' : null,
    !configured('BITQUERY_API_KEY') ? 'Bitquery optional-not-configured: deep bundle/same-block clustering unavailable.' : null,
    gmgn.status !== 'ok' ? `GMGN ${gmgn.status}: set GMGN_API_KEY to unlock read-only GMGN token/market intelligence.` : null
  ].filter((item): item is string => Boolean(item));

  return {
    status: blockingForLive.length ? 'partial' as const : 'ok' as const,
    observedAt,
    source: 'provider-readiness',
    sources,
    blockingForLive,
    optionalProviderGaps,
    providerCapabilities: providerCapabilityMatrix(),
    recommendedProbe: { route: '/api/market-data/probe-token', envOverride: 'RECOMMENDED_PROBE_MINT', note: 'Use this instead of USDC when testing active memecoin trade tape.' },
    historyAndPnlConfidence: { status: heliusSourceStatus === 'ok' || birdeyeSourceStatus === 'ok' ? 'provider-assisted' : 'low-history-confidence', note: heliusSourceStatus === 'ok' || birdeyeSourceStatus === 'ok' ? 'At least one history provider passed its runtime probe.' : 'Current holdings can hydrate from fallback sources, but wallet-attributed history/PnL remains low confidence until Helius or Birdeye runtime probes pass.' },
    secretsExposed: false,
    liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === 'true',
    execution: process.env.LIVE_TRADING_ENABLED === 'true' ? 'live-gated-browser-wallet' : 'live-disabled-readiness-only'
  };
}
