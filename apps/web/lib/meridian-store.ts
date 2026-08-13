import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ProjectStatus = 'draft' | 'pending' | 'deployed' | 'cto';
export type FlowType = 'buy' | 'sell';

export type WalletPlanEntry = {
  walletId: string;
  role: string;
  participate: boolean;
  plannedBuySol: number;
  maxBuySol: number;
  maxSlippageBps: number;
  takeProfitPercents: number[];
  stopLossPct: number;
  trailingStopPct: number;
  perTxSellCapPct: number;
  cooldownSeconds: number;
};

export type LaunchConfig = {
  route: {
    initialBuySol: number;
    slippageBps: number;
    priorityFeeMode: string;
    graduationMonitor: string;
    raydiumLiquiditySol: number;
    raydiumWithheldTokenPct: number;
    raydiumWithheldTokenAmount: number;
    burnLiquidity: boolean;
  };
  walletPlan: WalletPlanEntry[];
  devWalletRules: {
    controlledWalletRole: string;
    maxInitialBuySol: number;
    maxSlippageBps: number;
    maxPriorityFeeSol: number;
    perTxSellCapPct: number;
    cooldownSeconds: number;
    takeProfitPercents: number[];
    stopLossPct: number;
    trailingStopPct: number;
    trailingActivationPct: number;
    maxDevExposureSol: number;
    maxDevSupplyPct: number;
  };
  updatedAt?: string;
};

export type PreLiveDryRun = {
  status: 'pass' | 'warn' | 'fail';
  observedAt: string;
  launchPath: string;
  participatingWalletCount: number;
  totalPlannedBuySol: number;
  totalMaxBuySol: number;
  maxSlippageBps: number;
  warnings: string[];
  blockers: string[];
  execution: 'dry-run-only-no-signing-no-broadcast';
};

export type Project = {
  id: string;
  name: string;
  ticker: string;
  status: ProjectStatus;
  launchPath: string;
  tokenMint: string | null;
  pool: string | null;
  metadata: {
    name: string;
    symbol: string;
    description: string;
    imageUrl: string;
    website: string;
    twitter: string;
    telegram: string;
  };
  walletGroupId: string;
  fundingPlan: {
    budgetSol: number;
    feeReserveSol: number;
    liquiditySol: number;
    devBuySol: number;
    collectionWalletId: string;
  };
  launchConfig?: LaunchConfig;
  preLiveDryRun?: PreLiveDryRun;
  deploymentState: {
    stage: string;
    ready: boolean;
    disabledReason: string;
  };
  monitor: Record<'holders' | 'orders' | 'positions' | 'topTraders' | 'devTokens', Array<{ label: string; value: string; detail: string }>>;
  moduleLinks: Record<'deployment' | 'wallets' | 'sniper' | 'dashboard' | 'liquidity', string>;
};

export type Wallet = {
  id: string;
  role: string;
  address: string;
  scope: 'global' | 'project';
  groupId: string;
  status: string;
  balanceSol: number;
  purpose: string;
  archived?: boolean;
  createdAt?: string;
  lastActivityAt?: string;
  archivedAt?: string;
  archiveReason?: string;
  custodyMode?: 'watch-only' | 'managed-local';
  vaultKeyId?: string;
  keyExportedAt?: string;
  keyBackupWarningDismissedAt?: string;
};

export type WalletActivity = {
  id: string;
  walletId: string;
  timestamp: string;
  type: string;
  status: 'info' | 'warn' | 'error';
  message: string;
};

export type WalletGroup = {
  id: string;
  name: string;
  scope: 'global' | 'project';
  walletIds: string[];
};

export type FlowEvent = {
  id: string;
  projectId: string;
  timestamp: string;
  type: FlowType;
  solAmount: number;
  tokenAmount: number;
  note: string;
};

export type ProjectEvent = {
  id: string;
  projectId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  module: string;
  message: string;
};

export type MeridianStore = {
  projects: Project[];
  wallets: Wallet[];
  walletGroups: WalletGroup[];
  flowEvents: FlowEvent[];
  eventLog: ProjectEvent[];
  walletActivity?: WalletActivity[];
};

export type FlowSummary = {
  buysSol: number;
  sellsSol: number;
  netSol: number;
  todayBuysSol: number;
  todaySellsSol: number;
  todayNetSol: number;
  series: number[];
};

const MERIDIAN_STORE_PATH = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'meridian-projects.json');

