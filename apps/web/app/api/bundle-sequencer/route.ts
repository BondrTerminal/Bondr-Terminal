import { PublicKey } from '@solana/web3.js';
import { buildJitoBundlePreview } from '../../../lib/jito-relay-adapter';
import { buildJitoPackedTransaction, type JitoPackedInstructionInput, type JitoPackedLookupTableInput } from '../../../lib/jito-packed-transaction-builder';
import { getJitoRelayReadiness } from '../../../lib/jito-relay-readiness';
import { buildJitoRouteInstructionSource, type JitoPreparedRouteTransactionInput } from '../../../lib/jito-route-instruction-source';
import { getLiveActivationStatus } from '../../../lib/live-activation';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function liveTradingEnabled() {
  return process.env.LIVE_TRADING_ENABLED === 'true';
}
const MAX_WALLETS = Number(process.env.BUNDLE_MAX_WALLETS ?? '8');
const MAX_TOTAL_SOL = Number(process.env.BUNDLE_MAX_TOTAL_SOL ?? '0.25');
const MAX_TOTAL_USDC = Number(process.env.BUNDLE_MAX_TOTAL_USDC ?? '50');
const PACKED_WALLETS_ENV = Number(process.env.JITO_MAX_WALLETS_PER_PACKED_TRANSACTION);
const MAX_PACKED_WALLETS_PER_TX = Math.max(1, Math.min(Number.isFinite(PACKED_WALLETS_ENV) ? PACKED_WALLETS_ENV : 4, 6));

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
  mode?: 'build' | 'preflight' | 'build-packed';
  payer?: string;
  recentBlockhash?: string;
  packedInstructions?: JitoPackedInstructionInput[];
  preparedTransactions?: JitoPreparedRouteTransactionInput[];
  lookupTables?: JitoPackedLookupTableInput[] | null;
  requiredAccounts?: string[] | null;
  allowedPrograms?: string[] | null;
  computeUnitLimit?: number | null;
  computeUnitPriceMicroLamports?: number | null;
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
    executionModel: {
      contract: 'bondr-jito-packed-execution-plan-v1',
      maxTransactionsPerJitoBundle: relay.limits.maxTransactionsPerBundle,
      maxPackedWalletsPerTransaction: MAX_PACKED_WALLETS_PER_TX,
      overflowMode: 'near-synchronous-jito-waves',
          atomicity: {
            withinJitoBundle: true,
            acrossWaves: false
          },
          addressLookupTableProofRequiredForPackedTransactions: true,
          packedTransactionBuildEndpoint: '/api/relay/jito/packed-transaction-build',
          simulationProofRequiredPerPackedTransaction: true,
          packedTransactionProofEndpoint: '/api/relay/jito/packed-transaction-proof'
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
    const routeInstructionSource = Array.isArray(body?.preparedTransactions) && body.preparedTransactions.length
      ? buildJitoRouteInstructionSource({ preparedTransactions: body.preparedTransactions })
      : null;
    const packedInstructions = Array.isArray(body?.packedInstructions) && body.packedInstructions.length
      ? body.packedInstructions
      : routeInstructionSource?.instructions ?? [];
    const shouldBuildPackedTransaction = body?.mode === 'build-packed' || packedInstructions.length > 0 || Boolean(routeInstructionSource);
    if (shouldBuildPackedTransaction) {
      const relay = getJitoRelayReadiness();
      if (routeInstructionSource?.status === 'blocked') {
        return Response.json({
          status: 'blocked',
          observedAt: new Date().toISOString(),
          mint,
          legs: normalized,
          totals,
          flowType: 'multi-wallet-route-instruction-source',
          routeInstructionSource,
          relaySubmission: false,
          execution: 'route-instruction-source-blocked-no-signing-no-relay-submit'
        }, { status: 400 });
      }
      const packedBuild = buildJitoPackedTransaction({
        payer: body?.payer ?? normalized[0]?.wallet ?? '',
        recentBlockhash: body?.recentBlockhash ?? '',
        instructions: packedInstructions,
        lookupTables: body?.lookupTables,
        expectedMint: mint,
        requiredAccounts: body?.requiredAccounts,
        allowedPrograms: body?.allowedPrograms,
        computeUnitLimit: body?.computeUnitLimit,
        computeUnitPriceMicroLamports: body?.computeUnitPriceMicroLamports,
        maxWalletsPerPackedTransaction: MAX_PACKED_WALLETS_PER_TX
      });
      const relayPreview = buildJitoBundlePreview({
        expectedMint: mint,
        expectedSigners: packedBuild.expectedSigners.length ? packedBuild.expectedSigners : normalized.map((leg) => leg.wallet),
        tipLamports: relay.tip.minLamports
      }, getLiveActivationStatus(), relay);
      return Response.json({
        status: packedBuild.status === 'built' ? 'ok' : 'blocked',
        observedAt: new Date().toISOString(),
        mint,
        legs: normalized,
        totals,
        flowType: 'multi-wallet-packed-transaction-build',
        stages: { preflight: 'complete', packedTransactionBuild: packedBuild.status, browserWalletSigning: 'required-per-packed-transaction', packedTransactionProof: 'required-after-simulation', waveDispatchPlan: 'required-before-relay', relaySubmission: 'blocked-by-relay-or-broadcast-gate' },
        routeInstructionSource,
        packedBuild,
        relaySubmission: false,
        relayStatus: relay.status,
        relayProvider: relay.provider,
        relay,
        relayPreview,
        executionModel: {
          contract: 'bondr-jito-packed-execution-plan-v1',
          maxTransactionsPerJitoBundle: relay.limits.maxTransactionsPerBundle,
          maxPackedWalletsPerTransaction: MAX_PACKED_WALLETS_PER_TX,
          estimatedPackedTransactions: packedBuild.status === 'built' ? 1 : Math.ceil(normalized.length / MAX_PACKED_WALLETS_PER_TX),
          estimatedWaves: 1,
          overflowMode: 'near-synchronous-jito-waves',
          atomicity: {
            withinJitoBundle: true,
            acrossWaves: false
          },
          addressLookupTableProofRequiredForPackedTransactions: packedBuild.addressLookupTables.required,
          packedTransactionBuildEndpoint: '/api/relay/jito/packed-transaction-build',
          packedTransactionProofEndpoint: '/api/relay/jito/packed-transaction-proof',
          signingSessionEndpoint: '/api/relay/jito/multi-wallet-signing-session',
          waveDispatchPlanEndpoint: '/api/relay/jito/wave-dispatch-plan',
          chainEffectProofEndpoint: '/api/relay/jito/chain-effect-proof'
        },
        simulationRequired: true,
        note: 'Packed transaction built from prepared instruction legs only; no signing, broadcast, or Jito relay submit occurred.',
        execution: 'packed-transaction-build-only-no-signing-no-relay-submit'
      }, { status: packedBuild.status === 'built' ? 200 : 400 });
    }

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
        executionModel: {
          contract: 'bondr-jito-packed-execution-plan-v1',
          maxTransactionsPerJitoBundle: relay.limits.maxTransactionsPerBundle,
          maxPackedWalletsPerTransaction: MAX_PACKED_WALLETS_PER_TX,
          estimatedPackedTransactions: Math.ceil(normalized.length / MAX_PACKED_WALLETS_PER_TX),
          estimatedWaves: Math.ceil(Math.ceil(normalized.length / MAX_PACKED_WALLETS_PER_TX) / relay.limits.maxTransactionsPerBundle),
          overflowMode: 'near-synchronous-jito-waves',
          atomicity: {
            withinJitoBundle: true,
            acrossWaves: false
          },
          addressLookupTableProofRequiredForPackedTransactions: normalized.length > 1,
          packedTransactionBuildEndpoint: '/api/relay/jito/packed-transaction-build',
          simulationProofRequiredPerPackedTransaction: true,
          packedTransactionProofEndpoint: '/api/relay/jito/packed-transaction-proof'
        },
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
      executionModel: {
        contract: 'bondr-jito-packed-execution-plan-v1',
        maxTransactionsPerJitoBundle: relay.limits.maxTransactionsPerBundle,
        maxPackedWalletsPerTransaction: MAX_PACKED_WALLETS_PER_TX,
        estimatedPackedTransactions: Math.ceil(normalized.length / MAX_PACKED_WALLETS_PER_TX),
        estimatedWaves: Math.ceil(Math.ceil(normalized.length / MAX_PACKED_WALLETS_PER_TX) / relay.limits.maxTransactionsPerBundle),
        overflowMode: 'near-synchronous-jito-waves',
        atomicity: {
          withinJitoBundle: true,
          acrossWaves: false
        },
        addressLookupTableProofRequiredForPackedTransactions: normalized.length > 1,
        packedTransactionBuildEndpoint: '/api/relay/jito/packed-transaction-build',
        simulationProofRequiredPerPackedTransaction: true,
        packedTransactionProofEndpoint: '/api/relay/jito/packed-transaction-proof'
      },
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
