import { PublicKey } from '@solana/web3.js';
import { mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../lib/mutation-safety';
import { appendOrderLifecycle, createTerminalOrder, listTerminalOrders, updateTerminalOrder, type TerminalOrder, type TerminalOrderKind, type TerminalOrderSide, type TerminalOrderStatus } from '../../../lib/terminal-order-store';
import { meridianAuthRequiredResponse } from '../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_OPEN_ORDERS = Number(process.env.TERMINAL_MAX_OPEN_ORDERS ?? '100');
const MAX_SLIPPAGE_BPS = Number(process.env.LIVE_MAX_SLIPPAGE_BPS ?? '500');

type OrderRequest = {
  action?: 'create' | 'list' | 'evaluate' | 'cancel' | 'replace';
  id?: string;
  mint?: string;
  wallet?: string;
  side?: TerminalOrderSide | 'Buy' | 'Sell';
  kind?: TerminalOrderKind;
  amount?: string;
  spendAsset?: 'SOL' | 'USDC';
  slippageBps?: number;
  triggerPriceUsd?: number | null;
  expiresAt?: string | null;
  clientTag?: string | null;
  replacement?: Partial<OrderRequest>;
};

function assertPubkey(value: unknown, label: string) {
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) throw new Error(`Missing or invalid ${label}.`);
  new PublicKey(value);
  return value;
}
function parseSide(side: unknown): TerminalOrderSide {
  return String(side ?? 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy';
}
function parseKind(kind: unknown): TerminalOrderKind {
  const value = String(kind ?? 'market');
  if (['market', 'limit', 'take-profit', 'stop-loss'].includes(value)) return value as TerminalOrderKind;
  throw new Error('Unsupported order kind.');
}
function parseAmount(value: unknown) {
  const text = String(value ?? '').trim();
  const numeric = text.endsWith('%') ? Number(text.slice(0, -1)) : Number(text);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Order amount must be positive.');
  return text;
}
function parseSlippage(value: unknown) {
  const n = Number(value ?? 100);
  if (!Number.isFinite(n)) return 100;
  const rounded = Math.round(n);
  if (rounded <= 0) throw new Error('Order slippage must be at least 1 bps.');
  if (rounded > MAX_SLIPPAGE_BPS) throw new Error(`Order slippage ${rounded} bps exceeds LIVE_MAX_SLIPPAGE_BPS (${MAX_SLIPPAGE_BPS}).`);
  return rounded;
}
function triggerDirection(kind: TerminalOrderKind, side: TerminalOrderSide): 'above' | 'below' | null {
  if (kind === 'market') return null;
  if (kind === 'limit') return side === 'buy' ? 'below' : 'above';
  if (kind === 'take-profit') return 'above';
  if (kind === 'stop-loss') return 'below';
  return null;
}
async function tokenPrice(origin: string, mint: string): Promise<number | null> {
  const response = await fetch(`${origin}/api/token-pool-index?mint=${encodeURIComponent(mint)}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const payload = await response.json() as { summary?: { priceUsd?: string | null } };
  const value = Number(payload.summary?.priceUsd ?? NaN);
  return Number.isFinite(value) ? value : null;
}
function shouldTrigger(order: TerminalOrder, priceUsd: number | null) {
  if (order.kind === 'market') return true;
  if (priceUsd == null || order.triggerPriceUsd == null || order.triggerDirection == null) return false;
  if (order.triggerDirection === 'above') return priceUsd >= order.triggerPriceUsd;
  return priceUsd <= order.triggerPriceUsd;
}
function activeOrders(filter?: { mint?: string | null; wallet?: string | null }) {
  return listTerminalOrders({ ...filter, status: 'open' });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint');
  const wallet = searchParams.get('wallet');
  const status = searchParams.get('status') as TerminalOrderStatus | 'all' | null;
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    orders: listTerminalOrders({ mint, wallet, status: status ?? 'open' }),
    engine: {
      market: 'persistent-order-route-ready',
      limit: 'persistent-trigger-route-ready',
      takeProfit: 'persistent-trigger-route-ready',
      stopLoss: 'persistent-trigger-route-ready',
      cancelReplace: 'persistent-order-route-ready'
    },
    lifecycle: 'created → evaluated → triggered → transaction_built → signed_client_side → broadcast → confirmed/failed',
    executionModel: { preflight: 'available', unsignedTransactionBuild: '/api/execution-swap', browserWalletSigning: 'required', broadcast: 'explicit-only-via-/api/send-signed-transaction', autoBroadcast: false },
    nextAction: 'Triggered orders require explicit operator build/sign/broadcast; this route never auto-broadcasts.',
    routes: { build: '/api/execution-swap', broadcast: '/api/send-signed-transaction', evaluate: '/api/routers/order/evaluate' },
    mutation: mutationMeta('Order engine uses local JSON persistence in development.'),
    execution: 'order-engine-live-store'
  });
}

export async function POST(request: Request) {
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;
  const { origin } = new URL(request.url);
  const requestOrigin = sameOriginAllowed(request);
  if (!requestOrigin.allowed) return mutationBlockedResponse(requestOrigin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Order mutations are disabled by MUTATIONS_DISABLED=true.');
  const body = await request.json().catch(() => null) as OrderRequest | null;
  const action = body?.action ?? 'create';

  try {
    if (action === 'list') return GET(request);

    if (action === 'cancel') {
      if (!body?.id) throw new Error('Missing order id.');
      const current = listTerminalOrders({ status: 'all' }).find((item) => item.id === body.id);
      const order = current ? updateTerminalOrder(body.id, { status: 'cancelled', ...appendOrderLifecycle(current, { stage: 'failed', note: 'Order cancelled by operator.' }) }) : null;
      if (!order) return Response.json({ status: 'error', error: 'Order not found.', ...mutationMeta('Order mutation failed.' ) }, { status: 404 });
      return Response.json({ status: 'ok', order, ...mutationMeta('Order cancelled in local order store.'), execution: 'order-cancelled' });
    }

    if (action === 'replace') {
      if (!body?.id) throw new Error('Missing order id.');
      const currentOrder = listTerminalOrders({ status: 'all' }).find((item) => item.id === body.id);
      const old = currentOrder ? updateTerminalOrder(body.id, { status: 'replaced', ...appendOrderLifecycle(currentOrder, { stage: 'failed', note: 'Order replaced by operator.' }) }) : null;
      if (!old) return Response.json({ status: 'error', error: 'Order not found.', ...mutationMeta('Order mutation failed.' ) }, { status: 404 });
      const replacementBody = { ...old, ...(body.replacement ?? {}), replacementFor: old.id } as OrderRequest & { replacementFor?: string };
      const created = createTerminalOrder({
        mint: assertPubkey(replacementBody.mint, 'mint'),
        wallet: assertPubkey(replacementBody.wallet, 'wallet'),
        side: parseSide(replacementBody.side),
        kind: parseKind(replacementBody.kind),
        amount: parseAmount(replacementBody.amount),
        spendAsset: replacementBody.spendAsset === 'USDC' ? 'USDC' : 'SOL',
        slippageBps: parseSlippage(replacementBody.slippageBps),
        triggerPriceUsd: replacementBody.triggerPriceUsd == null ? null : Number(replacementBody.triggerPriceUsd),
        triggerDirection: triggerDirection(parseKind(replacementBody.kind), parseSide(replacementBody.side)),
        expiresAt: replacementBody.expiresAt ?? null,
        replacementFor: old.id,
        clientTag: replacementBody.clientTag ?? null
      });
      return Response.json({ status: 'ok', replaced: old, order: created, ...mutationMeta('Order replaced in local order store.'), execution: 'order-replaced' });
    }

    if (action === 'evaluate') {
      const mint = body?.mint ? assertPubkey(body.mint, 'mint') : null;
      const wallet = body?.wallet ? assertPubkey(body.wallet, 'wallet') : null;
      const orders = activeOrders({ mint, wallet });
      const byMint = new Map<string, number | null>();
      const evaluated: TerminalOrder[] = [];
      for (const order of orders) {
        if (!byMint.has(order.mint)) byMint.set(order.mint, await tokenPrice(origin, order.mint));
        const priceUsd = byMint.get(order.mint) ?? null;
        const expired = order.expiresAt ? Date.parse(order.expiresAt) <= Date.now() : false;
        if (expired) {
          evaluated.push(updateTerminalOrder(order.id, { status: 'expired', lastEvaluationAt: new Date().toISOString(), lastObservedPriceUsd: priceUsd, ...appendOrderLifecycle(order, { stage: 'failed', note: 'Order expired before trigger.', priceUsd }) })!);
        } else if (shouldTrigger(order, priceUsd)) {
          evaluated.push(updateTerminalOrder(order.id, { status: 'triggered', triggeredAt: new Date().toISOString(), lastEvaluationAt: new Date().toISOString(), lastObservedPriceUsd: priceUsd, ...appendOrderLifecycle(order, { stage: 'triggered', note: 'Trigger condition matched current market price.', priceUsd }) })!);
        } else {
          evaluated.push(updateTerminalOrder(order.id, { lastEvaluationAt: new Date().toISOString(), lastObservedPriceUsd: priceUsd, ...appendOrderLifecycle(order, { stage: 'evaluated', note: 'Trigger condition checked; order remains open.', priceUsd }) })!);
        }
      }
      return Response.json({ status: 'ok', ...mutationMeta('Orders evaluated and local lifecycle metadata updated.'), evaluated, triggered: evaluated.filter((order) => order.status === 'triggered'), executionModel: { unsignedTransactionBuild: '/api/execution-swap', browserWalletSigning: 'required', broadcast: 'explicit-only-via-/api/send-signed-transaction', autoBroadcast: false }, nextAction: evaluated.some((order) => order.status === 'triggered') ? 'Build unsigned transaction via /api/execution-swap, then browser-sign and broadcast only after explicit operator action.' : 'No triggered orders require action.', routes: { build: '/api/execution-swap', broadcast: '/api/send-signed-transaction' }, execution: 'orders-evaluated' });
    }

    const mint = assertPubkey(body?.mint, 'mint');
    const wallet = assertPubkey(body?.wallet, 'wallet');
    if (activeOrders().length >= MAX_OPEN_ORDERS) return Response.json({ status: 'error', error: `Open order cap reached (${MAX_OPEN_ORDERS}).`, ...mutationMeta('Order create rejected.' ) }, { status: 429 });
    const kind = parseKind(body?.kind);
    const side = parseSide(body?.side);
    const triggerPriceUsd = body?.triggerPriceUsd == null ? null : Number(body.triggerPriceUsd);
    if (kind !== 'market' && (triggerPriceUsd == null || !Number.isFinite(triggerPriceUsd) || triggerPriceUsd <= 0)) throw new Error(`${kind} orders require triggerPriceUsd.`);
    const order = createTerminalOrder({
      mint,
      wallet,
      side,
      kind,
      amount: parseAmount(body?.amount),
      spendAsset: body?.spendAsset === 'USDC' ? 'USDC' : 'SOL',
      slippageBps: parseSlippage(body?.slippageBps),
      triggerPriceUsd,
      triggerDirection: triggerDirection(kind, side),
      expiresAt: body?.expiresAt ?? null,
      clientTag: body?.clientTag ?? null
    });
    return Response.json({ status: 'ok', ...mutationMeta('Order created in local order store.'), order, lifecycle: order.lifecycle, executionModel: { unsignedTransactionBuild: '/api/execution-swap', browserWalletSigning: 'required', broadcast: 'explicit-only-via-/api/send-signed-transaction', autoBroadcast: false }, nextAction: kind === 'market' ? 'Preview/build route only; browser signing and broadcast remain explicit.' : 'Order stored; evaluate trigger before build/sign/broadcast.', buildRoute: '/api/execution-swap', broadcastRoute: '/api/send-signed-transaction', execution: 'order-created' });
  } catch (error) {
    return Response.json({ status: 'error', error: error instanceof Error ? error.message : 'Order engine failed.', ...mutationMeta('Order engine request failed.') }, { status: 400 });
  }
}
