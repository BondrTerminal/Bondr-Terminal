import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { createIntentAsync, hashJson, updateIntentAsync } from '../../../lib/live-store';
import { DEFAULT_ALLOWED_SWAP_PROGRAMS, decodeTransactionPolicy } from '../../../lib/transaction-policy';
import { meridianAuthRequiredResponse } from '../../../lib/meridian-auth';
import { buildTransactionPreview, liveDisabledPreview } from '../../../lib/transaction-preview';
import { getLiveActivationStatus, type LiveActivationStatus } from '../../../lib/live-activation';

export const dynamic = 'force-dynamic';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER_QUOTE_URL = process.env.JUPITER_QUOTE_URL ?? 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_URL = process.env.JUPITER_SWAP_URL ?? 'https://lite-api.jup.ag/swap/v1/swap';
const TIMEOUT_MS = 10_000;
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type SwapRequest = {
  mint?: string;
  side?: 'Buy' | 'Sell' | 'buy' | 'sell';
  amount?: string;
  spendAsset?: 'SOL' | 'USDC' | string;
  slippageBps?: number | string | null;
  userPublicKey?: string;
};

type JupiterQuote = {
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  otherAmountThreshold?: string;
  swapMode?: string;
  slippageBps?: number;
  priceImpactPct?: string;
  routePlan?: Array<{ swapInfo?: { label?: string; ammKey?: string; inputMint?: string; outputMint?: string; feeAmount?: string; feeMint?: string } }>;
  contextSlot?: number;
  timeTaken?: number;
};

type JupiterSwapResponse = {
  swapTransaction?: string;
  lastValidBlockHeight?: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
  simulationError?: unknown;
};

function parsePositiveAmount(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  if (raw.trim().endsWith('%')) return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseSlippageBps(raw: unknown, maxSlippageBps: number): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '' || raw === 'Auto') return { ok: true, value: 100 };
  const value = typeof raw === 'number' ? raw : Number(String(raw).replace(/bps/i, '').trim());
  if (!Number.isFinite(value)) return { ok: true, value: 100 };
  const rounded = Math.round(value);
  if (rounded < 1) return { ok: false, error: 'Slippage must be at least 1 bps.' };
  if (rounded > maxSlippageBps) return { ok: false, error: `Requested slippage ${rounded} bps exceeds LIVE_MAX_SLIPPAGE_BPS (${maxSlippageBps}).` };
  return { ok: true, value: rounded };
}

function decimalToRawUnits(amount: number, decimals: number): string {
  const fixed = amount.toFixed(decimals);
  const [whole, fraction = ''] = fixed.split('.');
  const padded = fraction.padEnd(decimals, '0').slice(0, decimals);
  const raw = `${whole}${padded}`.replace(/^0+(?=\d)/, '');
  return raw || '0';
}

async function fetchMintDecimals(mint: string): Promise<number> {
  if (mint === SOL_MINT) return 9;
  if (mint === USDC_MINT) return 6;

  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  const info = await connection.getParsedAccountInfo(new PublicKey(mint), 'confirmed');
  const parsed = info.value?.data;
  if (!parsed || typeof parsed === 'string' || !('parsed' in parsed)) throw new Error('Unable to read mint decimals from RPC.');
  const decimals = parsed.parsed?.info?.decimals;
  if (typeof decimals !== 'number') throw new Error('Mint account did not expose decimals.');
  return decimals;
}

async function fetchJsonWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { accept: 'application/json', ...(init?.headers as Record<string, string> | undefined) };
    if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY;
    return await fetch(url, { ...init, signal: controller.signal, headers, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }
}

function rejectIfLiveDisabled(liveActivation: LiveActivationStatus) {
  if (liveActivation.signingEnabled) return null;
  return Response.json({
    status: 'blocked-by-live-gate',
    observedAt: new Date().toISOString(),
    error: 'Live swap build is disabled. Set live/signing gates only after approving signer custody, preflight, wallet funding, max-size, slippage, drawdown, daily-loss, and kill-switch rules.',
    execution: 'live-disabled',
    liveTradingEnabled: liveActivation.liveTradingEnabled,
    signingEnabled: liveActivation.signingEnabled,
    broadcastEnabled: liveActivation.broadcastEnabled,
    deploymentEnabled: liveActivation.deploymentEnabled,
    liveActivation,
    signer: 'browser-wallet-required',
    serverSigning: false,
    transactionPreview: liveDisabledPreview('swap', '/api/execution-swap')
  }, { status: 403 });
}

