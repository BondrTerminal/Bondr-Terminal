import { PublicKey } from '@solana/web3.js';
import { buildJitoBundlePreview } from '../../../lib/jito-relay-adapter';
import { getJitoRelayReadiness } from '../../../lib/jito-relay-readiness';
import { getLiveActivationStatus } from '../../../lib/live-activation';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function liveTradingEnabled() {
  return process.env.LIVE_TRADING_ENABLED === 'true';
}
const MAX_WALLETS = Number(process.env.BUNDLE_MAX_WALLETS ?? '8');
const MAX_TOTAL_SOL = Number(process.env.BUNDLE_MAX_TOTAL_SOL ?? '0.25');
const MAX_TOTAL_USDC = Number(process.env.BUNDLE_MAX_TOTAL_USDC ?? '50');

type BundleLeg = {
  wallet: string;
  side?: 'Buy' | 'Sell' | 'buy' | 'sell';
  amount: string;
  spendAsset?: 'SOL' | 'USDC';
  slippageBps?: number | string;
};

type BundleRequest = {
  mint?: string;
  legs?: BundleLeg[];
  mode?: 'build' | 'preflight';
};

function assertPubkey(value: unknown, label: string) {
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) throw new Error(`Missing or invalid ${label}.`);
  new PublicKey(value);
  return value;
}
function numericAmount(raw: string) {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error('Bundle leg amount must be a positive number.');
  return n;
}
function summarize(legs: BundleLeg[]) {
  let totalSol = 0;
  let totalUsdc = 0;
  for (const leg of legs) {
    const amount = numericAmount(leg.amount);
    if ((leg.spendAsset ?? 'SOL') === 'USDC') totalUsdc += amount;
    else totalSol += amount;
  }
  return { totalSol, totalUsdc };
}

