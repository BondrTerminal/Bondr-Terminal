import { buildMeridianHubContext } from '../../../../lib/meridian-context';
import { getProject } from '../../../../lib/meridian-store';
import { getMeridianWalletStore } from '../../../../lib/durable-wallet-store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project')?.trim() || null;
  const store = await getMeridianWalletStore();

  if (projectId && !getProject(projectId, store)) {
    return Response.json({
      status: 'error',
      observedAt: new Date().toISOString(),
      error: 'Unknown Bond.Terminal project.',
      project: projectId,
      contract: 'meridian-hub-context-v1'
    }, { status: 404 });
  }

  return Response.json({
    status: 'ok',
    execution: 'read-only-shared-context',
    mutation: 'disabled-from-context-route',
    data: buildMeridianHubContext(projectId, store)
  });
}
