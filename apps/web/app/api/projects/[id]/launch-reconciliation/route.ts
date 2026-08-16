import { getMeridianWalletStore } from '../../../../../lib/durable-wallet-store';
import { buildLaunchReconciliation } from '../../../../../lib/launch-reconciliation';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const store = await getMeridianWalletStore();
  const project = store.projects.find((item) => item.id === id);
  if (!project) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Project not found.', execution: 'read-only-launch-reconciliation-no-signing-no-broadcast' }, { status: 404 });
  const origin = new URL(request.url).origin;
  const reconciliation = await buildLaunchReconciliation(project, origin);
  return Response.json({
    ...reconciliation
  });
}