export async function GET() {
  const relay = getJitoRelayReadiness();
  const activation = getLiveActivationStatus();
  const bundlePreview = buildJitoBundlePreview({}, activation, relay);
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    liveTradingEnabled: liveTradingEnabled(),
    route: '/api/bundle-sequencer',
    flowType: 'multi-wallet-preflight-build',
    stages: { preflight: 'available', unsignedTransactionBuild: liveTradingEnabled() ? 'available-after-preflight' : 'blocked-by-live-gate', browserWalletSigning: 'required-per-leg', signedBundleReview: 'required-before-relay', broadcast: 'explicit-only-via-/api/send-signed-transaction', relaySubmission: activation.broadcastEnabled && relay.relayEnabled ? 'gated-ready' : 'blocked-by-relay-or-broadcast-gate' },
    relaySubmission: false,
    relayStatus: relay.status,
    relayProvider: relay.provider,
    relay,
    relayRequirements: ['Jito/block-engine endpoint configured', 'tip account selection', 'Jito tip cap', 'bundle simulation', 'operator auth', 'durable intent/order tracking', 'explicit broadcast approval'],
    supportedRelays: ['jito-block-engine-json-rpc'],
    requiredEnv: relay.requiredEnv,
    simulationRequired: true,
    bundleId: null,
    signedBundlePayloadShape: {
      signedTransactions: 'base64[]',
      expectedSigners: 'wallet public key[]',
      expectedMint: 'token mint',
      tipLamports: `1..${relay.tip.maxLamports}`,
      policyRequired: true,
      previewEndpoint: '/api/relay/jito/bundle-preview',
      submitEndpointFuture: '/api/relay/jito/send-bundle'
    },
    relayPreviewContract: bundlePreview.contract,
    relayPreviewEndpoint: '/api/relay/jito/bundle-preview',
    relaySubmitEndpoint: '/api/relay/jito/send-bundle',
    relayPolicyBlockers: bundlePreview.blockers,
    signer: 'browser-wallet-per-leg',
    maxWallets: MAX_WALLETS,
    maxTotalSol: MAX_TOTAL_SOL,
    maxTotalUsdc: MAX_TOTAL_USDC,
    buildDependency: '/api/execution-swap',
    broadcastDependency: '/api/send-signed-transaction',
    note: 'This is multi-wallet validation/unsigned transaction build. Relay readiness is reported, but no Jito/block-engine bundle submission is performed here.',
    execution: liveTradingEnabled() ? 'bundle-builder-ready' : 'live-disabled-preflight-only'
  });
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const body = await request.json().catch(() => null) as BundleRequest | null;
  try {
    const mint = assertPubkey(body?.mint, 'mint');
    const legs = body?.legs ?? [];
    if (!Array.isArray(legs) || !legs.length) throw new Error('Bundle requires at least one leg.');
    if (legs.length > MAX_WALLETS) throw new Error(`Bundle exceeds BUNDLE_MAX_WALLETS (${MAX_WALLETS}).`);
    const normalized = legs.map((leg, index) => ({
      index,
      wallet: assertPubkey(leg.wallet, `legs[${index}].wallet`),
      side: String(leg.side ?? 'Buy').toLowerCase() === 'sell' ? 'Sell' as const : 'Buy' as const,
      amount: String(leg.amount),
      spendAsset: leg.spendAsset === 'USDC' ? 'USDC' as const : 'SOL' as const,
      slippageBps: leg.slippageBps ?? 100
    }));
    const totals = summarize(normalized);
    if (totals.totalSol > MAX_TOTAL_SOL) throw new Error(`Bundle exceeds BUNDLE_MAX_TOTAL_SOL (${MAX_TOTAL_SOL}).`);
    if (totals.totalUsdc > MAX_TOTAL_USDC) throw new Error(`Bundle exceeds BUNDLE_MAX_TOTAL_USDC (${MAX_TOTAL_USDC}).`);

    if (body?.mode === 'preflight' || !liveTradingEnabled()) {
      const relay = getJitoRelayReadiness();
      const relayPreview = buildJitoBundlePreview({
        expectedMint: mint,
        expectedSigners: normalized.map((leg) => leg.wallet),
        tipLamports: relay.tip.minLamports
      }, getLiveActivationStatus(), relay);
      return Response.json({
        status: liveTradingEnabled() ? 'ok' : 'blocked',
        observedAt: new Date().toISOString(),
        mint,
        legs: normalized,
        totals,
        reason: liveTradingEnabled() ? null : 'liveTradingEnabled() is false. Bundle was validated but unsigned transactions were not built.',
        stages: { preflight: 'complete', unsignedTransactionBuild: liveTradingEnabled() ? 'ready' : 'blocked-by-live-gate', browserWalletSigning: 'required-per-leg', signedBundleReview: 'required-before-relay', broadcast: 'explicit-only', relaySubmission: 'blocked-by-relay-or-broadcast-gate' },
        buildReadiness: liveTradingEnabled() ? 'ready-to-build-unsigned-transactions' : 'blocked-by-live-gate',
        routeDependency: '/api/bundle-sequencer -> /api/execution-swap -> browser wallet -> /api/send-signed-transaction',
        relaySubmission: false,
        relayStatus: relay.status,
        relayProvider: relay.provider,
        relay,
        relayPreview,
        relayRequirements: ['Jito/block-engine endpoint configured', 'tip account selection', 'Jito tip cap', 'bundle simulation', 'operator auth', 'durable intent/order tracking', 'explicit broadcast approval'],
        supportedRelays: ['jito-block-engine-json-rpc'],
        requiredEnv: relay.requiredEnv,
        simulationRequired: true,
        bundleId: null,
        note: 'Validated multi-wallet intent only; no relay bundle was submitted.',
        execution: liveTradingEnabled() ? 'bundle-preflight-ok' : 'live-disabled-preflight-only'
      }, { status: liveTradingEnabled() ? 200 : 403 });
    }

    const built = [];
    for (const leg of normalized) {
      const forwardedHeaders: Record<string, string> = { 'content-type': 'application/json' };
      const cookie = request.headers.get('cookie');
      const authorization = request.headers.get('authorization');
      const operatorToken = request.headers.get('x-meridian-operator-token');
      if (cookie) forwardedHeaders.cookie = cookie;
      if (authorization) forwardedHeaders.authorization = authorization;
      if (operatorToken) forwardedHeaders['x-meridian-operator-token'] = operatorToken;
      const response = await fetch(`${origin}/api/execution-swap`, {
        method: 'POST',
        headers: forwardedHeaders,
        cache: 'no-store',
        body: JSON.stringify({
          mint,
          side: leg.side,
          amount: leg.amount,
          spendAsset: leg.spendAsset,
          slippageBps: leg.slippageBps,
          userPublicKey: leg.wallet
        })
      });
      const payload = await response.json();
      if (!response.ok) return Response.json({ error: `Leg ${leg.index} failed: ${payload.error ?? response.statusText}`, failedLeg: leg, priorLegs: built }, { status: 502 });
      built.push({ index: leg.index, wallet: leg.wallet, side: leg.side, amount: leg.amount, spendAsset: leg.spendAsset, swap: payload.swap, quote: payload.quote, request: payload.request });
    }

    const relay = getJitoRelayReadiness();
    const relayPreview = buildJitoBundlePreview({
      expectedMint: mint,
      expectedSigners: normalized.map((leg) => leg.wallet),
      tipLamports: relay.tip.minLamports
    }, getLiveActivationStatus(), relay);

    return Response.json({
      status: 'ok',
      observedAt: new Date().toISOString(),
      mint,
      flowType: 'multi-wallet-preflight-build',
      stages: { preflight: 'complete', unsignedTransactionBuild: 'complete', browserWalletSigning: 'required-per-leg', signedBundleReview: 'required-before-relay', broadcast: 'explicit-only-via-/api/send-signed-transaction', relaySubmission: 'blocked-by-relay-or-broadcast-gate' },
      relaySubmission: false,
      relayStatus: relay.status,
      relayProvider: relay.provider,
      relay,
      relayPreview,
      relayRequirements: ['Jito/block-engine endpoint configured', 'tip account selection', 'Jito tip cap', 'bundle simulation', 'operator auth', 'durable intent/order tracking', 'explicit broadcast approval'],
      supportedRelays: ['jito-block-engine-json-rpc'],
      requiredEnv: relay.requiredEnv,
      simulationRequired: true,
      bundleId: null,
      signedBundlePayloadShape: {
        signedTransactions: 'base64[]',
        expectedSigners: normalized.map((leg) => leg.wallet),
        expectedMint: mint,
        maxTipLamports: relay.tip.maxLamports,
        previewEndpoint: '/api/relay/jito/bundle-preview',
        submitEndpointFuture: '/api/relay/jito/send-bundle'
      },
      signer: 'browser-wallet-per-leg',
      legs: built,
      totals,
      broadcastRoute: '/api/send-signed-transaction',
      execution: 'unsigned-bundle-transactions-built'
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Bundle sequencer failed.' }, { status: 400 });
  }
}
