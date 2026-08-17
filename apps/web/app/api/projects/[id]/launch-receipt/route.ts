import { persistLaunchReceipt, type LaunchReceiptInput } from '../../../../../lib/launch-receipts';
import { meridianAuthRequiredResponse } from '../../../../../lib/meridian-auth';
import { mutationBlockedResponse, mutationMeta, sameOriginAllowed } from '../../../../../lib/mutation-safety';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

type ReceiptBody = Partial<Omit<LaunchReceiptInput, 'projectId'>>;

export async function POST(request: Request, { params }: Params) {
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  const { id } = await params;
  const body = await request.json().catch(() => null) as ReceiptBody | null;
  if (!body) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Invalid JSON body.' }, { status: 400 });

  const result = await persistLaunchReceipt({
    projectId: id,
    signature: body.signature ?? '',
    tokenMint: body.tokenMint ?? '',
    pool: body.pool ?? null,
    deployer: body.deployer ?? null,
    route: body.route ?? 'pump.fun',
    provider: body.provider ?? null,
    observedAt: body.observedAt ?? null,
    confirmedAt: body.confirmedAt ?? null,
    intentId: body.intentId ?? null,
    transactionMessageHash: body.transactionMessageHash ?? null,
    simulationTransactionMessageHash: body.simulationTransactionMessageHash ?? null,
    simulationStatus: body.simulationStatus ?? null,
    broadcastPolicy: body.broadcastPolicy ?? null
  });

  if (result.status !== 'ok') {
    const meta = mutationMeta('Launch receipt reconciliation failed.');
    return Response.json({ ...meta, status: result.status, error: result.error }, { status: result.status === 'blocked' ? 403 : 400 });
  }

  const meta = mutationMeta('Launch receipt reconciled into project state.');
  return Response.json({
    ...meta,
    status: 'ok',
    projectId: id,
    receipt: result.receipt,
    project: result.project,
    event: result.event,
    mode: result.mode,
    execution: 'receipt-reconciliation-no-signing-no-broadcast'
  });
}

export const PATCH = POST;