export async function POST(request: Request) {
  const liveActivation = getLiveActivationStatus();
  const disabled = rejectIfLiveDisabled(liveActivation);
  if (disabled) return disabled;
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;

  let body: SwapRequest;
  try {
    body = await request.json() as SwapRequest;
  } catch {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Invalid JSON body.', execution: 'swap-build-rejected' }, { status: 400 });
  }

  const mint = body.mint?.trim();
  const userPublicKey = body.userPublicKey?.trim();
  if (!mint || !MINT_RE.test(mint)) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Missing or invalid token mint.', execution: 'swap-build-rejected' }, { status: 400 });
  if (!userPublicKey || !MINT_RE.test(userPublicKey)) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Missing or invalid wallet public key.', execution: 'swap-build-rejected' }, { status: 400 });

  try {
    new PublicKey(userPublicKey);
    new PublicKey(mint);
  } catch {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Invalid Solana public key.', execution: 'swap-build-rejected' }, { status: 400 });
  }

  const side = String(body.side ?? 'Buy').toLowerCase() === 'sell' ? 'sell' : 'buy';
  const amount = parsePositiveAmount(body.amount);
  if (!amount) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Live swap requires a numeric amount. Percent sells are not enabled yet.', execution: 'swap-build-rejected' }, { status: 400 });

  const spendAsset = body.spendAsset === 'USDC' ? 'USDC' : 'SOL';
  if (side === 'buy' && spendAsset === 'SOL' && amount > liveActivation.limits.maxSolPerSwap) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: `Amount exceeds LIVE_MAX_SOL_PER_SWAP (${liveActivation.limits.maxSolPerSwap} SOL).`, execution: 'swap-build-rejected', liveActivation }, { status: 400 });
  if (side === 'buy' && spendAsset === 'USDC' && amount > liveActivation.limits.maxUsdcPerSwap) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: `Amount exceeds LIVE_MAX_USDC_PER_SWAP (${liveActivation.limits.maxUsdcPerSwap} USDC).`, execution: 'swap-build-rejected', liveActivation }, { status: 400 });

  const quoteMint = spendAsset === 'USDC' ? USDC_MINT : SOL_MINT;
  const inputMint = side === 'buy' ? quoteMint : mint;
  const outputMint = side === 'buy' ? mint : quoteMint;
  const slippage = parseSlippageBps(body.slippageBps, liveActivation.limits.maxSlippageBps);
  if (!slippage.ok) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: slippage.error, execution: 'swap-build-rejected', blocker: 'slippage-out-of-bounds' }, { status: 400 });
  const slippageBps = slippage.value;

  try {
    const decimals = await fetchMintDecimals(inputMint);
    const rawAmount = decimalToRawUnits(amount, decimals);
    const quoteUrl = new URL(JUPITER_QUOTE_URL);
    quoteUrl.searchParams.set('inputMint', inputMint);
    quoteUrl.searchParams.set('outputMint', outputMint);
    quoteUrl.searchParams.set('amount', rawAmount);
    quoteUrl.searchParams.set('slippageBps', String(slippageBps));

    const quoteResponse = await fetchJsonWithTimeout(quoteUrl.toString());
    if (!quoteResponse.ok) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: `Jupiter quote failed: ${quoteResponse.status} ${quoteResponse.statusText}`, execution: 'swap-build-failed' }, { status: 502 });
    const quote = await quoteResponse.json() as JupiterQuote;

    const swapResponse = await fetchJsonWithTimeout(JUPITER_SWAP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto'
      })
    });

    if (!swapResponse.ok) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: `Jupiter swap build failed: ${swapResponse.status} ${swapResponse.statusText}`, execution: 'swap-build-failed' }, { status: 502 });
    const swap = await swapResponse.json() as JupiterSwapResponse;
    if (!swap.swapTransaction) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Jupiter did not return a swap transaction.', simulationError: swap.simulationError ?? null, execution: 'swap-build-failed' }, { status: 502 });

    const decoded = decodeTransactionPolicy(Buffer.from(swap.swapTransaction, 'base64'));
    const requiredAccounts = Array.from(new Set([userPublicKey, mint, inputMint, outputMint].filter(Boolean)));
    const intent = await createIntentAsync({
      expectedSigner: userPublicKey,
      expectedMint: mint,
      expectedSide: side,
      expectedAmount: String(amount),
      slippageBps,
      allowedPrograms: DEFAULT_ALLOWED_SWAP_PROGRAMS,
      requiredAccounts,
      sourceRoute: '/api/execution-swap',
      orderId: null,
      bundleId: null,
      quoteHash: hashJson(quote),
      routeHash: hashJson(quote.routePlan ?? []),
      transactionMessageHash: decoded.messageHash,
      note: 'Unsigned swap transaction built; browser wallet signing and explicit broadcast required.',
      status: 'transaction_built'
    });
    await updateIntentAsync(intent.id, { status: 'transaction_built' });

    return Response.json({
      status: 'ok',
      observedAt: new Date().toISOString(),
      execution: 'unsigned-transaction-built',
      liveTradingEnabled: true,
      signingEnabled: process.env.LIVE_BETA_SIGNING_ENABLED === 'true',
      broadcastEnabled: process.env.LIVE_BETA_BROADCAST_ENABLED === 'true',
      deploymentEnabled: process.env.LIVE_DEPLOYMENT_ENABLED === 'true',
      signer: 'browser-wallet-required',
      safety: 'Unsigned Jupiter swap transaction only. The server did not sign or send it.',
      serverSigning: false,
      broadcast: 'not-performed',
      intentId: intent.id,
      expectedSigner: userPublicKey,
      expectedMint: mint,
      allowedPrograms: intent.allowedPrograms,
      requiredAccounts: intent.requiredAccounts,
      transactionMessageHash: intent.transactionMessageHash,
      handoffEvidence: {
        phase: 'unsigned-build',
        nextRequiredPhase: 'simulation',
        nextRoute: '/api/terminal/signer-dry-run',
        intentId: intent.id,
        expectedSigner: userPublicKey,
        expectedMint: mint,
        expectedSide: side,
        expectedAmount: String(amount),
        slippageBps,
        inputMint,
        outputMint,
        rawAmount,
        allowedPrograms: intent.allowedPrograms,
        requiredAccounts: intent.requiredAccounts,
        quoteHash: intent.quoteHash,
        routeHash: intent.routeHash,
        transactionMessageHash: intent.transactionMessageHash,
        simulationRequired: true
      },
      request: { mint, side, amount, spendAsset, slippageBps, inputMint, outputMint, rawAmount, userPublicKey },
      quote: {
        inAmount: quote.inAmount ?? rawAmount,
        outAmount: quote.outAmount ?? null,
        priceImpactPct: quote.priceImpactPct ?? null,
        routeLabels: quote.routePlan?.map((route) => route.swapInfo?.label).filter(Boolean) ?? [],
        routePlanLength: quote.routePlan?.length ?? 0,
        contextSlot: quote.contextSlot ?? null
      },
      transactionPreview: buildTransactionPreview({
        status: 'ok',
        mode: 'unsigned-build',
        action: 'swap',
        tokenMint: mint,
        wallet: userPublicKey,
        provider: 'Jupiter',
        route: '/api/execution-swap',
        inputAmount: String(amount),
        outputEstimate: quote.outAmount ?? undefined,
        slippageBps,
        priorityFeeLamports: swap.prioritizationFeeLamports ?? undefined,
        simulationStatus: swap.simulationError ? 'failed' : 'ready',
        unsignedTransaction: swap.swapTransaction,
        blockers: ['Browser wallet signature still required.', 'Broadcast remains disabled until explicit live activation and policy pass.'],
        warnings: ['Unsigned transaction preview only. The server did not sign or send this transaction.']
      }),
      swap: {
        swapTransaction: swap.swapTransaction,
        lastValidBlockHeight: swap.lastValidBlockHeight ?? null,
        prioritizationFeeLamports: swap.prioritizationFeeLamports ?? null,
        computeUnitLimit: swap.computeUnitLimit ?? null,
        simulationError: swap.simulationError ?? null
      }
    });
  } catch (error) {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Swap transaction build failed.', execution: 'swap-build-failed', serverSigning: false }, { status: 500 });
  }
}
