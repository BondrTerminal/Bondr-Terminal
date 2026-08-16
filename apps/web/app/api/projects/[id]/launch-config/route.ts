import { readFileSync } from 'node:fs';
import { getMeridianStore, getMeridianStorePath, type LaunchConfig, type MeridianStore, type WalletPlanEntry, type Project } from '../../../../../lib/meridian-store';
import { getMeridianWalletStore, updateDurableProject, walletStoreMode } from '../../../../../lib/durable-wallet-store';
import { atomicJsonWrite, mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../../../lib/mutation-safety';
import { normalizeDeploymentLaunchPath, normalizeDeploymentRoutePlatform, routePlatformForLaunchPath } from '../../../../../lib/deployment-launch-path';
import { meridianAuthRequiredResponse } from '../../../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

type LaunchConfigPatch = Partial<Pick<Project, 'name' | 'launchPath' | 'tokenMint' | 'pool'>> & {
  metadata?: Partial<Project['metadata']>;
  fundingPlan?: Partial<Project['fundingPlan']>;
  launchConfig?: Partial<LaunchConfig> & {
    route?: Partial<LaunchConfig['route']>;
    devWalletRules?: Partial<LaunchConfig['devWalletRules']>;
  };
};

function numberField(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : typeof value === 'number' ? value : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function stringField(value: unknown, fallback = '', max = 500) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, max);
}
function defaultLaunchConfig(project: Project): LaunchConfig {
  return {
    route: {
      platform: routePlatformForLaunchPath(project.launchPath),
      quoteToken: 'SOL',
      tokenMode: 'classic',
      buyMode: 'snipe',
      initialBuySol: project.fundingPlan.devBuySol,
      slippageBps: 500,
      priorityFeeMode: 'auto capped',
      graduationMonitor: 'PumpSwap graduation / Raydium pool handoff',
      raydiumLiquiditySol: project.fundingPlan.liquiditySol,
      raydiumWithheldTokenPct: 10,
      raydiumWithheldTokenAmount: 0,
      burnLiquidity: true
    },
    walletPlan: [],
    devWalletRules: {
      controlledWalletRole: 'deployer / creator',
      maxInitialBuySol: project.fundingPlan.devBuySol,
      maxSlippageBps: 500,
      maxPriorityFeeSol: 0.01,
      perTxSellCapPct: 25,
      cooldownSeconds: 60,
      takeProfitPercents: [35, 75, 150],
      stopLossPct: -18,
      trailingStopPct: 22,
      trailingActivationPct: 60,
      maxDevExposureSol: Math.max(project.fundingPlan.devBuySol, 0.4),
      maxDevSupplyPct: 8
    }
  };
}
function normalizedLaunchConfig(project: Project): LaunchConfig {
  const fallback = defaultLaunchConfig(project);
  return {
    ...fallback,
    ...(project.launchConfig ?? {}),
    route: { ...fallback.route, ...(project.launchConfig?.route ?? {}) },
    walletPlan: project.launchConfig?.walletPlan ?? fallback.walletPlan,
    devWalletRules: { ...fallback.devWalletRules, ...(project.launchConfig?.devWalletRules ?? {}) }
  };
}

