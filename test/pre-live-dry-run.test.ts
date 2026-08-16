import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMeridianProjectContext } from '../apps/web/lib/meridian-context.js';
import { buildPreLiveDryRun } from '../apps/web/lib/pre-live-dry-run.js';
import type { MeridianStore, Project, Wallet } from '../apps/web/lib/meridian-store.js';

const LIVE_ENV_KEYS = [
  'LIVE_TRADING_ENABLED',
  'LIVE_BETA_SIGNING_ENABLED',
  'LIVE_BETA_BROADCAST_ENABLED',
  'LIVE_BETA_FUNDING_BROADCAST_ENABLED',
  'LIVE_BETA_FUNDING_BROADCAST_ARMED',
  'LIVE_DEPLOYMENT_ENABLED'
];

function withLiveEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map(LIVE_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of LIVE_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const wallet: Wallet = {
  id: 'wallet-1',
  role: 'browser signer watch-only',
  address: '8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz',
  scope: 'global',
  groupId: 'operator-wallets',
  status: 'active',
  balanceSol: 0.02,
  purpose: 'test wallet',
  custodyMode: 'watch-only'
};

const project: Project = {
  id: 'project-1',
  name: 'Test Project',
  ticker: 'TEST',
  status: 'draft',
  launchPath: 'pump.fun',
  tokenMint: null,
  pool: null,
  metadata: {
    name: 'Test Project',
    symbol: 'TEST',
    description: 'Test launch',
    imageUrl: '',
    website: '',
    twitter: '',
    telegram: ''
  },
  walletGroupId: 'operator-wallets',
  fundingPlan: {
    budgetSol: 0.01,
    feeReserveSol: 0,
    liquiditySol: 0,
    devBuySol: 0.01,
    collectionWalletId: 'wallet-1'
  },
  launchConfig: {
    route: {
      platform: 'pump',
      quoteToken: 'SOL',
      tokenMode: 'classic',
      buyMode: 'snipe',
      initialBuySol: 0.01,
      slippageBps: 100,
      priorityFeeMode: 'manual',
      graduationMonitor: 'pump.fun',
      raydiumLiquiditySol: 0,
      raydiumWithheldTokenPct: 0,
      raydiumWithheldTokenAmount: 0,
      burnLiquidity: false
    },
    walletPlan: [{
      walletId: 'wallet-1',
      role: 'dev wallet',
      participate: true,
      executionPhase: 'dev',
      plannedBuySol: 0.01,
      maxBuySol: 0.01,
      maxSlippageBps: 100,
      takeProfitPercents: [35, 75, 150],
      stopLossPct: -18,
      trailingStopPct: 22,
      perTxSellCapPct: 25,
      cooldownSeconds: 60
    }],
    devWalletRules: {
      controlledWalletRole: 'dev wallet',
      maxInitialBuySol: 0.01,
      maxSlippageBps: 100,
      maxPriorityFeeSol: 0.001,
      perTxSellCapPct: 25,
      cooldownSeconds: 60,
      takeProfitPercents: [35, 75, 150],
      stopLossPct: -18,
      trailingStopPct: 22,
      trailingActivationPct: 60,
      maxDevExposureSol: 0.01,
      maxDevSupplyPct: 8
    }
  },
  deploymentState: {
    stage: 'configuration',
    ready: false,
    disabledReason: 'test disabled'
  },
  monitor: {
    holders: [],
    orders: [],
    positions: [],
    topTraders: [],
    devTokens: []
  },
  moduleLinks: {
    deployment: '/deployment?project=project-1',
    wallets: '/wallets?project=project-1',
    sniper: '/sniper?project=project-1',
    dashboard: '/projects/project-1',
    liquidity: '/liquidity?project=project-1'
  }
};

const store: MeridianStore = {
  projects: [project],
  wallets: [wallet],
  walletGroups: [{ id: 'operator-wallets', name: 'Operator wallets', scope: 'global', walletIds: ['wallet-1'] }],
  flowEvents: [],
  eventLog: [],
  walletActivity: []
};

test('pre-live dry-run warning follows effective funding broadcast gate', () => {
  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_BETA_SIGNING_ENABLED: 'true', LIVE_BETA_FUNDING_BROADCAST_ENABLED: 'true' }, () => {
    const result = buildPreLiveDryRun(project, store);
    assert.equal(result.status, 'pass');
    assert.equal(result.warnings.includes('funding-broadcast-gate-enabled-close-before-deployment-review'), false);
  });

  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_BETA_SIGNING_ENABLED: 'true', LIVE_BETA_FUNDING_BROADCAST_ENABLED: 'true', LIVE_BETA_FUNDING_BROADCAST_ARMED: 'true' }, () => {
    const result = buildPreLiveDryRun(project, store);
    assert.equal(result.status, 'warn');
    assert.equal(result.warnings.includes('funding-broadcast-gate-enabled-close-before-deployment-review'), true);
  });
});

