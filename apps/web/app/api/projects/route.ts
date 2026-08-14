import { readFileSync } from 'node:fs';
import { getMeridianStorePath, type LaunchConfig, type MeridianStore, type Project } from '../../../lib/meridian-store';
import { getMeridianWalletStore, insertDurableProject, walletStoreMode } from '../../../lib/durable-wallet-store';
import { atomicJsonWrite, mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../lib/mutation-safety';

export const dynamic = 'force-dynamic';

type ProjectPost = {
  name?: unknown;
  ticker?: unknown;
  launchPath?: unknown;
  walletGroupId?: unknown;
  quoteToken?: unknown;
  launchNotes?: unknown;
  maxSlippageBps?: unknown;
  metadata?: unknown;
  fundingPlan?: unknown;
  website?: unknown;
  twitter?: unknown;
  telegram?: unknown;
  imageUrl?: unknown;
};

type MetadataInput = Partial<Project['metadata']>;
type FundingInput = Partial<Project['fundingPlan']>;

function clean(value: unknown, fallback = '', max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function numberField(value: unknown, fallback = 0, min = 0, max = 10000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function projectIdFor(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || `project-${Date.now()}`;
}

function objectInput<T extends object>(value: unknown): Partial<T> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<T> : {};
}

function firstUsableWalletGroup(store: MeridianStore, requested: unknown) {
  const requestedId = clean(requested, '', 100);
  return store.walletGroups.find((group) => group.id === requestedId)
    ?? store.walletGroups.find((group) => group.id === 'operator-wallets')
    ?? store.walletGroups.find((group) => group.scope === 'global')
    ?? store.walletGroups[0]
    ?? null;
}

function responseMutationMeta(note: string, observedAt = new Date().toISOString()) {
  const { observedAt: _mutationObservedAt, ...meta } = mutationMeta(note);
  return { observedAt, ...meta };
}

export async function GET() {
  const store = await getMeridianWalletStore();
  const mode = walletStoreMode();
  return Response.json({
    status: 'ok',
    source: 'durable-meridian-store',
    ...responseMutationMeta('Read-only project list.'),
    mutationMode: mode,
    persisted: mode === 'postgres' || mode === 'local-json',
    data: store
  });
}

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');

  const body = await request.json().catch(() => null) as ProjectPost | null;
  if (!body) return Response.json({ status: 'error', observedAt, error: 'Invalid JSON body.' }, { status: 400 });

  const name = clean(body.name, '', 120);
  const ticker = clean(body.ticker, '', 18).toUpperCase();
  if (!name || !ticker) return Response.json({ status: 'error', observedAt, error: 'Project name and ticker are required.' }, { status: 400 });

  const store = await getMeridianWalletStore();
  const id = projectIdFor(name);
  if (store.projects.some((project) => project.id === id)) return Response.json({ status: 'error', observedAt, error: 'Project already exists.' }, { status: 409 });

  const mode = walletStoreMode();
  if (process.env.VERCEL && mode !== 'postgres') {
    return Response.json({
      status: 'error',
      error: 'Project creation is blocked because durable project storage is not configured. This prevents non-persistent production drafts.',
      ...responseMutationMeta('Project creation blocked because durable project persistence is unavailable.', observedAt),
      mutationMode: mode,
      persisted: false,
      execution: 'blocked-no-durable-project-store'
    }, { status: 503 });
  }

  const allowedLaunchPaths = new Set(['pump.fun', 'raydium', 'meteora', 'bonk', 'custom']);
  const launchPath = allowedLaunchPaths.has(String(body.launchPath)) ? String(body.launchPath) : 'pump.fun';
  const quoteToken = body.quoteToken === 'USDC' ? 'USDC' : 'SOL';
  const group = firstUsableWalletGroup(store, body.walletGroupId);
  const metadata = objectInput<MetadataInput>(body.metadata);
  const funding = objectInput<FundingInput>(body.fundingPlan);
  const description = clean(metadata.description, '', 500);
  const website = clean(metadata.website ?? body.website, '', 160);
  const twitter = clean(metadata.twitter ?? body.twitter, '', 120);
  const telegram = clean(metadata.telegram ?? body.telegram, '', 120);
  const imageUrl = clean(metadata.imageUrl ?? body.imageUrl, '', 260);
  const launchNotes = clean(body.launchNotes, '', 500);
  const slippageBps = numberField(body.maxSlippageBps, 100, 0, 1000);
  const devBuySol = numberField(funding.devBuySol, 0, 0, 10000);
  const liquiditySol = numberField(funding.liquiditySol, 0, 0, 10000);
  const feeReserveSol = numberField(funding.feeReserveSol, 0, 0, 10000);

  const launchConfig: LaunchConfig = {
    route: {
      initialBuySol: devBuySol,
      slippageBps,
      priorityFeeMode: 'manual',
      graduationMonitor: launchPath,
      raydiumLiquiditySol: liquiditySol,
      raydiumWithheldTokenPct: 0,
      raydiumWithheldTokenAmount: 0,
      burnLiquidity: false
    },
    walletPlan: (group?.walletIds ?? []).map((walletId) => ({
      walletId,
      role: 'project wallet',
      participate: true,
      plannedBuySol: devBuySol,
      maxBuySol: devBuySol,
      maxSlippageBps: slippageBps,
      takeProfitPercents: [],
      stopLossPct: 0,
      trailingStopPct: 0,
      perTxSellCapPct: 0,
      cooldownSeconds: 0
    })),
    devWalletRules: {
      controlledWalletRole: 'browser signer watch-only',
      maxInitialBuySol: devBuySol,
      maxSlippageBps: slippageBps,
      maxPriorityFeeSol: 0,
      perTxSellCapPct: 0,
      cooldownSeconds: 0,
      takeProfitPercents: [],
      stopLossPct: 0,
      trailingStopPct: 0,
      trailingActivationPct: 0,
      maxDevExposureSol: devBuySol,
      maxDevSupplyPct: 0
    },
    updatedAt: observedAt
  };

  const project: Project = {
    id,
    name,
    ticker,
    status: 'draft',
    launchPath,
    tokenMint: null,
    pool: null,
    metadata: {
      name,
      symbol: ticker,
      description,
      imageUrl,
      website,
      twitter,
      telegram
    },
    walletGroupId: group?.id ?? 'operator-wallets',
    fundingPlan: {
      budgetSol: numberField(funding.budgetSol, devBuySol + liquiditySol + feeReserveSol, 0, 10000),
      feeReserveSol,
      liquiditySol,
      devBuySol,
      collectionWalletId: clean(funding.collectionWalletId, 'browser-signer-watch-only', 100)
    },
    launchConfig,
    deploymentState: {
      stage: 'configuration',
      ready: false,
      disabledReason: `Project record created for ${quoteToken} quote planning (${launchNotes || 'no launch notes'}). Configure details; token deployment, funding, signing, and broadcast remain disabled in A-profile.`
    },
    monitor: {
      holders: [{ label: 'Unique holders', value: '—', detail: 'No token loaded' }],
      orders: [{ label: 'Active orders', value: '0', detail: 'Disabled' }],
      positions: [{ label: 'Position', value: '0', detail: 'No token loaded' }],
      topTraders: [{ label: 'Top trader', value: '—', detail: 'No token loaded' }],
      devTokens: [{ label: 'Dev tokens', value: '—', detail: 'No token loaded' }]
    },
    moduleLinks: {
      deployment: `/deployment?project=${id}`,
      wallets: `/portfolio?view=wallets&project=${id}`,
      sniper: `/sniper?project=${id}`,
      dashboard: `/projects/${id}`,
      liquidity: `/liquidity?project=${id}`
    }
  };

  const event: MeridianStore['eventLog'][number] = {
    id: `evt-${Date.now()}`,
    projectId: id,
    timestamp: observedAt,
    level: 'info',
    module: 'projects',
    message: 'Project record created. No token deployment, SOL movement, signing, funding, claims, payouts, or broadcast occurred.'
  };

  if (mode === 'postgres') {
    const persisted = await insertDurableProject(project, event);
    if (!persisted) {
      return Response.json({ status: 'error', error: 'Durable project store is unavailable; project was not created.', ...responseMutationMeta('Project creation blocked because durable persistence failed.', observedAt), mutationMode: mode, persisted: false, execution: 'blocked-no-durable-project-store' }, { status: 503 });
    }
    return Response.json({ status: 'ok', project, event, ...responseMutationMeta('Project record persisted to durable Postgres store. No chain action occurred.', observedAt), mutationMode: mode, persisted: true, execution: 'project-record-only-no-chain-action' }, { status: 201 });
  }

  const dataPath = getMeridianStorePath();
  const localStore = JSON.parse(readFileSync(dataPath, 'utf8')) as MeridianStore;
  localStore.projects.unshift(project);
  localStore.eventLog.unshift(event);
  if (mutationMode() === 'local-json') atomicJsonWrite(dataPath, localStore);
  return Response.json({ status: 'ok', project, event, ...responseMutationMeta('Project record persisted to local JSON store. No chain action occurred.', observedAt), mutationMode: mode, persisted: mutationMode() === 'local-json', execution: 'project-record-only-no-chain-action' }, { status: 201 });
}
