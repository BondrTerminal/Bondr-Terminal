import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../../../lib/durable-wallet-store';
import { getLiveActivationStatus } from '../../../../../lib/live-activation';
import { buildPumpPortalCreatePreview } from '../../../../../lib/pumpportal-deploy-readiness';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project')?.trim() || null;
  const mintPublicKey = searchParams.get('mint')?.trim() || null;
  const connectedSigner = searchParams.get('connectedSigner')?.trim() || null;
  const observedAt = new Date().toISOString();
  const store = await getMeridianWalletStore();

  if (projectId && !resolveMeridianProjectContextId(projectId, store)) {
    return Response.json({ status: 'error', observedAt, error: 'Unknown Bond.Terminal project or wallet group.', project: projectId }, { status: 404 });
  }

  const context = buildMeridianHubContext(projectId, store);
  const active = context.projects[0] ?? null;

  if (!active) {
    return Response.json({
      status: 'blocked',
      observedAt,
      contract: 'bondr-pumpportal-create-preview-v1',
      blockers: ['project-required'],
      execution: 'preview-only-no-provider-call-no-signing-no-broadcast'
    }, { headers: { 'cache-control': 'no-store' } });
  }

  const preview = buildPumpPortalCreatePreview(active.project, active.wallets, getLiveActivationStatus(), { mintPublicKey, connectedSigner });

  return Response.json({
    status: preview.status,
    observedAt,
    projectId: active.project.id,
    preview
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { projectId?: unknown; mintPublicKey?: unknown; connectedSigner?: unknown };
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : null;
  const mintPublicKey = typeof body.mintPublicKey === 'string' ? body.mintPublicKey.trim() : null;
  const connectedSigner = typeof body.connectedSigner === 'string' ? body.connectedSigner.trim() : null;
  const observedAt = new Date().toISOString();
  const store = await getMeridianWalletStore();

  if (projectId && !resolveMeridianProjectContextId(projectId, store)) {
    return Response.json({ status: 'error', observedAt, error: 'Unknown Bond.Terminal project or wallet group.', project: projectId }, { status: 404 });
  }

  const context = buildMeridianHubContext(projectId, store);
  const active = context.projects[0] ?? null;

  if (!active) {
    return Response.json({
      status: 'blocked',
      observedAt,
      contract: 'bondr-pumpportal-create-preview-v1',
      blockers: ['project-required'],
      execution: 'preview-only-no-provider-call-no-signing-no-broadcast'
    }, { headers: { 'cache-control': 'no-store' } });
  }

  const preview = buildPumpPortalCreatePreview(active.project, active.wallets, getLiveActivationStatus(), { mintPublicKey, connectedSigner });

  return Response.json({
    status: preview.status,
    observedAt,
    projectId: active.project.id,
    preview
  }, { headers: { 'cache-control': 'no-store' } });
}
