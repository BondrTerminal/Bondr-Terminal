import { readFileSync } from 'node:fs';
import { getMeridianStore, getMeridianStorePath, type MeridianStore, type Project } from '../../../lib/meridian-store';
import { atomicJsonWrite, mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../lib/mutation-safety';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok', observedAt: new Date().toISOString(), source: 'meridian-store', mutation: mutationMeta('Read-only project list.'), data: getMeridianStore() });
}

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');
  const body = await request.json().catch(() => null) as Partial<Project> | null;
  if (!body) return Response.json({ status: 'error', observedAt, error: 'Invalid JSON body.' }, { status: 400 });
  const name = body.name?.trim();
  const ticker = body.ticker?.trim().toUpperCase();
  if (!name || !ticker) return Response.json({ status: 'error', observedAt, error: 'name and ticker are required.' }, { status: 400 });

  const isServerlessPreview = Boolean(process.env.VERCEL);
  const dataPath = getMeridianStorePath();
  const store = JSON.parse(readFileSync(dataPath, 'utf8')) as MeridianStore;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  if (store.projects.some((project) => project.id === id)) return Response.json({ status: 'error', observedAt, error: 'Project already exists.' }, { status: 409 });

  const project: Project = {
    id,
    name,
    ticker,
    status: 'draft',
    launchPath: body.launchPath ?? 'unselected',
    tokenMint: null,
    pool: null,
    metadata: {
      name,
      symbol: ticker,
      description: body.metadata?.description ?? '',
      imageUrl: '',
      website: '',
      twitter: '',
      telegram: ''
    },
    walletGroupId: 'global-core',
    fundingPlan: { budgetSol: 0, feeReserveSol: 0, liquiditySol: 0, devBuySol: 0, collectionWalletId: 'treasury' },
    deploymentState: { stage: 'draft', ready: false, disabledReason: 'New project draft requires metadata, wallet group, funding plan, and launch path.' },
    monitor: {
      holders: [{ label: 'Unique holders', value: '—', detail: 'No token loaded' }],
      orders: [{ label: 'Active orders', value: '0', detail: 'Disabled' }],
      positions: [{ label: 'Position', value: '0', detail: 'No token loaded' }],
      topTraders: [{ label: 'Top trader', value: '—', detail: 'No token loaded' }],
      devTokens: [{ label: 'Dev tokens', value: '—', detail: 'No token loaded' }]
    },
    moduleLinks: {
      deployment: `/deployment?project=${id}`,
      wallets: `/wallets?project=${id}`,
      sniper: `/sniper?project=${id}`,
      dashboard: `/project-dashboard?project=${id}`,
      liquidity: `/liquidity?project=${id}`
    }
  };

  const event = {
    id: `evt-${Date.now()}`,
    projectId: id,
    timestamp: new Date().toISOString(),
    level: 'info' as const,
    module: 'projects',
    message: isServerlessPreview
      ? 'Project draft accepted in stateless deployment mode. Connect durable storage for persistence.'
      : 'Project draft created through local Meridian API.'
  };

  if (isServerlessPreview) {
    return Response.json({ status: 'ok', project, event, ...mutationMeta('Stateless deployment accepted request without durable persistence.'), persisted: false, mode: 'stateless-accepted' }, { status: 202 });
  }

  store.projects.push(project);
  store.eventLog.unshift(event);
  atomicJsonWrite(dataPath, store);
  return Response.json({ status: 'ok', project, event, ...mutationMeta('Project draft created through local JSON mutation path.'), persisted: true, mode: 'local-json' }, { status: 201 });
}
