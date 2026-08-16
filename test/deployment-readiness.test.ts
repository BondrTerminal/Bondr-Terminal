import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import test from 'node:test';
import { buildDeploymentLaunchReadiness, DEPLOYMENT_ROUTE_ADAPTERS } from '../apps/web/lib/deployment-route-adapters.js';
import { buildDeploymentEngineReadiness } from '../apps/web/lib/deployment-engine-readiness.js';
import { buildExecutionRecoveryReadiness } from '../apps/web/lib/execution-recovery-readiness.js';
import { buildIpfsMetadataReadiness, buildTokenMetadataJson, pinataJwt } from '../apps/web/lib/ipfs-metadata-readiness.js';
import { buildJitoBundlePreview, buildJitoSendBundleBlockedResponse, getJitoBundleStatus, sendJitoBundle } from '../apps/web/lib/jito-relay-adapter.js';
import { buildPumpPortalCreatePreview, buildPumpPortalCreateTransaction } from '../apps/web/lib/pumpportal-deploy-readiness.js';
import { buildSniperExecutionReadiness, buildSniperTriggerPreview, buildTaskExecutionReadiness, buildTaskQueuePreview } from '../apps/web/lib/sniper-task-readiness.js';
import { buildWalletSigningReadiness } from '../apps/web/lib/wallet-signing-readiness.js';
import { buildShadowExecutionPacket } from '../apps/web/lib/execution-shadow-plan.js';
import { normalizeDeploymentLaunchPath, normalizeDeploymentRoutePlatform, routePlatformForLaunchPath } from '../apps/web/lib/deployment-launch-path.js';
import { buildLpBurnTransaction } from '../apps/web/lib/lp-burn-transaction-builder.js';
import { normalizeLaunchReceipt } from '../apps/web/lib/launch-receipts.js';
import type { Project, Wallet } from '../apps/web/lib/meridian-store.js';
import { PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { POST as deploymentEnginePost } from '../apps/web/app/api/deployment-engine/route.js';
import { POST as pumpBuildCreatePost } from '../apps/web/app/api/deployment/pumpportal/build-create/route.js';

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

const validMintPublicKey = 'Mint111111111111111111111111111111111111111';

function ipfsReadyProject(): Project {
  return {
    ...project,
    metadata: {
      ...project.metadata,
      imageUrl: 'ipfs://bafybeigdyrztkexample/image.png',
      metadataUri: 'ipfs://bafybeigdyrztkexample/metadata.json'
    }
  };
}

function serializedProviderTransaction(args: { includeMintSigner: boolean }) {
  const dev = new PublicKey(wallet.address);
  const mint = new PublicKey(validMintPublicKey);
  const instruction = new TransactionInstruction({
    programId: SystemProgram.programId,
    keys: [
      { pubkey: dev, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: args.includeMintSigner, isWritable: true }
    ],
    data: Buffer.alloc(0)
  });
  const message = new TransactionMessage({
    payerKey: dev,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [instruction]
  }).compileToV0Message();
  return new VersionedTransaction(message).serialize();
}

async function withProviderBuild<T>(body: (calls: { count: number }) => Promise<T>, bytes = serializedProviderTransaction({ includeMintSigner: true })) {
  const previousEnabled = process.env.PUMPPORTAL_BUILD_ENABLED;
  const previousUrl = process.env.PUMPPORTAL_TRADE_LOCAL_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousLiveStoreDatabaseUrl = process.env.LIVE_STORE_DATABASE_URL;
  const previousWalletStoreDatabaseUrl = process.env.WALLET_STORE_DATABASE_URL;
  const previousFetch = globalThis.fetch;
  const liveStorePath = new URL('../data/terminal-live-store.json', import.meta.url);
  const hadLiveStore = existsSync(liveStorePath);
  const previousLiveStore = hadLiveStore ? readFileSync(liveStorePath, 'utf8') : null;
  const calls = { count: 0 };
  try {
    process.env.PUMPPORTAL_BUILD_ENABLED = 'true';
    process.env.PUMPPORTAL_TRADE_LOCAL_URL = 'https://example.invalid/pumpportal-test';
    delete process.env.DATABASE_URL;
    delete process.env.LIVE_STORE_DATABASE_URL;
    delete process.env.WALLET_STORE_DATABASE_URL;
    globalThis.fetch = (async () => {
      calls.count += 1;
      return new Response(bytes, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    }) as typeof fetch;
    return await body(calls);
  } finally {
    if (previousEnabled === undefined) delete process.env.PUMPPORTAL_BUILD_ENABLED;
    else process.env.PUMPPORTAL_BUILD_ENABLED = previousEnabled;
    if (previousUrl === undefined) delete process.env.PUMPPORTAL_TRADE_LOCAL_URL;
    else process.env.PUMPPORTAL_TRADE_LOCAL_URL = previousUrl;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousLiveStoreDatabaseUrl === undefined) delete process.env.LIVE_STORE_DATABASE_URL;
    else process.env.LIVE_STORE_DATABASE_URL = previousLiveStoreDatabaseUrl;
    if (previousWalletStoreDatabaseUrl === undefined) delete process.env.WALLET_STORE_DATABASE_URL;
    else process.env.WALLET_STORE_DATABASE_URL = previousWalletStoreDatabaseUrl;
    if (hadLiveStore && previousLiveStore !== null) {
      mkdirSync(dirname(liveStorePath.pathname), { recursive: true });
      writeFileSync(liveStorePath, previousLiveStore);
    } else {
      rmSync(new URL('../data', import.meta.url), { recursive: true, force: true });
    }
    globalThis.fetch = previousFetch;
  }
}

async function withProviderFailure<T>(body: (calls: { count: number }) => Promise<T>) {
  const previousEnabled = process.env.PUMPPORTAL_BUILD_ENABLED;
  const previousUrl = process.env.PUMPPORTAL_TRADE_LOCAL_URL;
  const previousFetch = globalThis.fetch;
  const calls = { count: 0 };
  try {
    process.env.PUMPPORTAL_BUILD_ENABLED = 'true';
    process.env.PUMPPORTAL_TRADE_LOCAL_URL = 'https://example.invalid/pumpportal-test';
    globalThis.fetch = (async () => {
      calls.count += 1;
      return new Response('Bad Request', {
        status: 400,
        statusText: "Cannot read properties of undefined (reading 'toBuffer')",
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }) as typeof fetch;
    return await body(calls);
  } finally {
    if (previousEnabled === undefined) delete process.env.PUMPPORTAL_BUILD_ENABLED;
    else process.env.PUMPPORTAL_BUILD_ENABLED = previousEnabled;
    if (previousUrl === undefined) delete process.env.PUMPPORTAL_TRADE_LOCAL_URL;
    else process.env.PUMPPORTAL_TRADE_LOCAL_URL = previousUrl;
    globalThis.fetch = previousFetch;
  }
}

test('deployment route adapters keep live launch rails explicit', () => {
  assert.deepEqual(DEPLOYMENT_ROUTE_ADAPTERS.map((adapter) => adapter.id), [
    'pumpportal-create',
    'pumpportal-trade-local',
    'pumpportal-jito-bundle',
    'raydium-original-lp-burn'
  ]);
  assert.ok(DEPLOYMENT_ROUTE_ADAPTERS.every((adapter) => adapter.blockedUntil.length > 0));
  const pump = DEPLOYMENT_ROUTE_ADAPTERS.find((adapter) => adapter.id === 'pumpportal-create');
  const raydium = DEPLOYMENT_ROUTE_ADAPTERS.find((adapter) => adapter.id === 'raydium-original-lp-burn');
  assert.equal(pump?.completionStatus, 'rehearsal-ready');
  assert.equal(pump?.builderStatus, 'provider-preview-builder-present');
  assert.equal(raydium?.supportLevel, 'blocked');
  assert.equal(raydium?.completionStatus, 'mapped-not-developed');
  assert.equal(raydium?.builderStatus, 'builder-missing');
});

test('deployment launch path normalization only allows Pump.fun and Raydium', () => {
  assert.equal(normalizeDeploymentLaunchPath('pump.fun'), 'pump.fun');
  assert.equal(normalizeDeploymentLaunchPath('raydium'), 'raydium');
  assert.equal(normalizeDeploymentLaunchPath('bonk'), 'pump.fun');
  assert.equal(normalizeDeploymentLaunchPath('meteora'), 'pump.fun');
  assert.equal(normalizeDeploymentLaunchPath('custom'), 'pump.fun');
  assert.equal(normalizeDeploymentRoutePlatform('pump'), 'pump');
  assert.equal(normalizeDeploymentRoutePlatform('raydium'), 'raydium');
  assert.equal(normalizeDeploymentRoutePlatform('bonk'), 'pump');
  assert.equal(routePlatformForLaunchPath('raydium'), 'raydium');
  assert.equal(routePlatformForLaunchPath('meteora'), 'pump');
});

test('deployment editor exposes Pump.fun route options as saveable form controls', () => {
  const source = readFileSync(new URL('../apps/web/app/deployment/components/LaunchConfigEditor.tsx', import.meta.url), 'utf8');
  for (const control of [
    'name="route.platform"',
    'value={platform.value}',
    'launchRouteTabsPanel',
    'launchRouteTabButton',
    'launch-path-panel-pump',
    'name="route.quoteToken"',
    'name="route.tokenMode"',
    'name="route.buyMode"',
    'name="route.initialBuySol"',
    'name="route.slippageBps"',
    'name="route.priorityFeeMode"',
    'name="route.graduationMonitor"'
  ]) {
    assert.ok(source.includes(control), `missing launch option control ${control}`);
  }
  assert.ok(source.includes('rehearsal-ready'));
  assert.ok(source.includes('PumpPortal bonding-curve launch rehearsal'));
});

test('deployment editor exposes Raydium options but marks route not developed', () => {
  const source = readFileSync(new URL('../apps/web/app/deployment/components/LaunchConfigEditor.tsx', import.meta.url), 'utf8');
  for (const control of [
    'launch-path-panel-raydium',
    'raydiumBuilderChecklist',
    'name="route.raydiumLiquiditySol"',
    'name="route.raydiumWithheldTokenPct"',
    'name="route.raydiumWithheldTokenAmount"',
    'name="route.burnLiquidity"'
  ]) {
    assert.ok(source.includes(control), `missing Raydium option control ${control}`);
  }
  assert.ok(source.includes('not-developed'));
  assert.ok(source.includes('builder-missing'));
  assert.ok(source.includes('Raydium is not launch-developed yet.'));
});

test('dev-wallet-only readiness blocks broadcast and exposes approval summary', () => {
  const readiness = buildDeploymentLaunchReadiness(project, [wallet], activation);
  assert.equal(readiness.mode, 'dev-wallet-only');
  assert.equal(readiness.broadcastReady, false);
  assert.equal(readiness.adapterRecommendation, 'pumpportal-create');
  assert.equal(readiness.routeCompleteness.platform, 'pump');
  assert.equal(readiness.routeCompleteness.status, 'rehearsal-ready');
  assert.equal(readiness.routeCompleteness.developed, true);
  assert.equal(readiness.routeCompleteness.adapterId, 'pumpportal-create');
  assert.equal(readiness.routeCompleteness.builderStatus, 'provider-preview-builder-present');
  assert.ok(readiness.routeCompleteness.blockers.includes('ipfs-provider-required') || readiness.routeCompleteness.blockers.includes('ipfs-upload-needed'));
  assert.equal(readiness.approvalSummary.devWalletAddress, wallet.address);
  assert.equal(readiness.approvalSummary.maxDevBuySol, 0.01);
  assert.ok(readiness.blockers.includes('deployment-gate-closed'));
  assert.ok(readiness.blockers.includes('broadcast-gate-closed'));
  assert.ok(readiness.intentionalLiveGateBlockers.includes('deployment-gate-closed'));
  assert.ok(readiness.intentionalLiveGateBlockers.includes('broadcast-gate-closed'));
  assert.ok(readiness.rehearsalBlockers.includes('ipfs-metadata-uri-missing'));
  assert.equal(readiness.rehearsalStatus, 'blocked');
  assert.equal(readiness.postLaunchRailVerification.every((rail) => rail.broadcastReady === false), true);
});

test('raydium route readiness recommends original LP burn adapter', () => {
  const raydiumProject = structuredClone(project);
  raydiumProject.launchPath = 'raydium';
  raydiumProject.launchConfig = {
    ...raydiumProject.launchConfig!,
    route: { ...raydiumProject.launchConfig!.route, platform: 'raydium', burnLiquidity: true, raydiumLiquiditySol: 1 }
  };
  const readiness = buildDeploymentLaunchReadiness(raydiumProject, [wallet], activation);
  assert.equal(readiness.adapterRecommendation, 'raydium-original-lp-burn');
  assert.equal(readiness.routeCompleteness.platform, 'raydium');
  assert.equal(readiness.routeCompleteness.status, 'not-developed');
  assert.equal(readiness.routeCompleteness.developed, false);
  assert.equal(readiness.routeCompleteness.builderStatus, 'builder-missing');
  assert.equal(readiness.raydiumLaunchReadiness.contract, 'bondr-raydium-launch-readiness-v1');
  assert.equal(readiness.raydiumLaunchReadiness.selected, true);
  assert.equal(readiness.raydiumLaunchReadiness.status, 'builder-missing');
  assert.equal(readiness.raydiumLaunchReadiness.developed, false);
  assert.ok(readiness.raydiumLaunchReadiness.missingBuilderIds.includes('raydium-original-lp-builder'));
  assert.ok(!readiness.raydiumLaunchReadiness.missingBuilderIds.includes('lp-burn-transaction-builder'));
  assert.ok(readiness.raydiumLaunchReadiness.gatedBuilderIds.includes('lp-burn-transaction-builder'));
  assert.ok(readiness.raydiumLaunchReadiness.blockers.includes('verified-lp-token-account-required'));
  assert.deepEqual(readiness.routeCompleteness.missingBuilders, [
    'raydium-original-lp-builder',
    'lp-token-account-derivation',
    'lp-burn-simulation-proof'
  ]);
  assert.deepEqual(readiness.routeCompleteness.gatedBuilders, ['lp-burn-transaction-builder']);
  assert.equal(readiness.approvalSummary.launchVenue, 'raydium');
});

test('deployment engine readiness exposes token mint builder as implemented but gate-closed', () => {
  const engines = buildDeploymentEngineReadiness(project, [wallet], activation);
  assert.equal(engines.contract, 'bondr-deployment-engine-readiness-v1');
  assert.equal(engines.tokenMint.contract, 'bondr-token-mint-engine-readiness-v1');
  assert.equal(engines.tokenMint.status, 'deployment-disabled');
  assert.equal(engines.tokenMint.implementationStatus, 'builder-implemented');
  assert.deepEqual(engines.tokenMint.requiredInputs, ['payer', 'mint', 'decimals', 'initialSupply', 'freezeAuthority?']);
  assert.equal(engines.tokenMint.requiredSigners.payer, wallet.address);
  assert.equal(engines.tokenMint.requiredSigners.clientMintKeypair, 'required-client-side');
  assert.equal(engines.tokenMint.requiredSigners.serverSigner, false);
  assert.equal(engines.tokenMint.unsignedBuild.availableNow, false);
  assert.ok(engines.tokenMint.blockers.includes('deployment-gate-closed'));
  assert.equal(engines.tokenMint.safety.noPrivateKeys, true);
});

test('deployment engine POST does not build a mint transaction while deployment gate is closed', async () => {
  const response = await deploymentEnginePost(new Request('https://bondr.test/api/deployment-engine', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      operation: 'create-spl-token',
      payer: wallet.address,
      mint: validMintPublicKey,
      decimals: 6,
      initialSupply: 1000
    })
  }));
  const payload = await response.json() as { status: string; execution: string; transactionBase64?: string; readiness?: { implementationStatus?: string; status?: string } };
  assert.equal(response.status, 403);
  assert.equal(payload.status, 'blocked');
  assert.equal(payload.execution, 'deployment-disabled-no-transaction-built');
  assert.equal(payload.transactionBase64, undefined);
  assert.equal(payload.readiness?.implementationStatus, 'builder-implemented');
  assert.equal(payload.readiness?.status, 'deployment-disabled');
});