function walletPlanEntry(value: unknown, fallbackRole = 'wallet'): WalletPlanEntry | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<WalletPlanEntry>;
  const walletId = stringField(item.walletId, '', 100);
  if (!walletId) return null;
  const executionPhase = ['dev', 'bundle', 'sniper', 'task', 'observe'].includes(String(item.executionPhase)) ? item.executionPhase : undefined;
  const taskType = ['timed-buy', 'timed-sell', 'smart-sell', 'auto-take-profit', 'stop-loss', 'trailing-stop'].includes(String(item.taskType)) ? item.taskType : undefined;
  const taskPreset = ['fast-paced-balance', 'smooth-flow', 'custom'].includes(String(item.taskPreset)) ? item.taskPreset : 'custom';
  const taskWalletRotation = ['random', 'sequential', 'balanced'].includes(String(item.taskWalletRotation)) ? item.taskWalletRotation : 'random';
  const taskTradeSizeMode = ['mixed', 'fixed', 'randomized'].includes(String(item.taskTradeSizeMode)) ? item.taskTradeSizeMode : 'mixed';
  const taskExternalResponse = ['off', 'defensive', 'follow-flow'].includes(String(item.taskExternalResponse)) ? item.taskExternalResponse : 'off';
  return {
    walletId,
    role: stringField(item.role, fallbackRole, 80),
    participate: typeof item.participate === 'boolean' ? item.participate : true,
    executionPhase,
    plannedBuySol: numberField(item.plannedBuySol, 0, 0, 1000),
    maxBuySol: numberField(item.maxBuySol, item.plannedBuySol ?? 0, 0, 1000),
    maxSlippageBps: numberField(item.maxSlippageBps, 500, 1, 2000),
    takeProfitPercents: Array.isArray(item.takeProfitPercents) ? item.takeProfitPercents.map((value) => numberField(value, 0, -99, 100000)).filter((value) => value !== 0).slice(0, 8) : [],
    stopLossPct: numberField(item.stopLossPct, -18, -99, 0),
    trailingStopPct: numberField(item.trailingStopPct, 22, 0, 100),
    perTxSellCapPct: numberField(item.perTxSellCapPct, 25, 0, 100),
    cooldownSeconds: numberField(item.cooldownSeconds, 60, 0, 86400),
    taskType,
    taskName: stringField(item.taskName, '', 120),
    taskPreset,
    taskAmountSol: numberField(item.taskAmountSol, 0, 0, 1000),
    taskSellPercent: numberField(item.taskSellPercent, 0, 0, 100),
    taskMaxTotalSol: numberField(item.taskMaxTotalSol, 0, 0, 1000),
    taskDelaySeconds: numberField(item.taskDelaySeconds, 0, 0, 604800),
    taskIntervalSeconds: numberField(item.taskIntervalSeconds, 0, 0, 604800),
    taskMaxExecutions: numberField(item.taskMaxExecutions, 1, 1, 1000),
    taskBuyPowerPct: numberField(item.taskBuyPowerPct, 50, 0, 100),
    taskSellPowerPct: numberField(item.taskSellPowerPct, 50, 0, 100),
    taskSellMinPct: numberField(item.taskSellMinPct, 5, 0, 100),
    taskSellMaxPct: numberField(item.taskSellMaxPct, 35, 0, 100),
    taskBuyMinSol: numberField(item.taskBuyMinSol, 0, 0, 1000),
    taskBuyMaxSol: numberField(item.taskBuyMaxSol, item.taskAmountSol ?? 0, 0, 1000),
    taskDelayMinMs: numberField(item.taskDelayMinMs, 500, 0, 604800000),
    taskDelayMaxMs: numberField(item.taskDelayMaxMs, 4000, 0, 604800000),
    taskWalletRotation,
    taskTradeSizeMode,
    taskPriorityFeeSol: numberField(item.taskPriorityFeeSol, 0, 0, 10),
    taskExternalResponse
  };
}