export function getMeridianStorePath(): string {
  if (!existsSync(MERIDIAN_STORE_PATH)) throw new Error(`Meridian store not found at ${MERIDIAN_STORE_PATH}`);
  return MERIDIAN_STORE_PATH;
}

export function getMeridianStore(): MeridianStore {
  return JSON.parse(readFileSync(getMeridianStorePath(), 'utf8')) as MeridianStore;
}

export function formatSol(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(2)} SOL`;
}

export function projectFlow(projectId: string, store = getMeridianStore()): FlowSummary {
  const events = store.flowEvents.filter((event) => event.projectId === projectId && isWithinDays(event.timestamp, 30));
  return summarizeFlow(events);
}

export function allProjectFlow(store = getMeridianStore()): FlowSummary {
  return summarizeFlow(store.flowEvents.filter((event) => isWithinDays(event.timestamp, 30)));
}

export function readinessScore(project: Project, store = getMeridianStore()): { score: number; ready: number; total: number; missing: string[] } {
  const group = store.walletGroups.find((walletGroup) => walletGroup.id === project.walletGroupId);
  const checks = [
    { label: 'Metadata', ok: Boolean(project.metadata.name && project.metadata.symbol && project.metadata.description) },
    { label: 'Wallet group', ok: Boolean(group && group.walletIds.length > 0) },
    { label: 'Funding plan', ok: project.fundingPlan.budgetSol > 0 && project.fundingPlan.feeReserveSol >= 0 },
    { label: 'Launch path', ok: project.launchPath !== 'unselected' },
    { label: 'Deployment state', ok: project.deploymentState.ready || project.status === 'deployed' },
    { label: 'Post-launch monitor', ok: Object.values(project.monitor).some((rows) => rows.length > 0) }
  ];
  const ready = checks.filter((check) => check.ok).length;
  return {
    score: Math.round((ready / checks.length) * 100),
    ready,
    total: checks.length,
    missing: checks.filter((check) => !check.ok).map((check) => check.label)
  };
}

export function getProject(projectId: string, store = getMeridianStore()): Project | undefined {
  return store.projects.find((project) => project.id === projectId);
}

export type PreflightCheck = {
  label: string;
  status: 'ready' | 'blocked' | 'review';
  owner: 'projects' | 'deployment' | 'wallets' | 'sniper' | 'dashboard' | 'liquidity';
  detail: string;
  href: string;
};

export function launchPreflight(project: Project, store = getMeridianStore()): PreflightCheck[] {
  const wallets = walletsForGroup(project.walletGroupId, store).filter((wallet) => !wallet.archived);
  const flow = projectFlow(project.id, store);
  return [
    {
      label: 'Project object',
      status: project.id && project.name && project.ticker ? 'ready' : 'blocked',
      owner: 'projects',
      detail: `${project.name} / ${project.ticker} stored as ${project.status}.`,
      href: `/projects/${project.id}`
    },
    {
      label: 'Metadata',
      status: project.metadata.name && project.metadata.symbol && project.metadata.description ? 'ready' : 'blocked',
      owner: 'deployment',
      detail: project.metadata.description ? project.metadata.description : 'Token name, symbol, description, image, and socials need completion.',
      href: project.moduleLinks.deployment
    },
    {
      label: 'Wallet group',
      status: wallets.length > 0 ? 'ready' : 'blocked',
      owner: 'wallets',
      detail: wallets.length > 0 ? `${wallets.length} active wallet(s) attached via ${project.walletGroupId}.` : 'No active wallets attached to this project.',
      href: project.moduleLinks.wallets
    },
    {
      label: 'Funding plan',
      status: project.fundingPlan.budgetSol > 0 ? 'review' : 'blocked',
      owner: 'wallets',
      detail: `Budget ${project.fundingPlan.budgetSol.toFixed(2)} SOL · liquidity ${project.fundingPlan.liquiditySol.toFixed(2)} SOL · fee reserve ${project.fundingPlan.feeReserveSol.toFixed(2)} SOL.`,
      href: project.moduleLinks.wallets
    },
    {
      label: 'Launch path',
      status: project.launchPath !== 'unselected' ? 'ready' : 'blocked',
      owner: 'deployment',
      detail: project.launchPath === 'unselected' ? 'Select Pump.fun or Raydium workflow.' : `${project.launchPath} workflow selected.`,
      href: project.moduleLinks.deployment
    },
    {
      label: 'Token intelligence',
      status: project.tokenMint ? 'review' : 'blocked',
      owner: 'sniper',
      detail: project.tokenMint ? `Mint available for read-only lookup: ${project.tokenMint}.` : 'No mint yet; Sniper can only analyze after a token address exists or is pasted manually.',
      href: project.moduleLinks.sniper
    },
    {
      label: 'Accounting',
      status: flow.buysSol || flow.sellsSol ? 'review' : 'ready',
      owner: 'dashboard',
      detail: `30d net SOL flow ${formatSol(flow.netSol)}. Held tokens excluded.`,
      href: project.moduleLinks.dashboard
    },
    {
      label: 'Liquidity handoff',
      status: project.status === 'deployed' ? 'review' : 'blocked',
      owner: 'liquidity',
      detail: project.status === 'deployed' ? 'Project can be reviewed by the backend-wired liquidity engine.' : 'Deploy/monitor first, then consider Liquidity Engine support.',
      href: project.moduleLinks.liquidity
    }
  ];
}

export function projectNextAction(project: Project, store = getMeridianStore()): { label: string; href: string } {
  const readiness = readinessScore(project, store);
  const missing = readiness.missing[0];
  if (!missing) return { label: project.status === 'deployed' ? 'Review post-launch monitor' : 'Ready for launch review', href: project.moduleLinks.deployment };
  if (missing === 'Metadata') return { label: 'Complete metadata', href: project.moduleLinks.deployment };
  if (missing === 'Wallet group') return { label: 'Assign wallet group', href: project.moduleLinks.wallets };
  if (missing === 'Funding plan') return { label: 'Prepare funding plan', href: project.moduleLinks.wallets };
  if (missing === 'Launch path') return { label: 'Select launch path', href: project.moduleLinks.deployment };
  return { label: `Fix ${missing.toLowerCase()}`, href: project.moduleLinks.deployment };
}

export function walletsForGroup(groupId: string, store = getMeridianStore()): Wallet[] {
  const group = store.walletGroups.find((walletGroup) => walletGroup.id === groupId);
  if (!group) return [];
  return group.walletIds.map((walletId) => store.wallets.find((wallet) => wallet.id === walletId)).filter(Boolean) as Wallet[];
}

export function walletBalanceSummary(store = getMeridianStore()) {
  const activeWallets = store.wallets.filter((wallet) => !wallet.archived);
  const archivedWallets = store.wallets.filter((wallet) => wallet.archived);
  const totalStoredSol = activeWallets.reduce((total, wallet) => total + wallet.balanceSol, 0);
  return {
    activeWallets,
    archivedWallets,
    totalStoredSol,
    globalWallets: activeWallets.filter((wallet) => wallet.scope === 'global'),
    projectWallets: activeWallets.filter((wallet) => wallet.scope === 'project'),
    activity: [...(store.walletActivity ?? [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  };
}

export function eventsForProject(projectId: string, store = getMeridianStore()): ProjectEvent[] {
  return store.eventLog.filter((event) => event.projectId === projectId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function summarizeFlow(events: FlowEvent[]): FlowSummary {
  const buysSol = sum(events.filter((event) => event.type === 'buy').map((event) => event.solAmount));
  const sellsSol = sum(events.filter((event) => event.type === 'sell').map((event) => event.solAmount));
  const todayEvents = events.filter((event) => isToday(event.timestamp));
  const todayBuysSol = sum(todayEvents.filter((event) => event.type === 'buy').map((event) => event.solAmount));
  const todaySellsSol = sum(todayEvents.filter((event) => event.type === 'sell').map((event) => event.solAmount));
  return {
    buysSol,
    sellsSol,
    netSol: sellsSol - buysSol,
    todayBuysSol,
    todaySellsSol,
    todayNetSol: todaySellsSol - todayBuysSol,
    series: runningSeries(events)
  };
}

function runningSeries(events: FlowEvent[]): number[] {
  let running = 0;
  const ordered = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (ordered.length === 0) return [0, 0, 0, 0];
  return ordered.map((event) => {
    running += event.type === 'sell' ? event.solAmount : -event.solAmount;
    return Number(running.toFixed(4));
  });
}

function isToday(timestamp: string): boolean {
  const date = new Date(timestamp);
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() === now.getUTCDate();
}

function isWithinDays(timestamp: string, days: number): boolean {
  return Date.now() - new Date(timestamp).getTime() <= days * 24 * 60 * 60 * 1000;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