test('deployment engine launch bundle readiness models legs, caps, signing order, and anti-abuse checks', () => {
  const engines = buildDeploymentEngineReadiness(project, [wallet], activation);
  assert.equal(engines.launchBundle.contract, 'bondr-launch-bundle-engine-readiness-v1');
  assert.equal(engines.launchBundle.status, 'rehearsal-contract-ready');
  assert.equal(engines.launchBundle.implementationStatus, 'rehearsal-contract-only');
  assert.equal(engines.launchBundle.execution, 'preflight-only-no-jito-submit-no-broadcast');
  assert.deepEqual(engines.launchBundle.legs.map((leg) => leg.id), ['create', 'dev-buy', 'bundle-buys', 'sniper-rails', 'task-rails']);
  assert.ok(engines.launchBundle.signingOrder.includes(wallet.address));
  assert.equal(engines.launchBundle.caps.maxTotalSol, 0.01);
  assert.ok(engines.launchBundle.antiAbuseChecks.includes('no-self-trade-loop'));
  assert.ok(engines.launchBundle.antiAbuseChecks.includes('no-wash-trading'));
  assert.ok(engines.launchBundle.blockers.includes('broadcast-gate-closed'));
  assert.ok(engines.launchBundle.blockers.includes('bundle-simulation-proof-required'));
  assert.equal(engines.launchBundle.safety.noRelaySubmit, true);
});

