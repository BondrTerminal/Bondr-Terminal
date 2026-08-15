import {
  allProjectFlow,
  eventsForProject,
  getProject,
  launchPreflight,
  portfolioWalletHref,
  projectFlow,
  readinessScore,
  walletBalanceSummary,
  walletsForGroup,
  type FlowSummary,
  type MeridianStore,
  type PreflightCheck,
  type LaunchConfig,
  type WalletPlanEntry,
  type Project,
  type ProjectEvent,
  type Wallet,
  type WalletActivity,
  type WalletGroup
} from './meridian-store';

export type SourceStatus = {
  status: 'ok' | 'partial' | 'unavailable' | 'modeled' | 'live-gated' | 'provider-limited';
  source: string;
  observedAt: string;
  note?: string | null;
};

export type WalletBalanceView = {
  walletId: string;
  address: string;
  role: string;
  scope: Wallet['scope'];
  groupId: string;
  modeledSol: number;
  liveSol: number | null;
  balanceStatus: 'modeled' | 'live' | 'provider-limited' | 'unavailable';
  purpose: string;
};

export type FundingReadiness = {
  budgetSol: number;
  feeReserveSol: number;
  liquiditySol: number;
  devBuySol: number;
  unassignedSol: number;
  modeledAvailableSol: number;
  liveAvailableSol: number | null;
  fundingGapSol: number;
  status: 'ready' | 'review' | 'blocked';
  note: string;
};

export type DeploymentReadiness = {
  stage: string;
  ready: boolean;
  readinessScore: number;
  readyChecks: number;
  totalChecks: number;
  missing: string[];
  disabledReason: string;
};

export type PortfolioSummary = {
  flow30d: FlowSummary;
  accountingSource: 'meridian-flow-events';
  note: string;
};

export type TerminalHandoff = {
  href: string;
  mint: string | null;
  projectId: string;
  walletIds: string[];
  status: 'ready' | 'missing-mint' | 'missing-wallets';
  note: string;
};

export type MeridianProjectContext = {
  contract: 'meridian-project-context-v1';
  observedAt: string;
  project: Project;
  walletGroup: WalletGroup | null;
  wallets: Wallet[];
  balances: {
    modeled: WalletBalanceView[];
    live: WalletBalanceView[] | null;
    sourceStatus: SourceStatus;
  };
  deployment: DeploymentReadiness;
  fundingPlan: FundingReadiness;
  launchConfig: LaunchConfig;
  portfolio: PortfolioSummary;
  terminal: TerminalHandoff;
  preflight: PreflightCheck[];
  blockers: string[];
  nextActions: Array<{ label: string; href: string; owner: PreflightCheck['owner']; status: PreflightCheck['status'] }>;
  events: ProjectEvent[];
  walletActivity: WalletActivity[];
  sourceStatus: Record<string, SourceStatus>;
};

export type MeridianHubContext = {
  contract: 'meridian-hub-context-v1';
  observedAt: string;
  activeProjectId: string | null;
  projects: MeridianProjectContext[];
  globalWallets: Wallet[];
  walletGroups: WalletGroup[];
  totals: {
    projectCount: number;
    activeWalletCount: number;
    archivedWalletCount: number;
    modeledSol: number;
    flow30d: FlowSummary;
  };
  sourceStatus: Record<string, SourceStatus>;
};


function defaultWalletPlan(wallets: Wallet[]): WalletPlanEntry[] {
  return wallets.map((wallet, index) => ({
    walletId: wallet.id,
    role: wallet.role,
    participate: index < 4,
    plannedBuySol: index === 0 ? 0.25 : index < 4 ? 0.05 : 0,
    maxBuySol: index === 0 ? 0.4 : index < 4 ? 0.1 : 0,
    maxSlippageBps: 500,
    takeProfitPercents: [35, 75, 150],
    stopLossPct: -18,
    trailingStopPct: 22,
    perTxSellCapPct: 25,
    cooldownSeconds: 60
  }));
}