function mergeLaunchConfig(project: Project, patch?: LaunchConfigPatch['launchConfig']): LaunchConfig {
  const base = normalizedLaunchConfig(project);
  const platform = normalizeDeploymentRoutePlatform(patch?.route?.platform, base.route.platform ?? routePlatformForLaunchPath(project.launchPath));
  const quoteToken = ['SOL', 'USDC'].includes(String(patch?.route?.quoteToken)) ? patch?.route?.quoteToken : base.route.quoteToken;
  const tokenMode = ['classic', 'mayhem'].includes(String(patch?.route?.tokenMode)) ? patch?.route?.tokenMode : base.route.tokenMode;
  const buyMode = ['snipe', 'bundle', 'launch-bundle-snipe', 'dev-buy-only'].includes(String(patch?.route?.buyMode)) ? patch?.route?.buyMode : base.route.buyMode;
  return {
    route: {
      ...base.route,
      platform,
      quoteToken,
      tokenMode,
      buyMode,
      initialBuySol: numberField(patch?.route?.initialBuySol, base.route.initialBuySol, 0, 1000),
      slippageBps: numberField(patch?.route?.slippageBps, base.route.slippageBps, 1, 2000),
      priorityFeeMode: stringField(patch?.route?.priorityFeeMode, base.route.priorityFeeMode, 80),
      graduationMonitor: stringField(patch?.route?.graduationMonitor, base.route.graduationMonitor, 120),
      raydiumLiquiditySol: numberField(patch?.route?.raydiumLiquiditySol, base.route.raydiumLiquiditySol, 0, 10000),
      raydiumWithheldTokenPct: numberField(patch?.route?.raydiumWithheldTokenPct, base.route.raydiumWithheldTokenPct, 0, 100),
      raydiumWithheldTokenAmount: numberField(patch?.route?.raydiumWithheldTokenAmount, base.route.raydiumWithheldTokenAmount, 0, 1_000_000_000_000),
      raydiumCpmmConfigId: stringField(patch?.route?.raydiumCpmmConfigId, base.route.raydiumCpmmConfigId ?? '', 64) || undefined,
      raydiumBaseDecimals: numberField(patch?.route?.raydiumBaseDecimals, base.route.raydiumBaseDecimals ?? 6, 0, 12),
      raydiumQuoteDecimals: numberField(patch?.route?.raydiumQuoteDecimals, base.route.raydiumQuoteDecimals ?? 9, 0, 12),
      raydiumBaseAmountRaw: stringField(patch?.route?.raydiumBaseAmountRaw, base.route.raydiumBaseAmountRaw ?? '', 40) || undefined,
      raydiumQuoteAmountRaw: stringField(patch?.route?.raydiumQuoteAmountRaw, base.route.raydiumQuoteAmountRaw ?? '', 40) || undefined,
      burnLiquidity: typeof patch?.route?.burnLiquidity === 'boolean' ? patch.route.burnLiquidity : base.route.burnLiquidity
    },
    walletPlan: Array.isArray(patch?.walletPlan) ? patch.walletPlan.map((entry) => walletPlanEntry(entry)).filter((entry): entry is WalletPlanEntry => Boolean(entry)).slice(0, 50) : base.walletPlan,
    devWalletRules: {
      ...base.devWalletRules,
      controlledWalletRole: stringField(patch?.devWalletRules?.controlledWalletRole, base.devWalletRules.controlledWalletRole, 80),
      maxInitialBuySol: numberField(patch?.devWalletRules?.maxInitialBuySol, base.devWalletRules.maxInitialBuySol, 0, 1000),
      maxSlippageBps: numberField(patch?.devWalletRules?.maxSlippageBps, base.devWalletRules.maxSlippageBps, 1, 2000),
      maxPriorityFeeSol: numberField(patch?.devWalletRules?.maxPriorityFeeSol, base.devWalletRules.maxPriorityFeeSol, 0, 10),
      perTxSellCapPct: numberField(patch?.devWalletRules?.perTxSellCapPct, base.devWalletRules.perTxSellCapPct, 0, 100),
      cooldownSeconds: numberField(patch?.devWalletRules?.cooldownSeconds, base.devWalletRules.cooldownSeconds, 0, 86400),
      takeProfitPercents: Array.isArray(patch?.devWalletRules?.takeProfitPercents)
        ? patch.devWalletRules.takeProfitPercents.map((value) => numberField(value, 0, -99, 100000)).filter((value) => value !== 0).slice(0, 8)
        : base.devWalletRules.takeProfitPercents,
      stopLossPct: numberField(patch?.devWalletRules?.stopLossPct, base.devWalletRules.stopLossPct, -99, 0),
      trailingStopPct: numberField(patch?.devWalletRules?.trailingStopPct, base.devWalletRules.trailingStopPct, 0, 100),
      trailingActivationPct: numberField(patch?.devWalletRules?.trailingActivationPct, base.devWalletRules.trailingActivationPct, 0, 100000),
      maxDevExposureSol: numberField(patch?.devWalletRules?.maxDevExposureSol, base.devWalletRules.maxDevExposureSol, 0, 1000),
      maxDevSupplyPct: numberField(patch?.devWalletRules?.maxDevSupplyPct, base.devWalletRules.maxDevSupplyPct, 0, 100)
    },
    updatedAt: new Date().toISOString()
  };
}
function applyPatch(project: Project, body: LaunchConfigPatch): Project {
  const next: Project = structuredClone(project);
  if (typeof body.name === 'string') next.name = stringField(body.name, next.name, 120);
  if (typeof body.launchPath === 'string') {
    const launchPath = stringField(body.launchPath, next.launchPath, 80);
    next.launchPath = normalizeDeploymentLaunchPath(launchPath);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'tokenMint')) next.tokenMint = body.tokenMint ? stringField(body.tokenMint, '', 64) : null;
  if (Object.prototype.hasOwnProperty.call(body, 'pool')) next.pool = body.pool ? stringField(body.pool, '', 120) : null;
  if (body.metadata) next.metadata = {
    ...next.metadata,
    name: stringField(body.metadata.name, next.metadata.name, 120),
    symbol: stringField(body.metadata.symbol, next.metadata.symbol, 16).toUpperCase(),
    description: stringField(body.metadata.description, next.metadata.description, 1000),
    imageUrl: stringField(body.metadata.imageUrl, next.metadata.imageUrl, 500),
    metadataUri: stringField(body.metadata.metadataUri, next.metadata.metadataUri ?? '', 500),
    website: stringField(body.metadata.website, next.metadata.website, 500),
    twitter: stringField(body.metadata.twitter, next.metadata.twitter, 500),
    telegram: stringField(body.metadata.telegram, next.metadata.telegram, 500)
  };
  if (body.fundingPlan) next.fundingPlan = {
    ...next.fundingPlan,
    budgetSol: numberField(body.fundingPlan.budgetSol, next.fundingPlan.budgetSol, 0, 10000),
    feeReserveSol: numberField(body.fundingPlan.feeReserveSol, next.fundingPlan.feeReserveSol, 0, 10000),
    liquiditySol: numberField(body.fundingPlan.liquiditySol, next.fundingPlan.liquiditySol, 0, 10000),
    devBuySol: numberField(body.fundingPlan.devBuySol, next.fundingPlan.devBuySol, 0, 10000),
    collectionWalletId: stringField(body.fundingPlan.collectionWalletId, next.fundingPlan.collectionWalletId, 80)
  };
  next.launchConfig = mergeLaunchConfig(next, body.launchConfig);
  next.launchPath = next.launchConfig.route.platform === 'raydium' ? 'raydium' : 'pump.fun';
  next.deploymentState = { ...next.deploymentState, stage: next.deploymentState.stage === 'draft' ? 'configuration' : next.deploymentState.stage };
  return next;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const project = (await getMeridianWalletStore()).projects.find((item) => item.id === id);
  if (!project) return Response.json({ status: 'error', error: 'Project not found.', observedAt: new Date().toISOString() }, { status: 404 });
  return Response.json({ status: 'ok', projectId: id, launchConfig: normalizedLaunchConfig(project), project, mutation: mutationMeta('Read-only launch config.'), execution: 'read-only-launch-config' });
}