test('deployment engine LP readiness does not block Pump.fun route with Raydium LP work', () => {
  const engines = buildDeploymentEngineReadiness(project, [wallet], activation);
  assert.equal(engines.createLp.contract, 'bondr-create-lp-engine-readiness-v1');
  assert.equal(engines.createLp.routePlatform, 'pump');
  assert.equal(engines.createLp.selectedAdapterId, 'pumpfun-pumpportal-launch');
  assert.equal(engines.createLp.status, 'not-required');
  assert.equal(engines.createLp.implementationStatus, 'not-required');
  assert.deepEqual(engines.createLp.blockers, []);
  assert.deepEqual(engines.createLp.adapters.map((adapter) => adapter.id), [
    'pumpfun-pumpportal-launch',
    'raydium-original-lp-burn'
  ]);
  assert.ok(engines.createLp.adapters.every((adapter) => adapter.requiredSdkOrApi.length > 0));
  assert.ok(engines.createLp.adapters.every((adapter) => adapter.requiredInputs.length > 0));
  assert.ok(engines.createLp.adapters.every((adapter) => adapter.simulationRequirement.includes('simulate')));
  assert.equal(engines.createLp.safety.noFakeLpCreation, true);
  assert.equal(engines.createLp.execution, 'pumpfun-or-raydium-lp-readiness-map-only-no-lp-transaction');
});

test('deployment engine LP readiness marks Raydium route builder-missing', () => {
  const raydiumProject = structuredClone(project);
  raydiumProject.launchPath = 'raydium';
  raydiumProject.launchConfig = {
    ...raydiumProject.launchConfig!,
    route: {
      ...raydiumProject.launchConfig!.route,
      platform: 'raydium',
      raydiumLiquiditySol: 1,
      raydiumWithheldTokenPct: 10,
      burnLiquidity: true
    }
  };
  const engines = buildDeploymentEngineReadiness(raydiumProject, [wallet], activation);
  assert.equal(engines.createLp.routePlatform, 'raydium');
  assert.equal(engines.createLp.selectedAdapterId, 'raydium-original-lp-burn');
  assert.equal(engines.createLp.status, 'protocol-sdk-required');
  assert.equal(engines.createLp.implementationStatus, 'adapter-missing');
  assert.ok(engines.createLp.blockers.includes('raydium-original-lp-builder-missing'));
  assert.ok(engines.createLp.blockers.includes('verified-lp-token-account-required'));
  assert.ok(!engines.createLp.blockers.includes('lp-burn-transaction-builder-missing'));
  assert.ok(engines.createLp.blockers.includes('lp-burn-simulation-proof-missing'));
});