function defaultLaunchConfig(project: Project, wallets: Wallet[] = []): LaunchConfig {
  return {
    route: {
      platform: project.launchPath === 'raydium' ? 'raydium' : 'pump',
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
    walletPlan: defaultWalletPlan(wallets),
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

function normalizedProject(project: Project): Project {
  return {
    ...project,
    moduleLinks: {
      ...project.moduleLinks,
      wallets: portfolioWalletHref(project.id)
    }
  };
}

function normalizedLaunchConfig(project: Project, wallets: Wallet[] = []): LaunchConfig {
  const fallback = defaultLaunchConfig(project, wallets);
  const saved = project.launchConfig;
  const savedById = new Map((saved?.walletPlan ?? []).map((entry) => [entry.walletId, entry]));
  return {
    ...fallback,
    ...(saved ?? {}),
    route: { ...fallback.route, ...(saved?.route ?? {}) },
    walletPlan: wallets.length ? wallets.map((wallet) => ({ ...(fallback.walletPlan.find((entry) => entry.walletId === wallet.id)!), ...(savedById.get(wallet.id) ?? {}), walletId: wallet.id, role: wallet.role })) : (saved?.walletPlan ?? fallback.walletPlan),
    devWalletRules: { ...fallback.devWalletRules, ...(saved?.devWalletRules ?? {}) }
  };
}

function source(status: SourceStatus['status'], sourceName: string, observedAt: string, note?: string | null): SourceStatus {
  return { status, source: sourceName, observedAt, note: note ?? null };
}

function balanceRows(wallets: Wallet[]): WalletBalanceView[] {
  return wallets.map((wallet) => ({
    walletId: wallet.id,
    address: wallet.address,
    role: wallet.role,
    scope: wallet.scope,
    groupId: wallet.groupId,
    modeledSol: wallet.balanceSol,
    liveSol: null,
    balanceStatus: 'modeled',
    purpose: wallet.purpose
  }));
}

function fundingReadiness(project: Project, wallets: Wallet[]): FundingReadiness {
  const modeledAvailableSol = wallets.reduce((sum, wallet) => sum + wallet.balanceSol, 0);
  const unassignedSol = Math.max(0, project.fundingPlan.budgetSol - project.fundingPlan.feeReserveSol - project.fundingPlan.liquiditySol - project.fundingPlan.devBuySol);
  const requiredSol = project.fundingPlan.budgetSol;
  const fundingGapSol = Math.max(0, requiredSol - modeledAvailableSol);
  const status: FundingReadiness['status'] = fundingGapSol <= 0 && requiredSol > 0 ? 'ready' : requiredSol > 0 && wallets.length > 0 ? 'review' : 'blocked';
  return {
    budgetSol: project.fundingPlan.budgetSol,
    feeReserveSol: project.fundingPlan.feeReserveSol,
    liquiditySol: project.fundingPlan.liquiditySol,
    devBuySol: project.fundingPlan.devBuySol,
    unassignedSol,
    modeledAvailableSol,
    liveAvailableSol: null,
    fundingGapSol,
    status,
    note: status === 'ready'
      ? 'Modeled wallet balances meet or exceed the planned launch budget. Confirm live RPC balances before any signed action.'
      : status === 'review'
        ? 'Funding plan exists, but modeled balances do not fully cover the launch budget or require live-balance confirmation.'
        : 'Funding plan or wallet assignment is incomplete.'
  };
}

function terminalHandoff(project: Project, wallets: Wallet[]): TerminalHandoff {
  const href = project.tokenMint ? `/sniper?mint=${project.tokenMint}&project=${project.id}` : `/sniper?project=${project.id}`;
  const status: TerminalHandoff['status'] = !project.tokenMint ? 'missing-mint' : wallets.length ? 'ready' : 'missing-wallets';
  return {
    href,
    mint: project.tokenMint,
    projectId: project.id,
    walletIds: wallets.map((wallet) => wallet.id),
    status,
    note: status === 'ready'
      ? 'Terminal should use this project wallet group and token mint.'
      : status === 'missing-mint'
        ? 'Terminal can load the project wallet group, but token-specific monitoring needs a mint.'
        : 'Attach wallets before terminal handoff.'
  };
}

export function buildMeridianProjectContext(project: Project, store: MeridianStore, observedAt = new Date().toISOString()): MeridianProjectContext {
  const currentProject = normalizedProject(project);
  const walletGroup = store.walletGroups.find((group) => group.id === currentProject.walletGroupId) ?? null;
  const wallets = walletsForGroup(currentProject.walletGroupId, store).filter((wallet) => !wallet.archived);
  const readiness = readinessScore(currentProject, store);
  const preflight = launchPreflight(currentProject, store);
  const blockers = preflight.filter((check) => check.status === 'blocked').map((check) => `${check.label}: ${check.detail}`);
  const nextActions = preflight.filter((check) => check.status !== 'ready').slice(0, 5).map((check) => ({ label: check.label, href: check.href, owner: check.owner, status: check.status }));
  const activityIds = new Set(wallets.map((wallet) => wallet.id));
  const walletActivity = (store.walletActivity ?? []).filter((event) => activityIds.has(event.walletId)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const modeledBalances = balanceRows(wallets);

  return {
    contract: 'meridian-project-context-v1',
    observedAt,
    project: currentProject,
    walletGroup,
    wallets,
    balances: {
      modeled: modeledBalances,
      live: null,
      sourceStatus: source('modeled', 'meridian-store.wallets.balanceSol', observedAt, 'Modeled balances are planning values shared across Deployment, Terminal, Portfolio, and Wallet Ops; they are not live funds. Hydrate live RPC balances before signed execution.')
    },
    deployment: {
      stage: currentProject.deploymentState.stage,
      ready: currentProject.deploymentState.ready,
      readinessScore: readiness.score,
      readyChecks: readiness.ready,
      totalChecks: readiness.total,
      missing: readiness.missing,
      disabledReason: currentProject.deploymentState.disabledReason
    },
    fundingPlan: fundingReadiness(currentProject, wallets),
    launchConfig: normalizedLaunchConfig(currentProject, wallets),
    portfolio: {
      flow30d: projectFlow(currentProject.id, store),
      accountingSource: 'meridian-flow-events',
      note: 'Portfolio accounting is currently derived from Meridian flow events plus portfolio snapshot enrichment where available.'
    },
    terminal: terminalHandoff(currentProject, wallets),
    preflight,
    blockers,
    nextActions,
    events: eventsForProject(project.id, store),
    walletActivity,
    sourceStatus: {
      project: source('ok', 'meridian-store.projects', observedAt, 'Canonical project object.'),
      walletGroup: source(walletGroup ? 'ok' : 'unavailable', 'meridian-store.walletGroups', observedAt, walletGroup ? 'Wallet group attached.' : 'Project wallet group missing.'),
      balances: source('modeled', 'meridian-store.wallets.balanceSol', observedAt, 'Live balance hydration is intentionally separate from modeled planning balances; modeled values are not live funds.'),
      launchConfig: source(project.launchConfig ? 'ok' : 'modeled', 'meridian-store.projects.launchConfig', observedAt, project.launchConfig ? 'Persisted launch configuration.' : 'Default launch configuration synthesized until saved.'),
      execution: source('live-gated', 'deployment/wallet/terminal engines', observedAt, 'Execution remains disabled until live gates, browser signing, and explicit confirmations are enabled.')
    }
  };
}

export function resolveMeridianProjectContextId(projectId: string | null | undefined, store: MeridianStore) {
  const requested = projectId?.trim();
  if (!requested) return undefined;
  return getProject(requested, store) ?? store.projects.find((project) => project.walletGroupId === requested);
}

export function buildMeridianHubContext(projectId: string | null | undefined, store: MeridianStore): MeridianHubContext {
  const observedAt = new Date().toISOString();
  const selectedProject = resolveMeridianProjectContextId(projectId, store);
  const projects = (selectedProject ? [selectedProject] : store.projects).map((project) => buildMeridianProjectContext(project, store, observedAt));
  const balanceSummary = walletBalanceSummary(store);
  return {
    contract: 'meridian-hub-context-v1',
    observedAt,
    activeProjectId: selectedProject?.id ?? null,
    projects,
    globalWallets: balanceSummary.globalWallets,
    walletGroups: store.walletGroups,
    totals: {
      projectCount: projects.length,
      activeWalletCount: balanceSummary.activeWallets.length,
      archivedWalletCount: balanceSummary.archivedWallets.length,
      modeledSol: balanceSummary.totalStoredSol,
      flow30d: allProjectFlow(store)
    },
    sourceStatus: {
      store: source('ok', 'meridian-store', observedAt, 'Shared Meridian project/wallet source.'),
      balances: source('modeled', 'meridian-store + optional chain hydration', observedAt, 'Use modeled balances for planning only; verify live balances before signed execution.'),
      execution: source('live-gated', 'mutation-safety/live gates', observedAt, 'No server credential custody or signed execution from this context contract.')
    }
  };
}
