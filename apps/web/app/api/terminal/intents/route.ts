import { createIntent, listIntents, liveMutationMeta, type TerminalIntentStatus } from '../../../../lib/live-store';
import { DEFAULT_ALLOWED_SWAP_PROGRAMS } from '../../../../lib/transaction-policy';
import { sameOriginAllowed, mutationBlockedResponse } from '../../../../lib/mutation-safety';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type IntentRequest = {
  expectedSigner?: string;
  expectedMint?: string;
  expectedSide?: 'buy' | 'sell' | 'Buy' | 'Sell';
  expectedAmount?: string | null;
  slippageBps?: number | null;
  allowedPrograms?: string[];
  requiredAccounts?: string[];
  sourceRoute?: string;
  orderId?: string | null;
  bundleId?: string | null;
  quoteHash?: string | null;
  routeHash?: string | null;
  transactionMessageHash?: string | null;
  note?: string | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const status = searchParams.get('status') as TerminalIntentStatus | 'all' | null;
  return Response.json({
    status: 'ok',
    source: 'terminal-intent-registry',
    intents: listIntents({ id, status: status ?? 'all' }),
    ...liveMutationMeta('Intent registry read from local-dev live store.')
  });
}

export async function POST(request: Request) {
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  const body = await request.json().catch(() => null) as IntentRequest | null;
  if (!body) return Response.json({ status: 'error', error: 'Invalid JSON body.', ...liveMutationMeta('Intent create rejected.') }, { status: 400 });
  if (!body.expectedSigner || !ADDRESS_RE.test(body.expectedSigner)) return Response.json({ status: 'error', error: 'expectedSigner is required.', ...liveMutationMeta('Intent create rejected.') }, { status: 400 });
  if (!body.expectedMint || !ADDRESS_RE.test(body.expectedMint)) return Response.json({ status: 'error', error: 'expectedMint is required.', ...liveMutationMeta('Intent create rejected.') }, { status: 400 });

  const allowedPrograms = body.allowedPrograms?.length ? body.allowedPrograms : DEFAULT_ALLOWED_SWAP_PROGRAMS;
  const requiredAccounts = Array.from(new Set([...(body.requiredAccounts ?? []), body.expectedSigner, body.expectedMint]));
  const intent = createIntent({
    expectedSigner: body.expectedSigner,
    expectedMint: body.expectedMint,
    expectedSide: String(body.expectedSide ?? 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy',
    expectedAmount: body.expectedAmount ?? null,
    slippageBps: typeof body.slippageBps === 'number' ? body.slippageBps : null,
    allowedPrograms,
    requiredAccounts,
    sourceRoute: body.sourceRoute ?? '/api/terminal/intents',
    orderId: body.orderId ?? null,
    bundleId: body.bundleId ?? null,
    quoteHash: body.quoteHash ?? null,
    routeHash: body.routeHash ?? null,
    transactionMessageHash: body.transactionMessageHash ?? null,
    note: body.note ?? 'Local-dev terminal intent created without broadcasting.',
    status: 'created'
  });

  return Response.json({ status: 'ok', intent, ...liveMutationMeta('Intent created in local-dev registry.') }, { status: 201 });
}