test('LP burn builder creates unsigned transaction only from verified LP inputs', () => {
  const burn = buildLpBurnTransaction({
    owner: wallet.address,
    lpMint: 'BQWP7hhYKb5qEp4wjtJoQYxAanzFV5uev4v476tRehAj',
    lpTokenAccount: 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP',
    amount: 1,
    decimals: 9,
    recentBlockhash: 'C5c8RwRiHGgqoSYHXNYTFxnFFuVEqjqBPadZnuaUtV87'
  });
  assert.equal(burn.contract, 'bondr-lp-burn-transaction-v1');
  assert.equal(burn.status, 'built');
  assert.equal(burn.execution, 'unsigned-lp-burn-transaction-built-no-signing-no-broadcast');
  assert.equal(burn.requiredSigners[0], wallet.address);
  assert.equal(typeof burn.transactionBase64, 'string');
  assert.equal(burn.safety.noSigning, true);
  assert.equal(burn.safety.requiresVerifiedLpAccount, true);
});

test('LP burn builder rejects missing verified LP token account', () => {
  assert.throws(() => buildLpBurnTransaction({
    owner: wallet.address,
    lpMint: 'BQWP7hhYKb5qEp4wjtJoQYxAanzFV5uev4v476tRehAj',
    lpTokenAccount: '',
    amount: 1,
    decimals: 9,
    recentBlockhash: 'C5c8RwRiHGgqoSYHXNYTFxnFFuVEqjqBPadZnuaUtV87'
  }), /lpTokenAccount/);
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
  assert.equal(preview.signerPreview.signerProofStatus, 'missing');
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
  assert.equal(preview.presentInputs.mintPublicKey, true);
  assert.ok(preview.blockers.includes('deployment-gate-closed'));
  assert.ok(preview.blockers.includes('broadcast-gate-closed'));
});

test('pumpportal create preview uses route initial buy when no dev plan overrides it', () => {
  const routeOnlyProject = structuredClone(project);
  routeOnlyProject.launchConfig = {
    ...routeOnlyProject.launchConfig!,
    route: { ...routeOnlyProject.launchConfig!.route, initialBuySol: 0.123 },
    walletPlan: []
  };
  routeOnlyProject.metadata = { ...routeOnlyProject.metadata, imageUrl: 'ipfs://image-cid', metadataUri: 'ipfs://metadata-cid' };
  const preview = buildPumpPortalCreatePreview(routeOnlyProject, [wallet], activation, { mintPublicKey: validMintPublicKey, connectedSigner: wallet.address });
  assert.equal(preview.payloadPreview.amount, 0.123);
});

test('pumpportal create preview blocks invalid client mint before provider build', () => {
  const ipfsProject = {
    ...project,
    metadata: {
      ...project.metadata,
      imageUrl: 'ipfs://bafybeigdyrztkexample/image.png',
      metadataUri: 'ipfs://bafybeigdyrztkexample/metadata.json'
    }
  };
  const preview = buildPumpPortalCreatePreview(ipfsProject, [wallet], activation, { mintPublicKey: 'bad-mint', connectedSigner: wallet.address });
  assert.equal(preview.status, 'blocked');
  assert.equal(preview.presentInputs.mintPublicKey, false);
  assert.ok(preview.blockers.includes('client-mint-public-key-invalid'));
  assert.equal(preview.signerPreview.signerProofStatus, 'matched');
  assert.equal(preview.safety.noProviderCall, true);
});

test('pumpportal create preview exposes browser signer proof status', () => {
  const ipfsProject = {
    ...project,
    metadata: {
      ...project.metadata,
      imageUrl: 'ipfs://bafybeigdyrztkexample/image.png',
      metadataUri: 'ipfs://bafybeigdyrztkexample/metadata.json'
    }
  };
  const missing = buildPumpPortalCreatePreview(ipfsProject, [wallet], activation, { mintPublicKey: 'Mint111111111111111111111111111111111111111' });
  assert.equal(missing.signerPreview.signerProofStatus, 'missing');
  const mismatch = buildPumpPortalCreatePreview(ipfsProject, [wallet], activation, { mintPublicKey: 'Mint111111111111111111111111111111111111111', connectedSigner: '11111111111111111111111111111111' });
  assert.equal(mismatch.signerPreview.signerProofStatus, 'mismatch');
  const matched = buildPumpPortalCreatePreview(ipfsProject, [wallet], activation, { mintPublicKey: 'Mint111111111111111111111111111111111111111', connectedSigner: wallet.address });
  assert.equal(matched.signerPreview.signerProofStatus, 'matched');
});

test('deployment readiness separates rehearsal blockers from intentional live gates', () => {
  const ipfsProject = {
    ...project,
    metadata: {
      ...project.metadata,
      imageUrl: 'ipfs://bafybeigdyrztkexample/image.png',
      metadataUri: 'ipfs://bafybeigdyrztkexample/metadata.json'
    },
    launchConfig: {
      ...project.launchConfig!,
      walletPlan: [
        { walletId: 'dev-wallet', role: 'dev wallet', participate: true, executionPhase: 'dev' as const, plannedBuySol: 0.01, maxBuySol: 0.01, maxSlippageBps: 100, takeProfitPercents: [35, 75, 150], stopLossPct: -18, trailingStopPct: 22, perTxSellCapPct: 25, cooldownSeconds: 60 }
      ]
    }
  };
  const readiness = buildDeploymentLaunchReadiness(ipfsProject, [wallet], activation);
  assert.equal(readiness.rehearsalStatus, 'ready-for-dry-run-rehearsal');
  assert.equal(readiness.routeCompleteness.status, 'rehearsal-ready');
  assert.equal(readiness.routeCompleteness.developed, true);
  assert.deepEqual(readiness.rehearsalBlockers, []);
  assert.deepEqual(readiness.optionalBlockers, []);
  assert.deepEqual(readiness.intentionalLiveGateBlockers, ['deployment-gate-closed', 'broadcast-gate-closed']);
  assert.equal(readiness.broadcastReady, false);
});

