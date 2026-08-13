import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { buildTransactionPreview } from '../../../lib/transaction-preview';

export const dynamic = 'force-dynamic';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER_QUOTE_URL = process.env.JUPITER_QUOTE_URL ?? 'https://lite-api.jup.ag/swap/v1/quote';
const QUOTE_TIMEOUT_MS = 7_000;
const MAX_SLIPPAGE_BPS = Number(process.env.LIVE_MAX_SLIPPAGE_BPS ?? '500');

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type QuoteRequest = {
  mint?: string;
  side?: 'Buy' | 'Sell' | 'buy' | 'sell';
  amount?: string;
  spendAsset?: 'SOL' | 'USDC' | string;
  slippageBps?: number | string | null;
  mode?: string;
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

function parsePositiveAmount(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  if (raw.trim().endsWith('%')) return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseSlippageBps(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '' || raw === 'Auto') return { ok: true, value: 100 };
  const value = typeof raw === 'number' ? raw : Number(String(raw).replace(/bps/i, '').trim());
  if (!Number.isFinite(value)) return { ok: true, value: 100 };
  const rounded = Math.round(value);
  if (rounded < 1) return { ok: false, error: 'Slippage must be at least 1 bps.' };
  if (rounded > MAX_SLIPPAGE_BPS) return { ok: false, error: `Requested slippage ${rounded} bps exceeds LIVE_MAX_SLIPPAGE_BPS (${MAX_SLIPPAGE_BPS}).` };
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

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY;
    return await fetch(url, { signal: controller.signal, headers, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  let body: QuoteRequest;
  try {
    body = await request.json() as QuoteRequest;
  } catch {
    return Response.json({
      status: 'error',
      observedAt: new Date().toISOString(),
      error: 'Invalid JSON body.',
      execution: 'quote-only',
      transactionPreview: buildTransactionPreview({
        status: 'error',
        mode: 'preview-only',
        action: 'swap',
        provider: 'Jupiter',
        route: '/api/execution-quote',
        blockers: ['Invalid JSON body.', 'Unsigned transaction not built yet.', 'Signing and broadcast remain disabled.'],
        warnings: ['Quote preview only.']
      })
    }, { status: 400 });
  }

  const mint = body.mint?.trim();
  if (!mint || !MINT_RE.test(mint)) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Missing or invalid token mint.', execution: 'quote-only' }, { status: 400 });

  const side = String(body.side ?? 'Buy').toLowerCase() === 'sell' ? 'sell' : 'buy';
  const amount = parsePositiveAmount(body.amount);
  if (!amount) {
    return Response.json({
      status: 'error',
      observedAt: new Date().toISOString(),
      error: 'Enter a numeric amount for quote preview. Percent sells need wallet token-balance hydration before live use.',
      execution: 'quote-only'
    }, { status: 400 });
  }

  const spendAsset = body.spendAsset === 'USDC' ? 'USDC' : 'SOL';
  const quoteMint = spendAsset === 'USDC' ? USDC_MINT : SOL_MINT;
  const inputMint = side === 'buy' ? quoteMint : mint;
  const outputMint = side === 'buy' ? mint : quoteMint;
  if (inputMint === outputMint) {
    return Response.json({
      status: 'error',
      observedAt: new Date().toISOString(),
      error: spendAsset === 'SOL'
        ? 'Quote route is SOL → SOL. Pick USDC mint or another token mint, or change settlement asset.'
        : 'Quote input and output mint are identical. Pick a different token mint or settlement asset.',
      execution: 'quote-rejected',
      blocker: 'same-input-output-mint',
      transactionPreview: buildTransactionPreview({
        status: 'blocked',
        mode: 'preview-only',
        action: 'swap',
        tokenMint: mint,
        provider: 'Jupiter',
        route: '/api/execution-quote',
        blockers: ['Input mint and output mint are identical.', 'Jupiter cannot quote a same-mint no-op route.'],
        warnings: ['Use USDC mint for the default SOL → USDC micro-buy QA route.']
      })
    }, { status: 400 });
  }
  const slippage = parseSlippageBps(body.slippageBps);
  if (!slippage.ok) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: slippage.error, execution: 'quote-rejected', blocker: 'slippage-out-of-bounds' }, { status: 400 });
  const slippageBps = slippage.value;

  try {
    const decimals = await fetchMintDecimals(inputMint);
    const rawAmount = decimalToRawUnits(amount, decimals);
    const url = new URL(JUPITER_QUOTE_URL);
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', rawAmount);
    url.searchParams.set('slippageBps', String(slippageBps));

    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) {
      return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: `Jupiter quote failed: ${response.status} ${response.statusText}`, execution: 'quote-only' }, { status: 502 });
    }

    const quote = await response.json() as JupiterQuote;
    return Response.json({
      status: 'ok',
      observedAt: new Date().toISOString(),
      execution: 'quote-only',
      liveTradingEnabled: false,
      safety: 'No transaction was built, signed, sent, or gated. This endpoint only returns a Jupiter route preview.',
      transactionPreview: buildTransactionPreview({
        status: 'ok',
        mode: 'preview-only',
        action: 'swap',
        tokenMint: mint,
        provider: 'Jupiter',
        route: '/api/execution-quote',
        inputAmount: String(amount),
        outputEstimate: quote.outAmount ?? undefined,
        slippageBps,
        simulationStatus: 'not-run',
        blockers: ['Unsigned transaction not built yet.', 'Signing and broadcast remain disabled.'],
        warnings: ['Quote preview only.']
      }),
      request: { mint, side, amount, spendAsset, slippageBps, inputMint, outputMint, rawAmount },
      quote: {
        inAmount: quote.inAmount ?? rawAmount,
        outAmount: quote.outAmount ?? null,
        otherAmountThreshold: quote.otherAmountThreshold ?? null,
        priceImpactPct: quote.priceImpactPct ?? null,
        routeLabels: quote.routePlan?.map((route) => route.swapInfo?.label).filter(Boolean) ?? [],
        routePlanLength: quote.routePlan?.length ?? 0,
        contextSlot: quote.contextSlot ?? null,
        timeTaken: quote.timeTaken ?? null
      }
    });
  } catch (error) {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Quote preview failed.', execution: 'quote-only' }, { status: 500 });
  }
}
