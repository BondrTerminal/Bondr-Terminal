import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeploymentLaunchReadiness, DEPLOYMENT_ROUTE_ADAPTERS } from '../apps/web/lib/deployment-route-adapters.js';
import { buildIpfsMetadataReadiness, buildTokenMetadataJson } from '../apps/web/lib/ipfs-metadata-readiness.js';
import { buildJitoBundlePreview, buildJitoSendBundleBlockedResponse } from '../apps/web/lib/jito-relay-adapter.js';
import { buildPumpPortalCreatePreview } from '../apps/web/lib/pumpportal-deploy-readiness.js';
import { buildSniperExecutionReadiness, buildTaskExecutionReadiness } from '../apps/web/lib/sniper-task-readiness.js';
import { buildWalletSigningReadiness } from '../apps/web/lib/wallet-signing-readiness.js';
import type { Project, Wallet } from '../apps/web/lib/meridian-store.js';

const wallet: Wallet = {
  id: 'dev-wallet',
  role: 'dev wallet',
  address: '8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz',
  scope: 'global',
  groupId: 'operator-wallets',
  status: 'active',
  balanceSol: 0.1,
  purpose: 'launch dev wallet',
  custodyMode: 'watch-only'
};

const project: Project = {
  id: 'sda',
  name: 'sda',
  ticker: 'ASD',
  status: 'draft',
  launchPath: 'pump.fun',
  tokenMint: null,
  pool: null,
  metadata: {
    name: 'sda',
    symbol: 'ASD',
    description: 'test launch',
    imageUrl: '/api/projects/sda/asset-image?v=1',
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
    collectionWalletId: 'dev-wallet'
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
    walletPlan: [
      { walletId: 'dev-wallet', role: 'dev wallet', participate: true, executionPhase: 'dev', plannedBuySol: 0.01, maxBuySol: 0.01, maxSlippageBps: 100, takeProfitPercents: [35, 75, 150], stopLossPct: -18, trailingStopPct: 22, perTxSellCapPct: 25, cooldownSeconds: 60 },
      { walletId: 'bundle-wallet', role: 'bundle wallet', participate: true, executionPhase: 'bundle', plannedBuySol: 0, maxBuySol: 0, maxSlippageBps: 100, takeProfitPercents: [35, 75, 150], stopLossPct: -18, trailingStopPct: 22, perTxSellCapPct: 25, cooldownSeconds: 60 }
    ],
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
  deploymentState: { stage: 'configuration', ready: false, disabledReason: 'test disabled' },
  monitor: { holders: [], orders: [], positions: [], topTraders: [], devTokens: [] },
  moduleLinks: {
    deployment: '/deployment?project=sda',
    wallets: '/portfolio?view=wallets&project=sda',
    sniper: '/sniper?project=sda',
    dashboard: '/projects/sda',
    liquidity: '/liquidity?project=sda'
  }
};

const activation = {
  liveTradingEnabled: true,
  signingEnabled: true,
  broadcastEnabled: false,
  fundingBroadcastEnabled: false,
  deploymentEnabled: false,
  readinessLevel: 'signing-ready' as const,
  disabledReason: 'deployment gate closed',
  warnings: []
};

test('deployment route adapters keep live launch rails explicit', () => {
  assert.deepEqual(DEPLOYMENT_ROUTE_ADAPTERS.map((adapter) => adapter.id), [
    'pumpportal-create',
    'pumpportal-trade-local',
    'pumpportal-jito-bundle',
    'raydium-launchlab',
    'raydium-trade-api'
  ]);
  assert.ok(DEPLOYMENT_ROUTE_ADAPTERS.every((adapter) => adapter.blockedUntil.length > 0));
});

test('dev-wallet-only readiness blocks broadcast and exposes approval summary', () => {
  const readiness = buildDeploymentLaunchReadiness(project, [wallet], activation);
  assert.equal(readiness.mode, 'dev-wallet-only');
  assert.equal(readiness.broadcastReady, false);
  assert.equal(readiness.adapterRecommendation, 'pumpportal-create');
  assert.equal(readiness.approvalSummary.devWalletAddress, wallet.address);
  assert.equal(readiness.approvalSummary.maxDevBuySol, 0.01);
  assert.ok(readiness.blockers.includes('deployment-gate-closed'));
  assert.ok(readiness.blockers.includes('broadcast-gate-closed'));
  assert.equal(readiness.postLaunchRailVerification.every((rail) => rail.broadcastReady === false), true);
});

test('pumpportal create preview names IPFS and mint blockers without calling provider', () => {
  const preview = buildPumpPortalCreatePreview(project, [wallet], activation);
  assert.equal(preview.contract, 'bondr-pumpportal-create-preview-v1');
  assert.equal(preview.execution, 'preview-only-no-provider-call-no-signing-no-broadcast');
  assert.equal(preview.payloadPreview.action, 'create');
  assert.equal(preview.payloadPreview.publicKey, wallet.address);
  assert.equal(preview.payloadPreview.tokenMetadata.symbol, 'ASD');
  assert.ok(preview.blockers.includes('ipfs-provider-required') || preview.blockers.includes('ipfs-upload-needed'));
  assert.ok(preview.blockers.includes('client-mint-public-key-required'));
  assert.ok(preview.blockers.includes('deployment-gate-closed'));
  assert.equal(preview.safety.noProviderCall, true);
  assert.equal(preview.signerPreview.serverCustody, false);
});

test('pumpportal create preview becomes structurally ready when IPFS URI and mint are present', () => {
  const ipfsProject = {
    ...project,
    metadata: {
      ...project.metadata,
      imageUrl: 'ipfs://bafybeigdyrztkexample/image.png',
      metadataUri: 'ipfs://bafybeigdyrztkexample/metadata.json'
    }
  };
  const preview = buildPumpPortalCreatePreview(ipfsProject, [wallet], activation, { mintPublicKey: 'Mint111111111111111111111111111111111111111' });
  assert.equal(preview.status, 'ready-to-build-preview');
  assert.equal(preview.ipfs.status, 'ready');
  assert.equal(preview.payloadPreview.tokenMetadata.uri, 'ipfs://bafybeigdyrztkexample/metadata.json');
  assert.equal(preview.payloadPreview.mint, 'Mint111111111111111111111111111111111111111');
  assert.ok(preview.blockers.includes('deployment-gate-closed'));
  assert.ok(preview.blockers.includes('broadcast-gate-closed'));
});

test('ipfs metadata readiness validates token metadata without pinning', () => {
  const readiness = buildIpfsMetadataReadiness(project);
  assert.equal(readiness.contract, 'bondr-ipfs-metadata-readiness-v1');
  assert.equal(readiness.execution, 'readiness-only-no-ipfs-write');
  assert.equal(readiness.provider, 'pinata');
  assert.ok(readiness.blockers.includes('pinata-jwt-missing'));
  assert.equal(readiness.metadataJson.symbol, 'ASD');
});

test('token metadata json includes image and optional social extensions', () => {
  const metadata = buildTokenMetadataJson(project, 'ipfs://bafyimage');
  assert.equal(metadata.name, 'sda');
  assert.equal(metadata.symbol, 'ASD');
  assert.equal(metadata.image, 'ipfs://bafyimage');
  assert.equal(metadata.description, 'test launch');
});

test('jito bundle preview exposes signed payload policy blockers without submitting', () => {
  const preview = buildJitoBundlePreview({}, activation);
  assert.equal(preview.contract, 'bondr-jito-bundle-preview-v1');
  assert.equal(preview.execution, 'policy-preview-only-no-relay-submit');
  assert.ok(preview.blockers.includes('signed-transactions-missing'));
  assert.ok(preview.blockers.includes('expected-signers-missing'));
  assert.ok(preview.blockers.includes('expected-mint-missing'));
  assert.ok(preview.blockers.includes('simulation-proof-missing'));
  assert.ok(preview.blockers.includes('explicit-approval-missing'));
  assert.equal(preview.safety.noRelaySubmit, true);
});

test('jito bundle preview enforces tip cap and transaction count', () => {
  const preview = buildJitoBundlePreview({
    signedTransactions: ['tx1', 'tx2', 'tx3', 'tx4', 'tx5', 'tx6'],
    expectedSigners: [wallet.address],
    expectedMint: 'Mint111111111111111111111111111111111111111',
    tipLamports: 1_000_000_000,
    simulationProof: { ok: true },
    approvalId: 'approval-test'
  }, activation);
  assert.ok(preview.blockers.some((blocker) => blocker.includes('transaction-limit')));
  assert.ok(preview.blockers.includes('jito-tip-exceeds-cap'));
  assert.equal(preview.policy.tipLamports, 1_000_000_000);
});

test('jito send bundle response remains blocked until live implementation exists', () => {
  const result = buildJitoSendBundleBlockedResponse({
    signedTransactions: ['tx1'],
    expectedSigners: [wallet.address],
    expectedMint: 'Mint111111111111111111111111111111111111111',
    tipLamports: 1000,
    simulationProof: { ok: true },
    approvalId: 'approval-test'
  }, activation);
  assert.equal(result.status, 'blocked');
  assert.equal(result.execution, 'blocked-no-jito-relay-submit');
  assert.ok(result.blockers.includes('live-jito-submit-not-implemented'));
});

test('wallet signing readiness does not treat watch-only bundle wallets as executable', () => {
  const readiness = buildWalletSigningReadiness(project, [wallet]);
  assert.equal(readiness.contract, 'bondr-wallet-signing-readiness-v1');
  assert.equal(readiness.status, 'multi-wallet-blocked');
  assert.equal(readiness.serverCustody, false);
  assert.ok(readiness.blockers.includes('browser-signer-not-connected-or-not-proven'));
  assert.ok(readiness.blockers.includes('wallet-record-missing'));
  assert.equal(readiness.bundleSession.status, 'blocked');
  assert.deepEqual(readiness.bundleSession.requiredWalletIds, ['bundle-wallet']);
});

test('deployment readiness exposes shared wallet signing orchestration contract', () => {
  const readiness = buildDeploymentLaunchReadiness(project, [wallet], activation);
  assert.equal(readiness.signingOrchestration.contract, 'bondr-wallet-signing-readiness-v1');
  assert.equal(readiness.signingOrchestration.serverCustody, false);
  assert.equal(readiness.signingOrchestration.summary.participatingWallets, 2);
  assert.equal(readiness.signingOrchestration.bundleSession.missingCount, 1);
});

test('sniper readiness reports trigger, relay, and recovery blockers without execution', () => {
  const readiness = buildSniperExecutionReadiness(project, [wallet], activation);
  assert.equal(readiness.contract, 'bondr-sniper-execution-readiness-v1');
  assert.equal(readiness.execution, 'readiness-only-no-sniper-submit');
  assert.ok(readiness.blockers.includes('sniper-trigger-source-missing'));
  assert.ok(readiness.blockers.includes('broadcast-gate-closed'));
  assert.ok(readiness.blockers.includes('sniper-recovery-engine-missing'));
  assert.equal(readiness.safety.noAutonomousTrading, true);
});

test('task readiness blocks durable worker and fake-volume policy gaps', () => {
  const readiness = buildTaskExecutionReadiness(project, [wallet], activation);
  assert.equal(readiness.contract, 'bondr-task-execution-readiness-v1');
  assert.equal(readiness.execution, 'readiness-only-no-task-execution');
  assert.ok(readiness.blockers.includes('durable-task-worker-missing'));
  assert.ok(readiness.blockers.includes('anti-self-trade-policy-required'));
  assert.ok(readiness.blockers.includes('anti-fake-volume-policy-required'));
  assert.equal(readiness.safety.noAutonomousTrading, true);
  assert.equal(readiness.safety.noFakeVolume, true);
});