test('pumpportal build-create stays provider-disabled without signing or broadcast', async () => {
  const ipfsProject = ipfsReadyProject();
  const result = await buildPumpPortalCreateTransaction(ipfsProject, [wallet], activation, { mintPublicKey: validMintPublicKey, connectedSigner: wallet.address });
  assert.equal(result.contract, 'bondr-pumpportal-build-create-v1');
  assert.equal(result.status, 'provider-build-disabled');
  assert.equal(result.execution, 'provider-build-disabled-no-call');
  assert.deepEqual(result.blockers, ['pumpportal-build-disabled', 'pump-direct-build-disabled']);
  assert.equal(result.builder.selected, 'pumpportal-local-create');
  assert.equal(result.builder.directSdkEnabled, false);
  assert.equal(result.safety.noSigning, true);
  assert.equal(result.safety.noBroadcast, true);
  assert.equal(result.requestBody.action, 'create');
  assert.equal(result.requestBody.tokenMetadata.uri, 'ipfs://bafybeigdyrztkexample/metadata.json');
});

test('pumpportal build-create refuses provider call without explicit confirmBuild', async () => {
  await withProviderBuild(async (calls) => {
    const result = await buildPumpPortalCreateTransaction(ipfsReadyProject(), [wallet], activation, { mintPublicKey: validMintPublicKey, connectedSigner: wallet.address });
    assert.equal(result.status, 'provider-build-disabled');
    assert.equal(result.execution, 'provider-build-disabled-no-call');
    assert.deepEqual(result.blockers, ['explicit-confirm-build-required']);
    assert.equal(result.safety.providerCallEnabled, true);
    assert.equal(result.safety.confirmBuild, false);
    assert.equal(calls.count, 0);
  });
});

test('pumpportal build-create inspects returned unsigned transaction signers', async () => {
  await withProviderBuild(async (calls) => {
    const result = await buildPumpPortalCreateTransaction(ipfsReadyProject(), [wallet], activation, { mintPublicKey: validMintPublicKey, connectedSigner: wallet.address, confirmBuild: true });
    assert.equal(result.status, 'built');
    assert.equal(result.execution, 'unsigned-create-transaction-built-no-signing-no-broadcast');
    assert.equal(calls.count, 1);
    assert.equal(result.safety.noSigning, true);
    assert.equal(result.safety.noBroadcast, true);
    assert.equal(result.safety.noPrivateKeys, true);
    assert.equal(result.build?.feePayer, wallet.address);
    assert.ok(result.build?.requiredSigners.includes(wallet.address));
    assert.ok(result.build?.requiredSigners.includes(validMintPublicKey));
    assert.equal(Object.prototype.hasOwnProperty.call(result.build ?? {}, 'transactionBase64'), false);
    assert.equal(result.intent, null);
  });
});

test('pumpportal build-create can return explicit unsigned handoff and bound broadcast intent', async () => {
  await withProviderBuild(async (calls) => {
    const result = await buildPumpPortalCreateTransaction(ipfsReadyProject(), [wallet], activation, {
      mintPublicKey: validMintPublicKey,
      connectedSigner: wallet.address,
      confirmBuild: true,
      includeUnsignedTransaction: true,
      createIntent: true
    });
    assert.equal(result.status, 'built');
    assert.equal(calls.count, 1);
    assert.ok(result.build?.transactionBase64);
    assert.equal(result.build?.messageHash.length, 64);
    assert.ok(result.build?.programs.includes(SystemProgram.programId.toBase58()));
    assert.equal(result.intent?.status, 'transaction_built');
    assert.equal(result.intent?.expectedSigner, wallet.address);
    assert.equal(result.intent?.expectedMint, validMintPublicKey);
    assert.equal(result.intent?.transactionMessageHash, result.build?.messageHash);
    assert.deepEqual(result.intent?.requiredAccounts.sort(), [validMintPublicKey, wallet.address].sort());
    assert.deepEqual(result.intent?.allowedPrograms, result.build?.programs);
  });
});

test('pumpportal build-create sensitive POST requires Meridian operator auth before build', async () => {
  const previous = {
    VERCEL: process.env.VERCEL,
    NODE_ENV: process.env.NODE_ENV,
    LIVE_TRADING_ENABLED: process.env.LIVE_TRADING_ENABLED,
    MERIDIAN_SESSION_SECRET: process.env.MERIDIAN_SESSION_SECRET,
    MERIDIAN_OPERATOR_KEY: process.env.MERIDIAN_OPERATOR_KEY,
    OPERATOR_SESSION_SECRET: process.env.OPERATOR_SESSION_SECRET,
    TERMINAL_OPERATOR_TOKEN: process.env.TERMINAL_OPERATOR_TOKEN
  };
  try {
    process.env.VERCEL = '1';
    delete process.env.LIVE_TRADING_ENABLED;
    delete process.env.MERIDIAN_SESSION_SECRET;
    delete process.env.MERIDIAN_OPERATOR_KEY;
    delete process.env.OPERATOR_SESSION_SECRET;
    delete process.env.TERMINAL_OPERATOR_TOKEN;
    const request = new Request('https://bondr.test/api/deployment/pumpportal/build-create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://bondr.test' },
      body: JSON.stringify({
        projectId: 'sda',
        mintPublicKey: validMintPublicKey,
        connectedSigner: wallet.address,
        confirmBuild: true
      })
    });
    const response = await pumpBuildCreatePost(request);
    const json = await response.json() as { execution?: string };
    assert.equal(response.status, 503);
    assert.equal(json.execution, 'blocked-by-missing-meridian-auth-config');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key as keyof typeof process.env];
      else process.env[key as keyof typeof process.env] = value;
    }
  }
});