test('deployment context normalizes wallet links and launch route defaults', () => {
  const legacyProject = structuredClone(project);
  legacyProject.launchConfig = {
    ...legacyProject.launchConfig!,
    route: {
      initialBuySol: 0.01,
      slippageBps: 100,
      priorityFeeMode: 'manual',
      graduationMonitor: 'pump.fun',
      raydiumLiquiditySol: 0,
      raydiumWithheldTokenPct: 0,
      raydiumWithheldTokenAmount: 0,
      burnLiquidity: false
    }
  };

  const context = buildMeridianProjectContext(legacyProject, { ...store, projects: [legacyProject] }, '2026-08-14T20:30:00.000Z');
  assert.equal(context.project.moduleLinks.wallets, '/portfolio?view=wallets&project=project-1');
  assert.equal(context.launchConfig.route.platform, 'pump');
  assert.equal(context.launchConfig.route.quoteToken, 'SOL');
  assert.equal(context.launchConfig.route.tokenMode, 'classic');
  assert.equal(context.launchConfig.route.buyMode, 'snipe');
});

test('deployment context upgrades partial durable project rows without crashing', () => {
  const partialProject = {
    id: 'partial-project',
    name: 'Partial Project',
    ticker: 'PART',
    status: 'draft',
    walletGroupId: 'operator-wallets',
    launchConfig: { walletPlan: 'legacy-bad-shape' }
  } as unknown as Project;

  const context = buildMeridianProjectContext(partialProject, { ...store, projects: [partialProject] }, '2026-08-16T06:00:00.000Z');
  assert.equal(context.project.id, 'partial-project');
  assert.equal(context.project.metadata.symbol, 'PART');
  assert.equal(context.project.fundingPlan.budgetSol, 0);
  assert.equal(context.project.deploymentState.stage, 'configuration');
  assert.equal(context.project.moduleLinks.deployment, '/deployment?project=partial-project');
  assert.equal(context.project.moduleLinks.wallets, '/portfolio?view=wallets&project=partial-project');
  assert.equal(context.launchConfig.route.platform, 'pump');
  assert.ok(Array.isArray(context.launchConfig.walletPlan));
});

test('raydium pre-live dry-run stays blocked until config, LP proof, and burn simulation exist', () => {
  const raydiumProject = structuredClone(project);
  raydiumProject.launchPath = 'raydium';
  raydiumProject.launchConfig = {
    ...raydiumProject.launchConfig!,
    route: {
      ...raydiumProject.launchConfig!.route,
      platform: 'raydium',
      raydiumLiquiditySol: 1,
      raydiumWithheldTokenPct: 10,
      raydiumWithheldTokenAmount: 1000000,
      burnLiquidity: true
    }
  };

  const result = buildPreLiveDryRun(raydiumProject, { ...store, projects: [raydiumProject] });
  assert.equal(result.status, 'fail');
  assert.equal(result.routeSummary.path, 'raydium');
  assert.ok(result.blockers.includes('raydium-cpmm-config-id-required'));
  assert.ok(result.blockers.includes('raydium-lp-simulation-proof-required'));
  assert.ok(result.blockers.includes('verified-lp-token-account-required'));
  assert.ok(!result.blockers.includes('raydium-original-lp-builder-missing'));
  assert.ok(!result.blockers.includes('lp-burn-transaction-builder-missing'));
  assert.ok(result.blockers.includes('raydium-lp-burn-simulation-proof-missing'));
});