export async function PATCH(request: Request, { params }: Params) {
  const observedAt = new Date().toISOString();
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');
  const { id } = await params;
  const body = await request.json().catch(() => null) as LaunchConfigPatch | null;
  if (!body) return Response.json({ status: 'error', observedAt, error: 'Invalid JSON body.' }, { status: 400 });

  const mode = walletStoreMode();
  const isServerlessPreview = Boolean(process.env.VERCEL) && mode !== 'postgres';
  const store = mode === 'postgres' ? await getMeridianWalletStore() : JSON.parse(readFileSync(getMeridianStorePath(), 'utf8')) as MeridianStore;
  const index = store.projects.findIndex((project) => project.id === id);
  if (index < 0) return Response.json({ status: 'error', observedAt, error: 'Project not found.' }, { status: 404 });
  const next = applyPatch(store.projects[index], body);
  const event = { id: `evt-${Date.now()}`, projectId: id, timestamp: observedAt, level: 'info' as const, module: 'deployment', message: 'Launch configuration updated through Deployment Command Center.' };

  if (isServerlessPreview) return Response.json({ status: 'ok', project: next, launchConfig: next.launchConfig, event, ...mutationMeta('Stateless deployment accepted launch config update without durable persistence.'), persisted: false, mode: 'stateless-accepted' }, { status: 202 });

  if (mode === 'postgres') {
    const persisted = await updateDurableProject(next, event);
    if (!persisted) return Response.json({ status: 'error', error: 'Durable project store is unavailable; launch config was not saved.', ...mutationMeta('Launch config update blocked because durable persistence failed.'), mutationMode: mode, persisted: false }, { status: 503 });
    return Response.json({ status: 'ok', project: next, launchConfig: next.launchConfig, event, ...mutationMeta('Launch config persisted to durable Postgres store.'), mutationMode: mode, persisted: true, mode, execution: 'config-only-no-signing-no-fund-movement' });
  }

  const dataPath = getMeridianStorePath();
  store.projects[index] = next;
  store.eventLog.unshift(event);
  atomicJsonWrite(dataPath, store);
  return Response.json({ status: 'ok', project: next, launchConfig: next.launchConfig, event, ...mutationMeta('Launch config persisted to local Meridian JSON store.'), persisted: true, mode: 'local-json', execution: 'config-only-no-signing-no-fund-movement' });
}

export const POST = PATCH;