test('pumpportal build-create route protects unsigned handoff and intent flags', () => {
  const source = readFileSync(new URL('../apps/web/app/api/deployment/pumpportal/build-create/route.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("import { meridianAuthRequiredResponse }"));
  assert.ok(source.includes('sensitiveBuildRequested(input)'));
  assert.ok(source.includes('input.confirmBuild || input.includeUnsignedTransaction || input.createIntent'));
  assert.ok(source.includes('const authBlocked = await meridianAuthRequiredResponse(request);'));
  assert.ok(source.includes('rateLimitSensitiveBuild(request)'));
  assert.ok(source.includes('build-create-rate-limited-no-provider-call-no-signing-no-broadcast'));
});

test('deployment launch builder stages signed PumpPortal create packets for signed review and gated broadcast', () => {
  const source = readFileSync(new URL('../apps/web/app/deployment/components/DeploymentLaunchBuilderPanel.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes("fetch('/api/terminal/signed-review'"));
  assert.ok(source.includes("fetch('/api/send-signed-transaction'"));
  assert.ok(source.includes("operation: 'launch'"));
  assert.ok(source.includes('builder?.selected'));
  assert.ok(source.includes('Review Signed'));
  assert.ok(source.includes('Submit Signed'));
  assert.ok(source.includes('safeToBroadcastIfLiveEnabled'));
});

test('pump direct SDK adapter stays gated behind explicit env and shares handoff shape', () => {
  const source = readFileSync(new URL('../apps/web/lib/pumpportal-deploy-readiness.ts', import.meta.url), 'utf8');
  const directSource = readFileSync(new URL('../apps/web/lib/pumpfun-direct-create-builder.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("selected: 'pumpportal-local-create' | 'pump-sdk-direct-create'"));
  assert.ok(directSource.includes('PUMP_DIRECT_BUILD_ENABLED'));
  assert.ok(source.includes('buildPumpFunDirectCreateTransaction'));
  assert.ok(source.includes("direct Pump.fun SDK builder used"));
  assert.ok(directSource.includes('@pump-fun/pump-sdk'));
  assert.ok(directSource.includes('createAndBuyInstructions'));
  assert.ok(directSource.includes('createV2AndBuyInstructions'));
});

test('deployment create simulation and broadcast previews use launch semantics', () => {
  const signerDryRunSource = readFileSync(new URL('../apps/web/app/api/terminal/signer-dry-run/route.ts', import.meta.url), 'utf8');
  const sendSource = readFileSync(new URL('../apps/web/app/api/send-signed-transaction/route.ts', import.meta.url), 'utf8');
  assert.ok(signerDryRunSource.includes("action === 'create'"));
  assert.ok(signerDryRunSource.includes("return 'launch'"));
  assert.ok(signerDryRunSource.includes('Pump.fun create, initial buy, rent, and network fees'));
  assert.ok(sendSource.includes("body?.operation === 'launch'"));
  assert.ok(sendSource.includes("return 'launch'"));
});

test('broadcast gates keep funding isolated from broad live broadcast', () => {
  const sendSource = readFileSync(new URL('../apps/web/app/api/send-signed-transaction/route.ts', import.meta.url), 'utf8');
  const fundingGate = "if (kind === 'funding' && liveActivation.fundingBroadcastEnabled) return null;";
  const broadGate = "if (kind !== 'funding' && liveActivation.broadcastEnabled) return null;";
  assert.ok(sendSource.includes(fundingGate));
  assert.ok(sendSource.includes(broadGate));
  assert.ok(sendSource.indexOf(fundingGate) < sendSource.indexOf(broadGate));
});

test('manual launch receipt reconciliation requires Meridian operator auth', () => {
  const source = readFileSync(new URL('../apps/web/app/api/projects/[id]/launch-receipt/route.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("import { meridianAuthRequiredResponse }"));
  assert.ok(source.includes('const authBlocked = await meridianAuthRequiredResponse(request);'));
  assert.ok(source.indexOf('meridianAuthRequiredResponse(request)') < source.indexOf('sameOriginAllowed(request)'));
});

test('launch receipt normalization rejects invalid mint public keys', () => {
  const valid = normalizeLaunchReceipt({
    signature: '2SSk4HBp9WYZbQPVQ1LP6ZfQJYEpkoBNwZw8VnrHjhuppRf3bT8MzjQFWSkBJqVnNvF3pNhpYinTY91Hu66u5Pth',
    tokenMint: 'AtowBVrQfHZkmL5zvPBM6pyYQgz6ByZcZ5JTSJwRvWcu'
  });
  assert.equal(valid.receipt?.tokenMint, 'AtowBVrQfHZkmL5zvPBM6pyYQgz6ByZcZ5JTSJwRvWcu');

  const invalid = normalizeLaunchReceipt({
    signature: '2SSk4HBp9WYZbQPVQ1LP6ZfQJYEpkoBNwZw8VnrHjhuppRf3bT8MzjQFWSkBJqVnNvF3pNhpYinTY91Hu66u5Pth',
    tokenMint: 'bad-mint'
  });
  assert.equal(invalid.error, 'Valid launched token mint is required.');
});

test('pumpportal build-create blocks returned transaction missing mint signer', async () => {
  await withProviderBuild(async (calls) => {
    const result = await buildPumpPortalCreateTransaction(ipfsReadyProject(), [wallet], activation, { mintPublicKey: validMintPublicKey, connectedSigner: wallet.address, confirmBuild: true });
    assert.equal(result.status, 'blocked');
    assert.equal(result.execution, 'provider-build-policy-blocked-no-signing-no-broadcast');
    assert.equal(calls.count, 1);
    assert.ok(result.blockers.includes('pumpportal-mint-signer-missing'));
    assert.equal(result.safety.noSigning, true);
    assert.equal(result.safety.noBroadcast, true);
  }, serializedProviderTransaction({ includeMintSigner: false }));
});

test('pumpportal build-create preserves provider failure diagnostics', async () => {
  await withProviderFailure(async (calls) => {
    const result = await buildPumpPortalCreateTransaction(ipfsReadyProject(), [wallet], activation, { mintPublicKey: validMintPublicKey, connectedSigner: wallet.address, confirmBuild: true });
    assert.equal(result.status, 'blocked');
    assert.equal(result.execution, 'blocked-no-provider-call');
    assert.equal(calls.count, 1);
    assert.deepEqual(result.blockers, ['pumpportal-build-failed-400']);
    assert.equal(result.providerResponse?.status, 400);
    assert.equal(result.providerResponse?.statusText, "Cannot read properties of undefined (reading 'toBuffer')");
    assert.equal(result.providerResponse?.contentType, 'text/plain; charset=utf-8');
    assert.equal(result.providerResponse?.bodyPreview, 'Bad Request');
    assert.ok(result.warnings.includes("Cannot read properties of undefined (reading 'toBuffer')"));
    assert.ok(result.warnings.includes('Bad Request'));
  });
});

test('pumpportal build-create blocks bad mint before provider call', async () => {
  const ipfsProject = {
    ...project,
    metadata: {
      ...project.metadata,
      imageUrl: 'ipfs://bafybeigdyrztkexample/image.png',
      metadataUri: 'ipfs://bafybeigdyrztkexample/metadata.json'
    }
  };
  const result = await buildPumpPortalCreateTransaction(ipfsProject, [wallet], activation, { mintPublicKey: 'bad-mint', connectedSigner: wallet.address });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('client-mint-public-key-invalid'));
  assert.equal(result.execution, 'blocked-no-provider-call');
});

test('pumpportal build-create requires browser signer proof to match dev wallet', async () => {
  const ipfsProject = {
    ...project,
    metadata: {
      ...project.metadata,
      imageUrl: 'ipfs://bafybeigdyrztkexample/image.png',
      metadataUri: 'ipfs://bafybeigdyrztkexample/metadata.json'
    }
  };
  const missing = await buildPumpPortalCreateTransaction(ipfsProject, [wallet], activation, { mintPublicKey: 'Mint111111111111111111111111111111111111111' });
  assert.ok(missing.blockers.includes('browser-signer-proof-required'));
  const mismatch = await buildPumpPortalCreateTransaction(ipfsProject, [wallet], activation, { mintPublicKey: 'Mint111111111111111111111111111111111111111', connectedSigner: '11111111111111111111111111111111' });
  assert.ok(mismatch.blockers.includes('browser-signer-dev-wallet-mismatch'));
});

test('ipfs metadata readiness validates token metadata without pinning', () => {
  const readiness = buildIpfsMetadataReadiness(project);
  assert.equal(readiness.contract, 'bondr-ipfs-metadata-readiness-v1');
  assert.equal(readiness.execution, 'readiness-only-no-ipfs-write');
  assert.equal(readiness.provider, 'pinata');
  assert.ok(readiness.blockers.includes('pinata-jwt-missing'));
  assert.equal(readiness.metadataJson.symbol, 'ASD');
});

test('ipfs metadata readiness accepts BONDR_PINATA_API as a Pinata bearer alias', () => {
  const previousJwt = process.env.PINATA_JWT;
  const previousAlias = process.env.BONDR_PINATA_API;
  try {
    delete process.env.PINATA_JWT;
    process.env.BONDR_PINATA_API = 'test-pinata-bearer-token';
    const readiness = buildIpfsMetadataReadiness(project);
    assert.equal(readiness.providerConfigured, true);
    assert.equal(readiness.blockers.includes('pinata-jwt-missing'), false);
    assert.deepEqual(readiness.requiredEnv, ['PINATA_JWT', 'BONDR_PINATA_API']);
  } finally {
    if (previousJwt === undefined) delete process.env.PINATA_JWT;
    else process.env.PINATA_JWT = previousJwt;
    if (previousAlias === undefined) delete process.env.BONDR_PINATA_API;
    else process.env.BONDR_PINATA_API = previousAlias;
  }
});

test('pinata jwt parser extracts JWT from combined Pinata credential blobs', () => {
  const previousJwt = process.env.PINATA_JWT;
  const previousAlias = process.env.BONDR_PINATA_API;
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwaW5hdGEifQ.signature';
  try {
    delete process.env.PINATA_JWT;
    process.env.BONDR_PINATA_API = `PINATA_API_KEY=key\nPINATA_API_SECRET=secret\nJWT=${jwt}`;
    assert.equal(pinataJwt(), jwt);

    process.env.BONDR_PINATA_API = JSON.stringify({ pinata_api_key: 'key', pinata_api_secret: 'secret', JWT: jwt });
    assert.equal(pinataJwt(), jwt);
  } finally {
    if (previousJwt === undefined) delete process.env.PINATA_JWT;
    else process.env.PINATA_JWT = previousJwt;
    if (previousAlias === undefined) delete process.env.BONDR_PINATA_API;
    else process.env.BONDR_PINATA_API = previousAlias;
  }
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
  assert.ok(result.blockers.includes('jito-relay-disabled'));
  assert.ok(result.blockers.includes('broadcast-gate-closed'));
});

test('jito sendBundle remains blocked before relay fetch when gates are closed', async () => {
  const result = await sendJitoBundle({
    signedTransactions: ['tx1'],
    expectedSigners: [wallet.address],
    expectedMint: 'Mint111111111111111111111111111111111111111',
    tipLamports: 1000,
    simulationProof: { ok: true },
    approvalId: 'approval-test'
  }, activation);
  assert.equal(result.status, 'blocked');
  assert.equal(result.execution, 'blocked-no-jito-relay-submit');
  assert.ok(result.blockers.includes('jito-relay-disabled'));
  assert.ok(result.blockers.includes('broadcast-gate-closed'));
});

test('jito sendBundle posts JSON-RPC only when policy and gates pass', async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: string }> = [];
  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), body: String(init?.body ?? '') });
    return new Response(JSON.stringify({ jsonrpc: '2.0', result: 'bundle-test-id' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await sendJitoBundle({
      signedTransactions: ['tx1'],
      expectedSigners: [wallet.address],
      expectedMint: 'Mint111111111111111111111111111111111111111',
      tipLamports: 1000,
      simulationProof: { ok: true },
      approvalId: 'approval-test'
    }, { ...activation, broadcastEnabled: true }, {
      contract: 'bondr-jito-relay-readiness-v1',
      status: 'relay-ready',
      relayEnabled: true,
      provider: 'jito-block-engine',
      blockEngineUrl: 'https://jito.test',
      blockEngineRegion: 'test',
      authConfigured: false,
      tip: { minLamports: 1000, maxLamports: 100000, minSol: 0.000001, maxSol: 0.0001, tipAccountsEndpoint: 'https://jito.test/api/v1/getTipAccounts' },
      limits: { maxTransactionsPerBundle: 5, maxWalletsPerBundle: 5, maxTotalSol: 0.25 },
      methods: { sendBundle: 'sendBundle', getBundleStatuses: 'getBundleStatuses', getInflightBundleStatuses: 'getInflightBundleStatuses', getTipAccounts: 'getTipAccounts', sendTransaction: 'sendTransaction' },
      requiredEnv: [],
      optionalEnv: [],
      blockers: [],
      warnings: [],
      execution: 'relay-ready-gated-submit'
    });
    assert.equal(result.status, 'submitted');
    assert.equal(result.relayResponse?.bundleId, 'bundle-test-id');
    assert.equal(requests.length, 1);
    assert.equal(JSON.parse(requests[0].body).method, 'sendBundle');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('jito bundle status stays blocked when relay is disabled', async () => {
  const result = await getJitoBundleStatus({ bundleIds: ['bundle-test-id'] });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('jito-relay-disabled'));
  assert.equal(result.execution, 'bundle-status-read-only-no-submit');
});

test('jito bundle status builds receipt records from relay responses', async () => {
  const previousFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    methods.push(body.method);
    const result = body.method === 'getInflightBundleStatuses'
      ? { value: [{ bundle_id: 'bundle-test-id', status: 'Pending' }] }
      : { value: [{ bundle_id: 'bundle-test-id', confirmation_status: 'finalized' }] };
    return new Response(JSON.stringify({ jsonrpc: '2.0', result }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await getJitoBundleStatus({ bundleIds: ['bundle-test-id'], projectId: 'sda', rail: 'deployment' }, {
      contract: 'bondr-jito-relay-readiness-v1',
      status: 'relay-ready',
      relayEnabled: true,
      provider: 'jito-block-engine',
      blockEngineUrl: 'https://jito.test',
      blockEngineRegion: 'test',
      authConfigured: false,
      tip: { minLamports: 1000, maxLamports: 100000, minSol: 0.000001, maxSol: 0.0001, tipAccountsEndpoint: 'https://jito.test/api/v1/getTipAccounts' },
      limits: { maxTransactionsPerBundle: 5, maxWalletsPerBundle: 5, maxTotalSol: 0.25 },
      methods: { sendBundle: 'sendBundle', getBundleStatuses: 'getBundleStatuses', getInflightBundleStatuses: 'getInflightBundleStatuses', getTipAccounts: 'getTipAccounts', sendTransaction: 'sendTransaction' },
      requiredEnv: [],
      optionalEnv: [],
      blockers: [],
      warnings: [],
      execution: 'relay-ready-gated-submit'
    });
    assert.equal(result.status, 'ok');
    assert.deepEqual(methods.sort(), ['getBundleStatuses', 'getInflightBundleStatuses']);
    assert.equal(result.receipts[0].contract, 'bondr-bundle-receipt-v1');
    assert.equal(result.receipts[0].bundleId, 'bundle-test-id');
    assert.equal(result.receipts[0].rail, 'deployment');
    assert.equal(result.receipts[0].status, 'finalized');
  } finally {
    globalThis.fetch = previousFetch;
  }
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
  assert.deepEqual(readiness.bundleSession.missingWalletIds, ['bundle-wallet']);
  assert.equal(readiness.bundleSession.nextWalletId, 'bundle-wallet');
});

test('wallet signing readiness tracks sequential bundle session progress and expiry', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const progress = buildWalletSigningReadiness(project, [wallet], { signedWalletIds: ['bundle-wallet'], blockhashExpiresAt: future });
  assert.equal(progress.bundleSession.signedCount, 1);
  assert.equal(progress.bundleSession.missingCount, 0);
  assert.deepEqual(progress.bundleSession.signingOrder, ['bundle-wallet']);
  assert.equal(progress.bundleSession.nextWalletId, null);
  const expired = buildWalletSigningReadiness(project, [wallet], { signedWalletIds: ['bundle-wallet'], blockhashExpiresAt: '2020-01-01T00:00:00.000Z' });
  assert.equal(expired.bundleSession.expired, true);
  assert.ok(expired.bundleSession.blockers.includes('blockhash-expired-rebuild-required'));
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

test('sniper trigger preview blocks missing trigger inputs without building a buy', () => {
  const preview = buildSniperTriggerPreview(project, [wallet], activation);
  assert.equal(preview.contract, 'bondr-sniper-trigger-preview-v1');
  assert.equal(preview.execution, 'sniper-trigger-preview-only-no-buy-no-broadcast');
  assert.ok(preview.blockers.includes('trigger-source-required'));
  assert.ok(preview.blockers.includes('token-mint-required'));
  assert.ok(preview.blockers.includes('connected-browser-signer-proof-required'));
  assert.equal(preview.safety.noTransactionBuild, true);
});

test('sniper trigger preview accepts manual trigger shape but keeps live gates closed', () => {
  const preview = buildSniperTriggerPreview({ ...project, tokenMint: 'Mint111111111111111111111111111111111111111' }, [wallet], activation, {
    source: 'manual',
    connectedSigner: wallet.address,
    amountSol: 0.01,
    slippageBps: 100,
    simulationProof: { ok: true }
  });
  assert.equal(preview.status, 'preview-ready');
  assert.ok(preview.blockers.includes('broadcast-gate-closed'));
  assert.ok(preview.blockers.includes('jito-relay-disabled'));
  assert.equal(preview.safety.noBroadcast, true);
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

test('task queue preview models queue records without worker execution', () => {
  const preview = buildTaskQueuePreview(project, [wallet], activation);
  assert.equal(preview.contract, 'bondr-task-queue-preview-v1');
  assert.equal(preview.execution, 'task-queue-preview-only-no-worker-no-trading');
  assert.ok(preview.blockers.includes('task-name-required'));
  assert.ok(preview.blockers.includes('task-wallet-allowlist-required'));
  assert.ok(preview.blockers.includes('durable-task-worker-missing'));
  assert.equal(preview.safety.noAutonomousTrading, true);
});

test('task queue preview accepts safe task shape but keeps worker and broadcast blocked', () => {
  const preview = buildTaskQueuePreview(project, [wallet], activation, {
    taskName: 'standard rehearsal task',
    walletIds: ['dev-wallet'],
    schedule: 'interval',
    intervalSeconds: 60,
    maxRuns: 3,
    cooldownSeconds: 60,
    riskRuleId: 'standard-launch-rehearsal'
  });
  assert.equal(preview.status, 'preview-ready');
  assert.ok(preview.blockers.includes('durable-task-worker-missing'));
  assert.ok(preview.blockers.includes('task-queue-persistence-missing'));
  assert.ok(preview.blockers.includes('broadcast-gate-closed'));
  assert.equal(preview.task.paused, true);
});

test('execution recovery readiness reports monitor gaps and no-blind-retry policy', () => {
  const readiness = buildExecutionRecoveryReadiness();
  assert.equal(readiness.contract, 'bondr-execution-recovery-readiness-v1');
  assert.equal(readiness.execution, 'recovery-readiness-only-no-monitor-no-retry-no-broadcast');
  assert.ok(readiness.recoveryPolicy.retryable.includes('blockhash-expired-rebuild'));
  assert.ok(readiness.recoveryPolicy.noRetry.includes('slippage-or-stale-market'));
  assert.equal(readiness.recoveryPolicy.noBlindRetry, true);
  assert.ok(readiness.blockers.includes('durable-monitor-worker-missing'));
});

test('shadow execution packet compiles execution spine without enabling live movement', async () => {
  const packet = await buildShadowExecutionPacket(project, [wallet], activation, {
    mintPublicKey: 'Mint111111111111111111111111111111111111111',
    connectedSigner: wallet.address,
    expectedSigners: [wallet.address],
    simulationProof: { source: 'unit-test' },
    persistAudit: false
  });
  assert.equal(packet.contract, 'bondr-shadow-execution-packet-v1');
  assert.equal(packet.execution, 'shadow-plan-only-no-signing-no-broadcast');
  assert.equal(packet.safety.noSigning, true);
  assert.equal(packet.safety.noBroadcast, true);
  assert.equal(packet.safety.noDeployment, true);
  assert.equal(packet.audit.persisted, false);
  assert.equal(packet.gates.broadcastEnabled, false);
  assert.ok(packet.packetHash.length >= 32);
  assert.ok(packet.spine.some((item) => item.step === 'relay'));
});
