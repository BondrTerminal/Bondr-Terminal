import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import test from 'node:test';
import { buildDeploymentLaunchReadiness, DEPLOYMENT_ROUTE_ADAPTERS } from '../apps/web/lib/deployment-route-adapters.js';
import { buildDeploymentEngineReadiness } from '../apps/web/lib/deployment-engine-readiness.js';
import { buildExecutionRecoveryReadiness } from '../apps/web/lib/execution-recovery-readiness.js';
import { buildExecutionTruthMap } from '../apps/web/lib/execution-truth-map.js';
import { buildIpfsMetadataReadiness, buildTokenMetadataJson, pinataJwt } from '../apps/web/lib/ipfs-metadata-readiness.js';
import { buildJitoAddressLookupTablePlan } from '../apps/web/lib/jito-address-lookup-table-plan.js';
import { buildJitoBundleChainEffectProof } from '../apps/web/lib/jito-bundle-chain-effect-proof.js';
import { buildJitoBundlePreview, buildJitoSendBundleBlockedResponse, getJitoBundleStatus, normalizeJitoBundleStatusReceipt, sendJitoBundle } from '../apps/web/lib/jito-relay-adapter.js';
import { buildJitoLaunchBundlePlan } from '../apps/web/lib/jito-launch-bundle-plan.js';
import { buildJitoMultiWalletSigningSession } from '../apps/web/lib/jito-multi-wallet-signing-session.js';
import { buildJitoPackedTransaction } from '../apps/web/lib/jito-packed-transaction-builder.js';
import { buildJitoWaveDispatchPlan } from '../apps/web/lib/jito-wave-dispatch-plan.js';
import { buildJitoRouteInstructionSource } from '../apps/web/lib/jito-route-instruction-source.js';
import { buildPumpPortalCreatePreview, buildPumpPortalCreateTransaction } from '../apps/web/lib/pumpportal-deploy-readiness.js';
import { buildRaydiumOriginalLpPlan } from '../apps/web/lib/raydium-original-lp-plan.js';
import { buildRaydiumLpTokenAccountProof, buildRaydiumPostBroadcastLpAccountProof, buildRaydiumPostBroadcastLpAccountProofFromObservation, RAYDIUM_AMM_V4_LP_MINT_OFFSET, RAYDIUM_AMM_V4_PROGRAM_ID, resolveRaydiumAmmV4LpMintProof } from '../apps/web/lib/raydium-lp-proof.js';
import { buildRaydiumCpmmCreatePoolTransaction } from '../apps/web/lib/raydium-cpmm-create-pool-adapter.js';
import { buildRaydiumLpSimulationPolicy } from '../apps/web/lib/raydium-lp-simulation-policy.js';
import { buildRaydiumRouteConfig } from '../apps/web/lib/raydium-route-config.js';
import { normalizeRaydiumLaunchReceipt } from '../apps/web/lib/raydium-launch-receipts.js';
import { buildSniperExecutionReadiness, buildSniperTriggerPreview, buildTaskExecutionReadiness, buildTaskLifecyclePreview, buildTaskQueuePreview } from '../apps/web/lib/sniper-task-readiness.js';
import { buildWalletSigningReadiness } from '../apps/web/lib/wallet-signing-readiness.js';
import { buildShadowExecutionPacket } from '../apps/web/lib/execution-shadow-plan.js';
import { normalizeDeploymentLaunchPath, normalizeDeploymentRoutePlatform, routePlatformForLaunchPath } from '../apps/web/lib/deployment-launch-path.js';
import { buildLpBurnTransaction, buildSimulationVerifiedLpBurnSignatureHandoff, buildVerifiedLpBurnTransaction } from '../apps/web/lib/lp-burn-transaction-builder.js';
import { normalizeLaunchReceipt } from '../apps/web/lib/launch-receipts.js';
import { buildLaunchReconciliation } from '../apps/web/lib/launch-reconciliation.js';
import { buildLiveTestPlan } from '../apps/web/lib/live-test-plan.js';
import { stripMeridianInlineAssetData, stripProjectInlineAssetData, walletPlanEntries, type MeridianStore, type Project, type Wallet } from '../apps/web/lib/meridian-store.js';
import { Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { POST as deploymentEnginePost } from '../apps/web/app/api/deployment-engine/route.js';
import { POST as bundleSequencerPost } from '../apps/web/app/api/bundle-sequencer/route.js';
import { POST as pumpBuildCreatePost } from '../apps/web/app/api/deployment/pumpportal/build-create/route.js';
import { POST as raydiumBuildLpPost } from '../apps/web/app/api/deployment/raydium/build-lp/route.js';

const durableWalletStoreSource = readFileSync(new URL('../apps/web/lib/durable-wallet-store.ts', import.meta.url), 'utf8');
const launchConfigEditorSource = readFileSync(new URL('../apps/web/app/deployment/components/LaunchConfigEditor.tsx', import.meta.url), 'utf8');
const deploymentPageSource = readFileSync(new URL('../apps/web/app/deployment/page.tsx', import.meta.url), 'utf8');
const globalCssSource = readFileSync(new URL('../apps/web/app/globals.css', import.meta.url), 'utf8');

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

test('durable meridian store uses postgres without requiring local JSON seed', () => {
  assert.match(durableWalletStoreSource, /function emptyMeridianStore/);
  assert.match(durableWalletStoreSource, /function baseMeridianStoreForMode/);
  assert.match(durableWalletStoreSource, /if \(mode === 'postgres'\) return emptyMeridianStore\(\)/);
  assert.match(durableWalletStoreSource, /const db = pool\(\);\s+const base = baseMeridianStoreForMode\(db \? 'postgres' : 'local'\)/);
});

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

test('deployment readiness tolerates partial launch config rows without wallet plans', () => {
  const partialConfigProject: Project = {
    ...project,
    launchConfig: { route: project.launchConfig!.route } as Project['launchConfig']
  };
  assert.deepEqual(walletPlanEntries(partialConfigProject), []);
  assert.doesNotThrow(() => buildDeploymentLaunchReadiness(partialConfigProject, [wallet], activation));
  assert.doesNotThrow(() => buildDeploymentEngineReadiness(partialConfigProject, [wallet], activation));
  assert.doesNotThrow(() => buildPumpPortalCreatePreview(partialConfigProject, [wallet], activation));
  assert.doesNotThrow(() => buildRaydiumOriginalLpPlan(partialConfigProject, [wallet], activation));
  assert.doesNotThrow(() => buildRaydiumRouteConfig(partialConfigProject, [wallet]));
  assert.doesNotThrow(() => buildWalletSigningReadiness(partialConfigProject, [wallet]));
  assert.doesNotThrow(() => buildJitoLaunchBundlePlan(partialConfigProject, [wallet], activation));
});

test('deployment editor consolidates dev bundle sniper and task wallet controls into deploy matrix', () => {
  assert.match(launchConfigEditorSource, /function LaunchExecutionMatrix/);
  assert.match(launchConfigEditorSource, /Deploy execution matrix/);
  assert.match(launchConfigEditorSource, /deploymentMatrixPath/);
  assert.match(launchConfigEditorSource, /deploymentWalletSourcePanel/);
  assert.match(launchConfigEditorSource, /Portfolio wallet/);
  assert.match(launchConfigEditorSource, /walletSearch/);
  assert.match(launchConfigEditorSource, /walletScope/);
  assert.match(launchConfigEditorSource, /All Portfolio wallets/);
  assert.match(launchConfigEditorSource, /deploymentMatrixWalletBlock/);
  assert.match(launchConfigEditorSource, /deploymentMatrixRailLayers/);
  assert.match(launchConfigEditorSource, /name=\{`rail\.\$\{wallet\.id\}`\}/);
  assert.match(launchConfigEditorSource, /phaseForWallet\(form, wallet, index, devWalletId\)/);
  assert.match(launchConfigEditorSource, /phase === 'dev' \? `devPlan\.\$\{wallet\.id\}`/);
  assert.match(launchConfigEditorSource, /phase === 'bundle' \? `bundle\.\$\{wallet\.id\}`/);
  assert.match(launchConfigEditorSource, /phase === 'sniper' \? `sniper\.\$\{wallet\.id\}`/);
  assert.match(launchConfigEditorSource, /phase === 'task' \? `task\.\$\{wallet\.id\}`/);
  assert.match(launchConfigEditorSource, /label="min SOL" name=\{`bundle\.\$\{wallet\.id\}\.plannedBuySol`\}/);
  assert.match(launchConfigEditorSource, /label="max SOL" name=\{`bundle\.\$\{wallet\.id\}\.maxBuySol`\}/);
  assert.match(launchConfigEditorSource, /label="min SOL" name=\{`sniper\.\$\{wallet\.id\}\.plannedBuySol`\}/);
  assert.match(launchConfigEditorSource, /label="max SOL" name=\{`sniper\.\$\{wallet\.id\}\.maxBuySol`\}/);
  assert.match(launchConfigEditorSource, /label="buy min" name=\{`task\.\$\{wallet\.id\}\.buyMinSol`\}/);
  assert.match(launchConfigEditorSource, /label="buy max" name=\{`task\.\$\{wallet\.id\}\.buyMaxSol`\}/);
  assert.match(launchConfigEditorSource, /const taskAmountSol = taskBuyMinSol/);
  assert.match(launchConfigEditorSource, /const maxBuySol = phase === 'task'\s+\? taskBuyMaxSol/);
  assert.match(launchConfigEditorSource, /Deployment execution, signing, Jito relay submit, and broadcast remain gated/);
  assert.match(globalCssSource, /\.deploymentMatrixRailButtons label:has\(input:checked\)/);
  assert.match(globalCssSource, /\.deploymentMatrixPath/);
  assert.match(globalCssSource, /\.deploymentWalletSourcePanel/);
  assert.match(globalCssSource, /\.deploymentMatrixWalletHeader/);
  assert.match(globalCssSource, /\.deploymentMatrixRailLayers/);
  assert.match(globalCssSource, /Deployment cockpit workspace expansion/);
  assert.match(globalCssSource, /width: min\(2440px, calc\(100vw - 16px\)\)/);
  assert.match(globalCssSource, /\.deploymentCockpitGrid\s*\{\s*grid-template-columns: minmax\(0, 12fr\) minmax\(340px, 2\.7fr\)/);
  assert.match(globalCssSource, /\.deploymentMatrixRailLayers\s*\{\s*grid-template-columns: minmax\(0, 0\.75fr\) minmax\(0, 0\.82fr\) minmax\(0, 1\.2fr\) minmax\(0, 1\.35fr\)/);
  assert.match(globalCssSource, /\.launchWizardWindow\s*\{\s*min-height: 74vh/);
  assert.match(globalCssSource, /@media \(max-width: 1280px\)/);
  assert.match(deploymentPageSource, /store\.wallets\s*\n\s*\.filter\(\(wallet\) => !wallet\.archived\)/);
  assert.doesNotMatch(deploymentPageSource, /LaunchConfigEditor project=\{activeProject\} wallets=\{selectedContext\?\.wallets/);
});

test('sitewide layout uses wide operator workspaces instead of narrow centered islands', () => {
  assert.match(globalCssSource, /BONDR sitewide workspace expansion/);
  assert.match(globalCssSource, /--bondr-workspace-wide: min\(2440px, calc\(100vw - \(var\(--bondr-workspace-gutter\) \* 2\)\)\)/);
  for (const selector of ['\\.contentShell', '\\.mainWebsiteShell', '\\.hubShell', '\\.terminalShell', '\\.focusedTerminal', '\\.walletBoardPageShell', '\\.portfolioShell', '\\.liquidityShell']) {
    assert.match(globalCssSource, new RegExp(selector));
  }
  assert.match(globalCssSource, /\.projectOpsGrid,\n\.walletOpsLayout,\n\.walletDashboardGrid,\n\.liquidityActionGrid/);
  assert.match(globalCssSource, /\.terminalMain,\n\.focusedTerminal \.terminalMain,\n\.meridianBoard \.terminalMain/);
  assert.match(globalCssSource, /@media \(min-width: 1600px\)/);
  assert.match(globalCssSource, /@media \(max-width: 1180px\)/);
});

test('Meridian view payloads strip inline project asset data', () => {
  const projectWithInlineAsset: Project = {
    ...project,
    metadata: {
      ...project.metadata,
      imageDataUrl: `data:image/png;base64,${'a'.repeat(4096)}`,
      imageContentType: 'image/png'
    }
  };
  const strippedProject = stripProjectInlineAssetData(projectWithInlineAsset);
  assert.equal(strippedProject.metadata.imageDataUrl, undefined);
  assert.equal(strippedProject.metadata.imageContentType, 'image/png');
  assert.equal(projectWithInlineAsset.metadata.imageDataUrl?.startsWith('data:image/png;base64,'), true);

  const store: MeridianStore = {
    projects: [projectWithInlineAsset],
    wallets: [wallet],
    walletGroups: [{ id: 'operator-wallets', name: 'Operator Wallets', scope: 'global', walletIds: [wallet.id] }],
    flowEvents: [],
    eventLog: []
  };
  const strippedStore = stripMeridianInlineAssetData(store);
  assert.equal(strippedStore.projects[0].metadata.imageDataUrl, undefined);
  assert.equal(store.projects[0].metadata.imageDataUrl, projectWithInlineAsset.metadata.imageDataUrl);
});

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
  assert.equal(raydium?.supportLevel, 'scaffolded');
  assert.equal(raydium?.completionStatus, 'mapped-not-developed');
  assert.equal(raydium?.builderStatus, 'unsigned-sdk-builder-present');
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
  assert.equal(readiness.routeCompleteness.builderStatus, 'lp-plan-ready-sdk-adapter-present');
  assert.equal(readiness.raydiumLaunchReadiness.contract, 'bondr-raydium-launch-readiness-v1');
  assert.equal(readiness.raydiumLaunchReadiness.selected, true);
  assert.equal(readiness.raydiumLaunchReadiness.status, 'blocked');
  assert.equal(readiness.raydiumLaunchReadiness.developed, false);
  assert.equal(readiness.raydiumLaunchReadiness.lpPlan.contract, 'bondr-raydium-original-lp-plan-v1');
  assert.ok(readiness.raydiumLaunchReadiness.lpPlan.blockers.includes('raydium-cpmm-config-id-required'));
  assert.ok(!readiness.raydiumLaunchReadiness.missingBuilderIds.includes('raydium-lp-simulation-policy'));
  assert.ok(!readiness.raydiumLaunchReadiness.missingBuilderIds.includes('lp-burn-transaction-builder'));
  assert.ok(!readiness.raydiumLaunchReadiness.missingBuilderIds.includes('post-broadcast-lp-account-proof'));
  assert.ok(readiness.raydiumLaunchReadiness.gatedBuilderIds.includes('raydium-cpmm-create-pool-adapter'));
  assert.ok(readiness.raydiumLaunchReadiness.gatedBuilderIds.includes('raydium-lp-simulation-policy'));
  assert.ok(readiness.raydiumLaunchReadiness.gatedBuilderIds.includes('raydium-original-lp-plan'));
  assert.ok(readiness.raydiumLaunchReadiness.gatedBuilderIds.includes('post-broadcast-lp-account-proof'));
  assert.ok(readiness.raydiumLaunchReadiness.gatedBuilderIds.includes('lp-burn-simulation-handoff'));
  assert.ok(readiness.raydiumLaunchReadiness.blockers.includes('verified-lp-token-account-required'));
  assert.deepEqual(readiness.routeCompleteness.missingBuilders, []);
  assert.deepEqual(readiness.routeCompleteness.gatedBuilders, ['raydium-original-lp-plan', 'raydium-cpmm-create-pool-adapter', 'raydium-lp-simulation-policy', 'post-broadcast-lp-account-proof', 'lp-burn-transaction-builder', 'lp-burn-simulation-handoff']);
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
  assert.equal(engines.launchBundle.bundlePlan.contract, 'bondr-jito-launch-bundle-plan-v1');
  assert.equal(engines.launchBundle.bundlePlan.execution, 'launch-bundle-plan-only-no-signing-no-relay-submit');
  assert.ok(engines.launchBundle.bundlePlan.legs.some((leg) => leg.id === 'jito-tip'));
  assert.equal(engines.launchBundle.bundlePlan.safety.noRelaySubmit, true);
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

test('Pump.fun route remains independent from Raydium config and LP blockers', () => {
  const readiness = buildDeploymentLaunchReadiness(project, [wallet], activation);
  const engines = buildDeploymentEngineReadiness(project, [wallet], activation);

  assert.equal(readiness.routeCompleteness.platform, 'pump');
  assert.equal(readiness.adapterRecommendation, 'pumpportal-create');
  assert.equal(readiness.routeCompleteness.developed, true);
  assert.deepEqual(readiness.routeCompleteness.missingBuilders, []);
  assert.ok(!readiness.routeCompleteness.blockers.includes('raydium-cpmm-config-id-required'));
  assert.equal(readiness.raydiumLaunchReadiness.selected, false);
  assert.equal(engines.createLp.status, 'not-required');
  assert.deepEqual(engines.createLp.blockers, []);
});

test('deployment engine LP readiness marks Raydium route proof-gated', () => {
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
  assert.equal(engines.createLp.status, 'rehearsal-contract-ready');
  assert.equal(engines.createLp.implementationStatus, 'rehearsal-contract-only');
  assert.equal(engines.createLp.raydiumPlan.contract, 'bondr-raydium-original-lp-plan-v1');
  assert.ok(engines.createLp.blockers.includes('raydium-cpmm-config-id-required'));
  assert.ok(engines.createLp.blockers.includes('raydium-user-token-account-proof-required'));
  assert.ok(engines.createLp.blockers.includes('verified-lp-token-account-required'));
  assert.ok(!engines.createLp.blockers.includes('lp-burn-transaction-builder-missing'));
  assert.ok(engines.createLp.blockers.includes('lp-burn-simulation-proof-required'));
});

test('Raydium route config is Raydium-native and has no Pump.fun dependency', () => {
  const raydiumProject = structuredClone(project);
  raydiumProject.launchPath = 'raydium';
  raydiumProject.tokenMint = validMintPublicKey;
  raydiumProject.launchConfig = {
    ...raydiumProject.launchConfig!,
    route: {
      ...raydiumProject.launchConfig!.route,
      platform: 'raydium',
      raydiumLiquiditySol: 1,
      raydiumWithheldTokenPct: 10,
      raydiumWithheldTokenAmount: 1000000,
      raydiumCpmmConfigId: SystemProgram.programId.toBase58(),
      raydiumBaseAmountRaw: '1000000',
      raydiumQuoteAmountRaw: '1000000000',
      burnLiquidity: true
    }
  };

  const config = buildRaydiumRouteConfig(raydiumProject, [wallet]);
  assert.equal(config.contract, 'bondr-raydium-route-config-v1');
  assert.equal(config.status, 'ready');
  assert.equal(config.route.selected, true);
  assert.equal(config.route.independentOfPumpFun, true);
  assert.ok(config.route.disallowedDependencies.includes('PumpPortal create'));
  assert.equal(config.config.validationStatus, 'valid-public-key');
  assert.equal(config.unsignedBuildInput.endpoint, '/api/deployment/raydium/build-lp');
  assert.equal(config.tokenAccountPrep.unsignedPrerequisiteTransaction.endpoint, '/api/deployment/raydium/prepare-accounts');
  assert.ok(config.poolDerivation.poolId);
  assert.ok(config.poolDerivation.lpMint);
  assert.deepEqual(config.blockers, []);
  assert.equal(config.safety.noPumpFunDependency, true);
});

test('Raydium route config blocks signing path until native config and amounts exist', () => {
  const raydiumProject = structuredClone(project);
  raydiumProject.launchPath = 'raydium';
  raydiumProject.tokenMint = validMintPublicKey;
  raydiumProject.launchConfig = {
    ...raydiumProject.launchConfig!,
    route: {
      ...raydiumProject.launchConfig!.route,
      platform: 'raydium',
      raydiumLiquiditySol: 0,
      raydiumWithheldTokenPct: 10,
      raydiumWithheldTokenAmount: 0,
      burnLiquidity: true
    }
  };

  const config = buildRaydiumRouteConfig(raydiumProject, [wallet]);
  assert.equal(config.status, 'blocked');
  assert.ok(config.blockers.includes('raydium-cpmm-config-id-required'));
  assert.ok(config.blockers.includes('base-amount-raw-required'));
  assert.ok(config.blockers.includes('quote-amount-raw-required'));
  assert.ok(!config.blockers.includes('client-mint-public-key-required'));
  assert.equal(config.safety.noPumpFunDependency, true);
});

test('raydium original LP plan validates route inputs without provider calls', () => {
  const raydiumProject = structuredClone(project);
  raydiumProject.launchPath = 'raydium';
  raydiumProject.tokenMint = validMintPublicKey;
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
  const plan = buildRaydiumOriginalLpPlan(raydiumProject, [wallet], activation);
  assert.equal(plan.contract, 'bondr-raydium-original-lp-plan-v1');
  assert.equal(plan.execution, 'raydium-lp-plan-only-no-sdk-call-no-signing-no-broadcast');
  assert.equal(plan.baseMint, validMintPublicKey);
  assert.equal(plan.quoteMint, 'So11111111111111111111111111111111111111112');
  assert.equal(plan.deployer, wallet.address);
  assert.equal(plan.liquidityPolicy.quoteLiquiditySol, 1);
  assert.equal(plan.liquidityPolicy.initialTokenLiquidityMode, 'withheld-token-percent');
  assert.equal(plan.liquidityPolicy.burnLiquidity, true);
  assert.ok(plan.planHash.length === 64);
  assert.equal(plan.routeConfig.contract, 'bondr-raydium-route-config-v1');
  assert.equal(plan.routeConfig.route.independentOfPumpFun, true);
  assert.equal(plan.unsignedBuildContract.endpoint, '/api/deployment/raydium/build-lp');
  assert.equal(plan.unsignedBuildContract.method, 'makeCreateCpmmPoolInInstruction');
  assert.ok(plan.blockers.includes('raydium-cpmm-config-id-required'));
  assert.ok(plan.blockers.includes('deployment-gate-closed'));
  assert.equal(plan.safety.noProviderCall, true);
  assert.equal(plan.safety.requiresVerifiedLpAccountBeforeBurn, true);
});

test('raydium CPMM adapter derives unsigned pool build contract without signing', () => {
  const build = buildRaydiumCpmmCreatePoolTransaction({
    creator: wallet.address,
    baseMint: validMintPublicKey,
    quoteMint: 'So11111111111111111111111111111111111111112',
    baseDecimals: 6,
    quoteDecimals: 9,
    baseAmountRaw: '1000000000',
    quoteAmountRaw: '100000000',
    configId: SystemProgram.programId.toBase58(),
    recentBlockhash: '11111111111111111111111111111111',
    includeUnsignedTransaction: true
  });
  assert.equal(build.contract, 'bondr-raydium-cpmm-create-pool-build-v1');
  assert.equal(build.status, 'built');
  assert.equal(build.execution, 'unsigned-raydium-cpmm-create-pool-built-no-signing-no-broadcast');
  assert.equal(build.requiredSigners[0], wallet.address);
  assert.ok(build.derived.poolId);
  assert.ok(build.derived.lpMint);
  assert.ok(build.transactionBase64);
  assert.ok(build.programs?.includes('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'));
  assert.equal(build.policyReview?.signerMatched, true);
  assert.equal(build.policyReview?.baseMintReferenced, true);
  assert.equal(build.policyReview?.quoteMintReferenced, true);
  assert.equal(build.policyReview?.programsAllowed, true);
  assert.equal(build.policyReview?.safeToRequestSignatureAfterSimulation, true);
  assert.deepEqual(build.policyReview?.blockers, []);
  assert.equal(build.safety.noSigning, true);
  assert.equal(build.safety.requiresSimulationBeforeSigning, true);
});

test('raydium LP simulation policy binds unsigned pool transaction to proof before signing', () => {
  const build = buildRaydiumCpmmCreatePoolTransaction({
    creator: wallet.address,
    baseMint: validMintPublicKey,
    quoteMint: 'So11111111111111111111111111111111111111112',
    baseDecimals: 6,
    quoteDecimals: 9,
    baseAmountRaw: '1000000000',
    quoteAmountRaw: '100000000',
    configId: SystemProgram.programId.toBase58(),
    recentBlockhash: '11111111111111111111111111111111',
    includeUnsignedTransaction: true
  });
  const policy = buildRaydiumLpSimulationPolicy({
    transactionBase64: build.transactionBase64,
    expectedSigner: wallet.address,
    baseMint: validMintPublicKey,
    quoteMint: 'So11111111111111111111111111111111111111112',
    requiredAccounts: build.policyReview?.requiredAccounts,
    transactionMessageHash: build.messageHash,
    simulationProof: { err: null, logs: ['Program log: raydium simulation ok'], unitsConsumed: 123456, provider: 'quicknode' }
  });

  assert.equal(policy.contract, 'bondr-raydium-lp-simulation-policy-v1');
  assert.equal(policy.status, 'passed');
  assert.equal(policy.execution, 'raydium-lp-policy-and-simulation-review-no-signing-no-broadcast');
  assert.equal(policy.policyReview.signerMatched, true);
  assert.equal(policy.policyReview.baseMintReferenced, true);
  assert.equal(policy.policyReview.quoteMintReferenced, true);
  assert.equal(policy.policyReview.programsAllowed, true);
  assert.equal(policy.simulationReview.passed, true);
  assert.equal(policy.safeToRequestSignature, true);
  assert.deepEqual(policy.blockers, []);
  assert.equal(policy.safety.noSigning, true);
  assert.equal(policy.safety.noBroadcast, true);
});

test('raydium LP simulation policy blocks signing without simulation proof', () => {
  const build = buildRaydiumCpmmCreatePoolTransaction({
    creator: wallet.address,
    baseMint: validMintPublicKey,
    quoteMint: 'So11111111111111111111111111111111111111112',
    baseDecimals: 6,
    quoteDecimals: 9,
    baseAmountRaw: '1000000000',
    quoteAmountRaw: '100000000',
    configId: SystemProgram.programId.toBase58(),
    recentBlockhash: '11111111111111111111111111111111',
    includeUnsignedTransaction: true
  });
  const policy = buildRaydiumLpSimulationPolicy({
    transactionBase64: build.transactionBase64,
    expectedSigner: wallet.address,
    baseMint: validMintPublicKey,
    quoteMint: 'So11111111111111111111111111111111111111112',
    requiredAccounts: build.policyReview?.requiredAccounts,
    transactionMessageHash: build.messageHash
  });

  assert.equal(policy.status, 'blocked');
  assert.ok(policy.blockers.includes('simulation-proof-required'));
  assert.equal(policy.safeToRequestSignature, false);
});

test('raydium CPMM adapter previews missing inputs without unsigned transaction', () => {
  const preview = buildRaydiumCpmmCreatePoolTransaction({ creator: wallet.address, baseMint: validMintPublicKey });
  assert.equal(preview.status, 'blocked');
  assert.equal(preview.execution, 'raydium-cpmm-create-pool-preview-no-signing-no-broadcast');
  assert.ok(preview.blockers.includes('raydium-cpmm-config-id-required'));
  assert.equal(preview.transactionBase64, undefined);
});

test('raydium config route exposes read-only native config contract', () => {
  const source = readFileSync(new URL('../apps/web/app/api/deployment/raydium/config/route.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('buildRaydiumRouteConfig'));
  assert.ok(source.includes('GET(request: Request)'));
  assert.ok(source.includes('POST(request: Request)'));
  assert.ok(!source.includes('meridianAuthRequiredResponse'));
  assert.ok(!source.includes('sendTransaction'));
  assert.ok(!source.includes('signTransaction'));
});

test('raydium LP proof decodes AMM v4 LP mint and blocks unsupported owners', () => {
  const lpMint = new PublicKey('BQWP7hhYKb5qEp4wjtJoQYxAanzFV5uev4v476tRehAj');
  const data = Buffer.alloc(RAYDIUM_AMM_V4_LP_MINT_OFFSET + 64);
  data.set(lpMint.toBytes(), RAYDIUM_AMM_V4_LP_MINT_OFFSET);
  const proof = resolveRaydiumAmmV4LpMintProof(RAYDIUM_AMM_V4_PROGRAM_ID, data);
  assert.equal(proof.contract, 'bondr-raydium-lp-mint-proof-v1');
  assert.equal(proof.status, 'resolved');
  assert.equal(proof.lpMint, lpMint.toBase58());
  assert.equal(proof.offset, RAYDIUM_AMM_V4_LP_MINT_OFFSET);
  assert.deepEqual(proof.blockers, []);

  const blocked = resolveRaydiumAmmV4LpMintProof(SystemProgram.programId.toBase58(), data);
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.blockers.includes('raydium-amm-v4-owner-required'));
});

test('Raydium launch receipt requires pool and verified LP account proof', () => {
  const lpMint = new PublicKey('BQWP7hhYKb5qEp4wjtJoQYxAanzFV5uev4v476tRehAj');
  const lpTokenAccount = 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP';
  const data = Buffer.alloc(RAYDIUM_AMM_V4_LP_MINT_OFFSET + 64);
  data.set(lpMint.toBytes(), RAYDIUM_AMM_V4_LP_MINT_OFFSET);
  const mintProof = resolveRaydiumAmmV4LpMintProof(RAYDIUM_AMM_V4_PROGRAM_ID, data);
  const proof = buildRaydiumLpTokenAccountProof({
    expectedOwner: wallet.address,
    lpTokenAccount,
    lpTokenOwner: wallet.address,
    lpTokenMint: lpMint.toBase58(),
    amountRaw: '1000000000',
    mintProof
  });
  const receipt = normalizeRaydiumLaunchReceipt({
    signature: '2SSk4HBp9WYZbQPVQ1LP6ZfQJYEpkoBNwZw8VnrHjhuppRf3bT8MzjQFWSkBJqVnNvF3pNhpYinTY91Hu66u5Pth',
    tokenMint: validMintPublicKey,
    poolId: '7aL2JQwYsYfS9yu2e9SYRSnSJg3XMqbe6LbkFGra6ATq',
    lpMint: lpMint.toBase58(),
    lpTokenAccount,
    lpAmountRaw: '1000000000',
    deployer: wallet.address,
    confirmedAt: '2026-08-16T00:00:00.000Z',
    lpTokenAccountProof: proof
  });
  assert.equal(receipt.contract, 'bondr-raydium-launch-receipt-v1');
  assert.equal(receipt.status, 'confirmed');
  assert.equal(receipt.route, 'raydium');
  assert.equal(receipt.poolId, '7aL2JQwYsYfS9yu2e9SYRSnSJg3XMqbe6LbkFGra6ATq');
  assert.equal(receipt.proofStatus, 'verified');
  assert.deepEqual(receipt.blockers, []);
  assert.equal(receipt.safety.noPumpFunDependency, true);

  const blocked = normalizeRaydiumLaunchReceipt({
    signature: receipt.signature!,
    tokenMint: validMintPublicKey,
    poolId: receipt.poolId!,
    lpMint: lpMint.toBase58(),
    lpTokenAccount,
    lpAmountRaw: '1000000000',
    deployer: wallet.address
  });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.blockers.includes('lp-token-account-proof-required'));
});

test('raydium LP token account proof verifies owner, mint, and positive balance before burn', () => {
  const lpMint = new PublicKey('BQWP7hhYKb5qEp4wjtJoQYxAanzFV5uev4v476tRehAj');
  const data = Buffer.alloc(RAYDIUM_AMM_V4_LP_MINT_OFFSET + 64);
  data.set(lpMint.toBytes(), RAYDIUM_AMM_V4_LP_MINT_OFFSET);
  const mintProof = resolveRaydiumAmmV4LpMintProof(RAYDIUM_AMM_V4_PROGRAM_ID, data);
  const proof = buildRaydiumLpTokenAccountProof({
    expectedOwner: wallet.address,
    lpTokenAccount: 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP',
    lpTokenOwner: wallet.address,
    lpTokenMint: lpMint.toBase58(),
    amountRaw: '1000000000',
    mintProof
  });
  assert.equal(proof.contract, 'bondr-raydium-lp-token-account-proof-v1');
  assert.equal(proof.status, 'verified');
  assert.equal(proof.lpMint, lpMint.toBase58());
  assert.deepEqual(proof.blockers, []);
  assert.equal(proof.safety.proofRequiredBeforeBurn, true);

  const blocked = buildRaydiumLpTokenAccountProof({
    expectedOwner: wallet.address,
    lpTokenAccount: 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP',
    lpTokenOwner: SystemProgram.programId.toBase58(),
    lpTokenMint: lpMint.toBase58(),
    amountRaw: '0',
    mintProof
  });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.blockers.includes('lp-token-account-owner-mismatch'));
  assert.ok(blocked.blockers.includes('lp-token-balance-required'));
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

test('verified LP burn builder requires Raydium LP token account proof', () => {
  const lpMint = new PublicKey('BQWP7hhYKb5qEp4wjtJoQYxAanzFV5uev4v476tRehAj');
  const data = Buffer.alloc(RAYDIUM_AMM_V4_LP_MINT_OFFSET + 64);
  data.set(lpMint.toBytes(), RAYDIUM_AMM_V4_LP_MINT_OFFSET);
  const mintProof = resolveRaydiumAmmV4LpMintProof(RAYDIUM_AMM_V4_PROGRAM_ID, data);
  const proof = buildRaydiumLpTokenAccountProof({
    expectedOwner: wallet.address,
    lpTokenAccount: 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP',
    lpTokenOwner: wallet.address,
    lpTokenMint: lpMint.toBase58(),
    amountRaw: '1000000000',
    mintProof
  });
  const burn = buildVerifiedLpBurnTransaction({
    owner: wallet.address,
    lpMint: lpMint.toBase58(),
    lpTokenAccount: 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP',
    amount: 1,
    decimals: 9,
    recentBlockhash: 'C5c8RwRiHGgqoSYHXNYTFxnFFuVEqjqBPadZnuaUtV87',
    proof
  });
  assert.equal(burn.execution, 'unsigned-verified-lp-burn-transaction-built-no-signing-no-broadcast');
  assert.equal(burn.proofContract, 'bondr-raydium-lp-token-account-proof-v1');
  assert.equal(burn.transactionMessageHash.length, 64);
  assert.equal(burn.safety.proofBoundBeforeBuild, true);

  const blockedProof = { ...proof, status: 'blocked' as const, blockers: ['lp-token-account-owner-mismatch'] };
  assert.throws(() => buildVerifiedLpBurnTransaction({
    owner: wallet.address,
    lpMint: lpMint.toBase58(),
    lpTokenAccount: 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP',
    amount: 1,
    decimals: 9,
    recentBlockhash: 'C5c8RwRiHGgqoSYHXNYTFxnFFuVEqjqBPadZnuaUtV87',
    proof: blockedProof
  }), /verified LP token account proof/);
});

test('verified LP burn signature handoff requires matching simulation proof hash', () => {
  const lpMint = new PublicKey('BQWP7hhYKb5qEp4wjtJoQYxAanzFV5uev4v476tRehAj');
  const data = Buffer.alloc(RAYDIUM_AMM_V4_LP_MINT_OFFSET + 64);
  data.set(lpMint.toBytes(), RAYDIUM_AMM_V4_LP_MINT_OFFSET);
  const mintProof = resolveRaydiumAmmV4LpMintProof(RAYDIUM_AMM_V4_PROGRAM_ID, data);
  const proof = buildRaydiumLpTokenAccountProof({
    expectedOwner: wallet.address,
    lpTokenAccount: 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP',
    lpTokenOwner: wallet.address,
    lpTokenMint: lpMint.toBase58(),
    amountRaw: '1000000000',
    mintProof
  });
  const base = {
    owner: wallet.address,
    lpMint: lpMint.toBase58(),
    lpTokenAccount: 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP',
    amount: 1,
    decimals: 9,
    recentBlockhash: 'C5c8RwRiHGgqoSYHXNYTFxnFFuVEqjqBPadZnuaUtV87',
    proof
  };

  const missing = buildSimulationVerifiedLpBurnSignatureHandoff(base);
  assert.equal(missing.contract, 'bondr-lp-burn-signature-handoff-v1');
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.safeToRequestSignature, false);
  assert.ok(missing.blockers.includes('lp-burn-simulation-proof-required'));

  const mismatched = buildSimulationVerifiedLpBurnSignatureHandoff({
    ...base,
    simulationProof: { status: 'ok', transactionMessageHash: 'b'.repeat(64), err: null, provider: 'quicknode' }
  });
  assert.ok(mismatched.blockers.includes('lp-burn-simulation-hash-mismatch'));

  const failed = buildSimulationVerifiedLpBurnSignatureHandoff({
    ...base,
    simulationProof: { status: 'failed', transactionMessageHash: missing.transactionMessageHash, err: { InstructionError: [0, 'Custom'] }, provider: 'quicknode' }
  });
  assert.ok(failed.blockers.includes('lp-burn-simulation-status-not-ok'));
  assert.ok(failed.blockers.includes('lp-burn-simulation-failed'));

  const passed = buildSimulationVerifiedLpBurnSignatureHandoff({
    ...base,
    simulationProof: { status: 'ok', transactionMessageHash: missing.transactionMessageHash, err: null, provider: 'quicknode', unitsConsumed: 1000 }
  });
  assert.equal(passed.status, 'ready');
  assert.equal(passed.safeToRequestSignature, true);
  assert.equal(passed.simulationProof.transactionMessageHash, passed.transactionMessageHash);
  assert.equal(passed.safety.simulationProofBoundBeforeSignature, true);
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

test('Raydium post-broadcast LP proof requires confirmed pool and LP account evidence', () => {
  const lpMint = new PublicKey('BQWP7hhYKb5qEp4wjtJoQYxAanzFV5uev4v476tRehAj');
  const poolId = 'E1yVt3FsrMqD1NeRbCBjRNrZjVwVoY8tZz4YnJBGxz5x';
  const lpTokenAccount = 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP';
  const data = Buffer.alloc(RAYDIUM_AMM_V4_LP_MINT_OFFSET + 64);
  data.set(lpMint.toBytes(), RAYDIUM_AMM_V4_LP_MINT_OFFSET);
  const mintProof = resolveRaydiumAmmV4LpMintProof(RAYDIUM_AMM_V4_PROGRAM_ID, data);
  const signature = '5'.repeat(88);
  const base = {
    signature,
    expectedPoolId: poolId,
    observedPoolId: poolId,
    expectedOwner: wallet.address,
    lpTokenAccount,
    lpTokenOwner: wallet.address,
    lpTokenMint: lpMint.toBase58(),
    amountRaw: '1000000000',
    mintProof,
    transactionMessageHash: 'a'.repeat(64),
    simulationTransactionMessageHash: 'a'.repeat(64),
    confirmedAt: '2026-08-16T12:00:00Z'
  };

  const missingConfirmation = buildRaydiumPostBroadcastLpAccountProof({ ...base, confirmedAt: null });
  assert.equal(missingConfirmation.status, 'blocked');
  assert.ok(missingConfirmation.blockers.includes('raydium-lp-broadcast-confirmation-required'));

  const wrongPool = buildRaydiumPostBroadcastLpAccountProof({
    ...base,
    observedPoolId: 'BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU'
  });
  assert.ok(wrongPool.blockers.includes('raydium-pool-id-mismatch'));

  const wrongHash = buildRaydiumPostBroadcastLpAccountProof({ ...base, simulationTransactionMessageHash: 'b'.repeat(64) });
  assert.ok(wrongHash.blockers.includes('simulation-transaction-message-hash-mismatch'));

  const wrongOwner = buildRaydiumPostBroadcastLpAccountProof({
    ...base,
    lpTokenOwner: 'BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU'
  });
  assert.ok(wrongOwner.blockers.includes('lp-token-account-owner-mismatch'));
  assert.equal(wrongOwner.tokenAccountProofStatus, 'blocked');

  const verified = buildRaydiumPostBroadcastLpAccountProof(base);
  assert.equal(verified.contract, 'bondr-raydium-post-broadcast-lp-account-proof-v1');
  assert.equal(verified.status, 'verified');
  assert.equal(verified.signature, signature);
  assert.equal(verified.poolId, poolId);
  assert.equal(verified.lpMint, lpMint.toBase58());
  assert.equal(verified.lpTokenAccount, lpTokenAccount);
  assert.equal(verified.tokenAccountProof.status, 'verified');
  assert.equal(verified.safety.readOnlyPostBroadcastProof, true);
  assert.equal(verified.safety.noSigning, true);
  assert.equal(verified.safety.noBroadcast, true);
});

test('Raydium post-broadcast proof can be built from real receipt/account observations', () => {
  const lpMint = new PublicKey('BQWP7hhYKb5qEp4wjtJoQYxAanzFV5uev4v476tRehAj');
  const poolId = 'E1yVt3FsrMqD1NeRbCBjRNrZjVwVoY8tZz4YnJBGxz5x';
  const lpTokenAccount = 'FJiBxPRAqQZjkpbpszBRDidEUiDbCQ3ovmAL7tNtP4aP';
  const data = Buffer.alloc(RAYDIUM_AMM_V4_LP_MINT_OFFSET + 64);
  data.set(lpMint.toBytes(), RAYDIUM_AMM_V4_LP_MINT_OFFSET);
  const base = {
    expectedPoolId: poolId,
    expectedOwner: wallet.address,
    transaction: {
      signature: '5'.repeat(88),
      slot: 328_000_001,
      err: null,
      accountKeys: [wallet.address, poolId, lpTokenAccount],
      blockTime: 1_786_923_200
    },
    poolAccount: {
      poolId,
      ownerProgram: RAYDIUM_AMM_V4_PROGRAM_ID,
      accountData: data
    },
    lpTokenAccount: {
      lpTokenAccount,
      owner: wallet.address,
      mint: lpMint.toBase58(),
      amountRaw: '1000000000'
    },
    transactionMessageHash: 'a'.repeat(64),
    simulationTransactionMessageHash: 'a'.repeat(64)
  };
  const proof = buildRaydiumPostBroadcastLpAccountProofFromObservation(base);
  assert.equal(proof.contract, 'bondr-raydium-post-broadcast-lp-account-proof-v1');
  assert.equal(proof.status, 'verified');
  assert.equal(proof.observationSource, 'solana-rpc');
  assert.equal(proof.chainObservation.transactionStatus, 'confirmed');
  assert.equal(proof.chainObservation.accountKeyMatched, true);
  assert.equal(proof.poolId, poolId);
  assert.equal(proof.lpMint, lpMint.toBase58());
  assert.equal(proof.lpTokenAccount, lpTokenAccount);
  assert.equal(proof.confirmedAt, '2026-08-16T23:33:20.000Z');
  assert.equal(proof.safety.readOnlyPostBroadcastProof, true);

  const missingPoolKey = buildRaydiumPostBroadcastLpAccountProofFromObservation({
    ...base,
    transaction: { ...base.transaction, accountKeys: [wallet.address, lpTokenAccount] }
  });
  assert.equal(missingPoolKey.status, 'blocked');
  assert.ok(missingPoolKey.blockers.includes('raydium-lp-transaction-missing-expected-pool-account'));

  const failedTransaction = buildRaydiumPostBroadcastLpAccountProofFromObservation({
    ...base,
    transaction: { ...base.transaction, err: { InstructionError: [2, 'Custom'] } }
  });
  assert.equal(failedTransaction.status, 'blocked');
  assert.ok(failedTransaction.blockers.includes('raydium-lp-transaction-failed'));

  const missingOwnerLpAccount = buildRaydiumPostBroadcastLpAccountProofFromObservation({
    ...base,
    lpTokenAccount: null
  });
  assert.equal(missingOwnerLpAccount.status, 'blocked');
  assert.ok(missingOwnerLpAccount.blockers.includes('raydium-owner-lp-token-account-not-found'));
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

test('raydium build-lp sensitive POST requires Meridian operator auth before unsigned build', async () => {
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
    const request = new Request('https://bondr.test/api/deployment/raydium/build-lp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://bondr.test' },
      body: JSON.stringify({
        creator: wallet.address,
        baseMint: validMintPublicKey,
        baseAmountRaw: '1000000000',
        quoteAmountRaw: '100000000',
        configId: SystemProgram.programId.toBase58(),
        includeUnsignedTransaction: true
      })
    });
    const response = await raydiumBuildLpPost(request);
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

test('raydium build-lp route protects unsigned pool handoff', () => {
  const source = readFileSync(new URL('../apps/web/app/api/deployment/raydium/build-lp/route.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("import { meridianAuthRequiredResponse }"));
  assert.ok(source.includes('input.includeUnsignedTransaction'));
  assert.ok(source.includes('const authBlocked = await meridianAuthRequiredResponse(request);'));
  assert.ok(source.includes('rateLimit(request)'));
  assert.ok(source.includes('raydium-build-rate-limited-no-signing-no-broadcast'));
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

test('deployment UI and truth map expose Jito packed orchestration', () => {
  const pageSource = readFileSync(new URL('../apps/web/app/deployment/page.tsx', import.meta.url), 'utf8');
  const capabilitySource = readFileSync(new URL('../apps/web/app/api/execution-capabilities/route.ts', import.meta.url), 'utf8');
  const truthMapProject: Project = {
    ...project,
    launchConfig: {
      ...project.launchConfig!,
      walletPlan: [
        ...project.launchConfig!.walletPlan,
        { walletId: 'dev-wallet', role: 'task wallet', participate: true, executionPhase: 'task', taskType: 'auto-take-profit', plannedBuySol: 0, maxBuySol: 0.01, maxSlippageBps: 100, takeProfitPercents: [35], stopLossPct: -18, trailingStopPct: 22, perTxSellCapPct: 25, cooldownSeconds: 60, taskMaxExecutions: 3 }
      ]
    }
  };
  const store: MeridianStore = {
    projects: [truthMapProject],
    wallets: [{ ...wallet, custodyMode: undefined }],
    walletGroups: [{ id: 'operator-wallets', name: 'Operator Wallets', scope: 'global', walletIds: [wallet.id] }],
    flowEvents: [],
    eventLog: []
  };
  const truth = buildExecutionTruthMap({ store, projectId: project.id, activation });
  const deploymentRail = truth.rails.find((rail) => rail.rail === 'deployment');
  const bundleRail = truth.rails.find((rail) => rail.rail === 'bundle');
  const sniperRail = truth.rails.find((rail) => rail.rail === 'sniper');
  const taskRail = truth.rails.find((rail) => rail.rail === 'task');
  assert.ok(pageSource.includes('Jito orchestration'));
  assert.ok(pageSource.includes('Pump.fun/Raydium/Jupiter route policy proof'));
  assert.ok(pageSource.includes('/api/bundle-sequencer mode=build-packed'));
  assert.ok(pageSource.includes('/api/relay/jito/wave-dispatch-plan'));
  assert.ok(pageSource.includes('/api/live-test-plan'));
  assert.ok(capabilitySource.includes("liveTestPlan: '/api/live-test-plan'"));
  assert.equal(deploymentRail?.steps.find((item) => item.step === 'builder')?.status, 'rehearsal-only');
  assert.equal(deploymentRail?.steps.find((item) => item.step === 'recovery')?.status, 'rehearsal-only');
  assert.ok(deploymentRail?.steps.find((item) => item.step === 'recovery')?.blockers.includes('deployment-rebuild-runner-missing'));
  assert.equal(bundleRail?.steps.find((item) => item.step === 'builder')?.detail.includes('route-policy-proven'), true);
  assert.equal(bundleRail?.steps.find((item) => item.step === 'receipt')?.status, 'rehearsal-only');
  assert.equal(bundleRail?.steps.find((item) => item.step === 'monitor')?.detail.includes('Post-chain effect proof'), true);
  assert.equal(sniperRail?.nextAction.includes('/api/sniper/trigger-preview'), true);
  assert.equal(taskRail?.nextAction.includes('/api/tasks/queue-preview'), true);
  assert.equal(sniperRail?.steps.find((item) => item.step === 'builder')?.status, 'rehearsal-only');
  assert.equal(sniperRail?.steps.find((item) => item.step === 'recovery')?.status, 'rehearsal-only');
  assert.ok(sniperRail?.steps.find((item) => item.step === 'monitor')?.blockers.includes('sniper-trigger-engine-missing'));
  assert.equal(taskRail?.steps.find((item) => item.step === 'builder')?.status, 'rehearsal-only');
  assert.equal(taskRail?.steps.find((item) => item.step === 'simulation')?.status, 'rehearsal-only');
  assert.ok(taskRail?.steps.find((item) => item.step === 'monitor')?.blockers.includes('durable-task-runner-missing'));
});

test('live test plan lists remaining controlled tests and retired harnesses', () => {
  const routeSource = readFileSync(new URL('../apps/web/app/api/live-test-plan/route.ts', import.meta.url), 'utf8');
  const capabilitySource = readFileSync(new URL('../apps/web/app/api/execution-capabilities/route.ts', import.meta.url), 'utf8');
  const plan = buildLiveTestPlan();
  assert.equal(plan.contract, 'bondr-live-test-plan-v1');
  assert.equal(plan.status, 'new-tests-focused');
  assert.equal(plan.liveExecutionAllowed, false);
  assert.equal(plan.remainingCount, 2);
  assert.equal(plan.safety.noSigning, true);
  assert.equal(plan.safety.noBroadcast, true);
  assert.deepEqual(plan.items.map((item) => item.id), ['jito-bundle-launch', 'sniper-task-automation']);
  assert.ok(plan.items.some((item) => item.id === 'jito-bundle-launch' && item.harnesses.includes('/api/relay/jito/wave-dispatch-plan')));
  assert.ok(plan.items.some((item) => item.id === 'sniper-task-automation' && item.harnesses.includes('/api/tasks/queue-preview')));
  assert.ok(plan.recurringSafetyChecks.some((item) => item.id === 'single-broadcast-gate' && item.harnesses.includes('/api/send-signed-transaction')));
  assert.ok(plan.recurringSafetyChecks.some((item) => item.id === 'pumpfun-controlled-launch' && item.harnesses.includes('/api/deployment/pumpportal/build-create')));
  assert.ok(plan.recurringSafetyChecks.some((item) => item.id === 'raydium-lp-burn' && item.harnesses.includes('/api/deployment/raydium/lp-account-proof')));
  assert.ok(plan.retiredHarnesses.some((item) => item.removedRoute === '/api/authenticated-qa-checklist'));
  assert.ok(plan.retiredHarnesses.some((item) => item.removedRoute === '/live-beta-test'));
  assert.doesNotMatch(JSON.stringify(plan.retainedHarnesses), /authenticated-qa-checklist/);
  assert.ok(routeSource.includes('live-test-plan-read-only-no-signing-no-broadcast-no-mutation'));
  assert.ok(capabilitySource.includes("liveTestPlan: '/api/live-test-plan'"));
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
  assert.ok(source.includes('simulationTransactionMessageHash: body.simulationTransactionMessageHash'));
  assert.ok(source.includes('broadcastPolicy: body.broadcastPolicy'));
});

test('launch config mutation requires Meridian operator auth', () => {
  const source = readFileSync(new URL('../apps/web/app/api/projects/[id]/launch-config/route.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("import { meridianAuthRequiredResponse }"));
  assert.ok(source.includes('const authBlocked = await meridianAuthRequiredResponse(request);'));
  assert.ok(source.indexOf('meridianAuthRequiredResponse(request)') < source.indexOf('sameOriginAllowed(request)'));
});

test('launch receipt normalization rejects invalid mint public keys', () => {
  const messageHash = 'a'.repeat(64);
  const valid = normalizeLaunchReceipt({
    signature: '2SSk4HBp9WYZbQPVQ1LP6ZfQJYEpkoBNwZw8VnrHjhuppRf3bT8MzjQFWSkBJqVnNvF3pNhpYinTY91Hu66u5Pth',
    tokenMint: 'AtowBVrQfHZkmL5zvPBM6pyYQgz6ByZcZ5JTSJwRvWcu',
    transactionMessageHash: messageHash,
    simulationTransactionMessageHash: messageHash,
    simulationStatus: 'ok',
    broadcastPolicy: { maxRetries: 0, blindRetries: false, skipPreflight: false, preflightCommitment: 'confirmed' }
  });
  assert.equal(valid.receipt?.tokenMint, 'AtowBVrQfHZkmL5zvPBM6pyYQgz6ByZcZ5JTSJwRvWcu');
  assert.equal(valid.receipt?.transactionMessageHash, messageHash);
  assert.equal(valid.receipt?.simulationTransactionMessageHash, messageHash);
  assert.equal(valid.receipt?.simulationStatus, 'ok');
  assert.equal(valid.receipt?.broadcastPolicy?.blindRetries, false);

  const invalid = normalizeLaunchReceipt({
    signature: '2SSk4HBp9WYZbQPVQ1LP6ZfQJYEpkoBNwZw8VnrHjhuppRf3bT8MzjQFWSkBJqVnNvF3pNhpYinTY91Hu66u5Pth',
    tokenMint: 'bad-mint'
  });
  assert.equal(invalid.error, 'Valid launched token mint is required.');
});

test('launch receipt normalization rejects mismatched simulation proof evidence', () => {
  const base = {
    signature: '2SSk4HBp9WYZbQPVQ1LP6ZfQJYEpkoBNwZw8VnrHjhuppRf3bT8MzjQFWSkBJqVnNvF3pNhpYinTY91Hu66u5Pth',
    tokenMint: 'AtowBVrQfHZkmL5zvPBM6pyYQgz6ByZcZ5JTSJwRvWcu'
  };
  assert.equal(normalizeLaunchReceipt({ ...base, transactionMessageHash: 'not-a-hash' }).error, 'Valid transaction message hash is required when provided.');
  assert.equal(normalizeLaunchReceipt({ ...base, transactionMessageHash: 'a'.repeat(64), simulationTransactionMessageHash: 'b'.repeat(64), simulationStatus: 'ok' }).error, 'Simulation proof hash must match the launched transaction message hash.');
  assert.equal(normalizeLaunchReceipt({ ...base, transactionMessageHash: 'a'.repeat(64), simulationTransactionMessageHash: 'a'.repeat(64), simulationStatus: 'failed' }).error, 'Launch receipt simulation status must be ok when provided.');
});

test('launch receipt persistence records broadcast proof fields after launch submit', () => {
  const sendSource = readFileSync(new URL('../apps/web/app/api/send-signed-transaction/route.ts', import.meta.url), 'utf8');
  const pageSource = readFileSync(new URL('../apps/web/app/deployment/page.tsx', import.meta.url), 'utf8');
  const reconciliationSource = readFileSync(new URL('../apps/web/lib/launch-reconciliation.ts', import.meta.url), 'utf8');

  assert.ok(sendSource.includes('simulationTransactionMessageHash,'));
  assert.ok(sendSource.includes('broadcastPolicy: {'));
  assert.ok(sendSource.includes('maxRetries: SINGLE_BROADCAST_MAX_RETRIES'));
  assert.ok(pageSource.includes('launchReceipt.simulationTransactionMessageHash'));
  assert.ok(pageSource.includes('launchReceipt.broadcastPolicy?.maxRetries'));
  assert.ok(reconciliationSource.includes('simulationTransactionMessageHash: receipt?.simulationTransactionMessageHash'));
  assert.ok(reconciliationSource.includes('broadcastPolicy: receipt?.broadcastPolicy'));
});

test('launch reconciliation blocks without a launch receipt', async () => {
  const result = await buildLaunchReconciliation(project, 'https://bondr.test', async () => {
    throw new Error('fetch should not be called without a launch receipt');
  });
  assert.equal(result.contract, 'bondr-launch-reconciliation-v1');
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('launch-receipt-missing'));
  assert.equal(result.execution, 'read-only-launch-reconciliation-no-signing-no-broadcast');
});

test('launch reconciliation uses receipt mint and normalizes provider evidence', async () => {
  const launched = structuredClone(project);
  launched.status = 'deployed';
  launched.tokenMint = 'AtowBVrQfHZkmL5zvPBM6pyYQgz6ByZcZ5JTSJwRvWcu';
  launched.launchReceipt = {
    status: 'confirmed',
    signature: '2SSk4HBp9WYZbQPVQ1LP6ZfQJYEpkoBNwZw8VnrHjhuppRf3bT8MzjQFWSkBJqVnNvF3pNhpYinTY91Hu66u5Pth',
    explorerUrl: 'https://solscan.io/tx/2SSk4HBp9WYZbQPVQ1LP6ZfQJYEpkoBNwZw8VnrHjhuppRf3bT8MzjQFWSkBJqVnNvF3pNhpYinTY91Hu66u5Pth',
    tokenMint: launched.tokenMint,
    pool: null,
    deployer: wallet.address,
    route: 'pump.fun',
    provider: 'quicknode',
    observedAt: '2026-08-15T22:40:53.000Z',
    confirmedAt: '2026-08-15T22:40:53.000Z',
    transactionMessageHash: 'a'.repeat(64),
    simulationTransactionMessageHash: 'a'.repeat(64),
    simulationStatus: 'ok',
    broadcastPolicy: { maxRetries: 0, blindRetries: false, skipPreflight: false, preflightCommitment: 'confirmed' }
  };
  const calls: string[] = [];
  const result = await buildLaunchReconciliation(launched, 'https://bondr.test', async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/api/token-market-feed')) {
      return Response.json({ status: 'ok', bestPair: { dex: 'pumpfun', pairAddress: 'pair111111111111111111111111111111111111111', url: 'https://dexscreener.com/solana/pair', liquidityUsd: 2100, volume24h: 333, priceUsd: '0.0000021' } });
    }
    if (url.includes('/api/token-stats')) {
      return Response.json({
        status: 'ok',
        supply: { uiAmount: 1_000_000_000, decimals: 6, raw: '1000000000000000' },
        holders: { totalHolders: 7, returnedRows: 2, rows: [{ owner: wallet.address, uiAmount: 100 }] },
        concentration: { top10Pct: 32 },
        devHolding: { amount: 100, pct: 0.01, status: 'ok' },
        rugcheck: { mintAuthority: null, freezeAuthority: null }
      });
    }
    if (url.includes('/api/pumpfun/token')) {
      return Response.json({ status: 'ok', migration: { complete: false, raydiumPool: null, marketCap: 2100, virtualSolReserves: 30 } });
    }
    if (url.includes('/api/token-transactions')) {
      return Response.json({ status: 'ok', trades: [{ wallet: wallet.address, side: 'buy', volumeUsd: 25, timestamp: '2026-08-15T22:41:00.000Z' }] });
    }
    return Response.json({ status: 'error' }, { status: 404 });
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.mint, launched.tokenMint);
  assert.equal(result.receipt.status, 'confirmed');
  assert.equal(result.receipt.simulationTransactionMessageHash, 'a'.repeat(64));
  assert.equal(result.receipt.broadcastPolicy?.blindRetries, false);
  assert.equal(result.pair.value?.liquidityUsd, 2100);
  assert.equal(result.market.value?.marketCap, 2100);
  assert.equal(result.holders.value?.totalHolders, 7);
  assert.equal(result.topTraders.value.rows[0]?.wallet, wallet.address);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.warnings, []);
  assert.ok(calls.some((url) => url.includes('/api/token-market-feed')));
  assert.ok(calls.some((url) => url.includes('/api/token-transactions')));
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

test('jito packed transaction proof route is exposed as read-only pre-relay proof', () => {
  const routeSource = readFileSync(new URL('../apps/web/app/api/relay/jito/packed-transaction-proof/route.ts', import.meta.url), 'utf8');
  const capabilitiesSource = readFileSync(new URL('../apps/web/app/api/execution-capabilities/route.ts', import.meta.url), 'utf8');
  const sequencerSource = readFileSync(new URL('../apps/web/app/api/bundle-sequencer/route.ts', import.meta.url), 'utf8');
  assert.ok(routeSource.includes('bondr-jito-packed-transaction-proof-v1'));
  assert.ok(routeSource.includes('decodeTransactionPolicyWithLookupTables'));
  assert.ok(routeSource.includes('buildJitoPackedTransactionProof'));
  assert.ok(routeSource.includes('noRelaySubmit: true'));
  assert.ok(routeSource.includes('noBroadcast: true'));
  assert.ok(capabilitiesSource.includes("jitoPackedTransactionProof: '/api/relay/jito/packed-transaction-proof'"));
  assert.ok(sequencerSource.includes("packedTransactionProofEndpoint: '/api/relay/jito/packed-transaction-proof'"));
});

test('jito address lookup table plan chunks addresses and builds unsigned lifecycle transactions', () => {
  const authority = Keypair.generate().publicKey.toBase58();
  const payer = Keypair.generate().publicKey.toBase58();
  const addresses = Array.from({ length: 65 }, () => Keypair.generate().publicKey.toBase58());
  const plan = buildJitoAddressLookupTablePlan({
    authority,
    payer,
    addresses,
    requiredAddresses: [addresses[0], addresses[64]],
    recentSlot: 123,
    recentBlockhash: '11111111111111111111111111111111',
    includeUnsignedTransactions: true
  });

  assert.equal(plan.contract, 'bondr-jito-address-lookup-table-plan-v1');
  assert.equal(plan.status, 'planned');
  assert.equal(plan.totalAddresses, 65);
  assert.deepEqual(plan.chunks.map((chunk) => chunk.count), [30, 30, 5]);
  assert.equal(plan.transactions.length, 4);
  assert.equal(plan.transactions[0].action, 'create-lookup-table');
  assert.equal(plan.transactions.slice(1).every((tx) => tx.action === 'extend-lookup-table'), true);
  assert.equal(plan.transactions.every((tx) => tx.transactionBase64 && tx.transactionMessageHash?.length === 64), true);
  assert.equal(plan.proof.allRequiredAddressesPlanned, true);
  assert.equal(plan.proof.canBuildUnsignedTransactions, true);
  assert.equal(plan.safety.noSigning, true);
  assert.equal(plan.safety.noBroadcast, true);
  assert.ok(plan.warnings.includes('lookup-table-extension-requires-multiple-transactions'));
});

test('jito address lookup table plan route is exposed as read-only preflight', () => {
  const routeSource = readFileSync(new URL('../apps/web/app/api/relay/jito/address-lookup-table-plan/route.ts', import.meta.url), 'utf8');
  const capabilitiesSource = readFileSync(new URL('../apps/web/app/api/execution-capabilities/route.ts', import.meta.url), 'utf8');
  assert.ok(routeSource.includes('bondr-jito-address-lookup-table-plan-v1'));
  assert.ok(routeSource.includes('buildJitoAddressLookupTablePlan'));
  assert.ok(routeSource.includes('noSigning: true'));
  assert.ok(routeSource.includes('noBroadcast: true'));
  assert.ok(routeSource.includes('noRelaySubmit: true'));
  assert.ok(capabilitiesSource.includes("jitoAddressLookupTablePlan: '/api/relay/jito/address-lookup-table-plan'"));
});

test('jito address lookup table plan blocks when required packed addresses are missing', () => {
  const authority = Keypair.generate().publicKey.toBase58();
  const payer = Keypair.generate().publicKey.toBase58();
  const included = Keypair.generate().publicKey.toBase58();
  const missing = Keypair.generate().publicKey.toBase58();
  const plan = buildJitoAddressLookupTablePlan({
    authority,
    payer,
    lookupTableAddress: Keypair.generate().publicKey.toBase58(),
    addresses: [included],
    requiredAddresses: [included, missing]
  });

  assert.equal(plan.status, 'blocked');
  assert.deepEqual(plan.missingRequiredAddresses, [missing]);
  assert.ok(plan.blockers.includes('lookup-table-required-addresses-missing-from-plan'));
  assert.equal(plan.proof.lookupTableReadyForPackedTransactions, false);
});

test('jito packed transaction builder compiles unsigned v0 packed wallet transactions', () => {
  const payer = Keypair.generate();
  const secondSigner = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const destination = Keypair.generate().publicKey;
  const lookupAddress = Keypair.generate().publicKey.toBase58();
  const result = buildJitoPackedTransaction({
    payer: payer.publicKey.toBase58(),
    recentBlockhash: '11111111111111111111111111111111',
    expectedMint: mint.toBase58(),
    requiredAccounts: [destination.toBase58()],
    lookupTables: [{ address: lookupAddress, addresses: [mint.toBase58(), destination.toBase58()] }],
    instructions: [{
      id: 'packed-buy-0',
      rail: 'bundle',
      programId: SystemProgram.programId.toBase58(),
      expectedSigner: secondSigner.publicKey.toBase58(),
      keys: [
        { pubkey: payer.publicKey.toBase58(), isSigner: true, isWritable: true },
        { pubkey: secondSigner.publicKey.toBase58(), isSigner: true, isWritable: true },
        { pubkey: mint.toBase58(), isWritable: false },
        { pubkey: destination.toBase58(), isWritable: true }
      ]
    }],
    allowedPrograms: [SystemProgram.programId.toBase58(), 'ComputeBudget111111111111111111111111111111']
  });

  assert.equal(result.contract, 'bondr-jito-packed-transaction-builder-v1');
  assert.equal(result.status, 'built');
  assert.ok(result.transactionBase64);
  assert.equal(result.expectedSigners.includes(payer.publicKey.toBase58()), true);
  assert.equal(result.expectedSigners.includes(secondSigner.publicKey.toBase58()), true);
  assert.equal(result.requiredSigners.includes(secondSigner.publicKey.toBase58()), true);
  assert.equal(result.addressLookupTables.required, true);
  assert.deepEqual(result.addressLookupTables.supplied, [lookupAddress]);
  assert.equal(result.transactionMessageHash?.length, 64);
  assert.equal(result.safety.noSigning, true);
});

test('jito route instruction source extracts prepared unsigned transaction legs', () => {
  const payer = Keypair.generate();
  const destination = Keypair.generate().publicKey;
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: destination, lamports: 1 })]
  }).compileToV0Message());
  const source = buildJitoRouteInstructionSource({
    preparedTransactions: [{
      id: 'jupiter-buy-0',
      rail: 'bundle',
      transactionBase64: Buffer.from(tx.serialize()).toString('base64'),
      expectedSigner: payer.publicKey.toBase58()
    }]
  });

  assert.equal(source.contract, 'bondr-jito-route-instruction-source-v1');
  assert.equal(source.status, 'ready');
  assert.deepEqual(source.preparedTransactionIds, ['jupiter-buy-0']);
  assert.equal(source.instructions.length, 1);
  assert.equal(source.instructions[0].id, 'jupiter-buy-0-ix-0');
  assert.equal(source.instructions[0].programId, SystemProgram.programId.toBase58());
  assert.deepEqual(source.expectedSigners, [payer.publicKey.toBase58()]);
  assert.equal(source.transactionMessageHashes[0].length, 64);
  assert.equal(source.safety.noRelaySubmit, true);
});

test('jito route instruction source requires route policy proof for Pump, Raydium, and Jupiter inputs', () => {
  const payer = Keypair.generate();
  const destination = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false }
      ],
      data: Buffer.alloc(0)
    })]
  }).compileToV0Message());
  const transactionBase64 = Buffer.from(tx.serialize()).toString('base64');
  const messageHash = buildJitoRouteInstructionSource({
    preparedTransactions: [{
      id: 'hash-source',
      transactionBase64,
      expectedSigner: payer.publicKey.toBase58()
    }]
  }).transactionMessageHashes[0];
  const routeInputs = [
    ['pumpfun-launch', '/api/deployment/pumpportal/build-create'],
    ['raydium-lp', '/api/deployment/raydium/build-lp'],
    ['jupiter-swap', '/api/execution-swap']
  ] as const;

  for (const [routeKind, sourceEndpoint] of routeInputs) {
    const source = buildJitoRouteInstructionSource({
      preparedTransactions: [{
        id: `${routeKind}-prepared`,
        rail: routeKind === 'raydium-lp' ? 'deployment' : 'bundle',
        transactionBase64,
        expectedSigner: payer.publicKey.toBase58(),
        expectedMint: mint.toBase58(),
        routeKind,
        sourceEndpoint,
        routePolicyStatus: 'passed',
        routePolicyTransactionMessageHash: messageHash
      }]
    });

    assert.equal(source.status, 'ready');
    assert.equal(source.routeAcceptance[0].routeKind, routeKind);
    assert.equal(source.routeAcceptance[0].status, 'accepted');
    assert.equal(source.routeAcceptance[0].sourceEndpoint, sourceEndpoint);
    assert.equal(source.routeAcceptance[0].transactionMessageHash, messageHash);
    assert.deepEqual(source.routeAcceptance[0].blockers, []);
    assert.equal(source.instructions.length, 1);
  }

  const blocked = buildJitoRouteInstructionSource({
    preparedTransactions: [{
      id: 'raydium-missing-proof',
      transactionBase64,
      expectedSigner: payer.publicKey.toBase58(),
      expectedMint: mint.toBase58(),
      routeKind: 'raydium-lp',
      sourceEndpoint: '/api/execution-swap',
      routePolicyStatus: 'missing',
      routePolicyTransactionMessageHash: 'b'.repeat(64)
    }]
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.routeAcceptance[0].status, 'blocked');
  assert.ok(blocked.blockers.includes('prepared-route-transaction-raydium-missing-proof-raydium-lp-source-endpoint-required'));
  assert.ok(blocked.blockers.includes('prepared-route-transaction-raydium-missing-proof-raydium-lp-policy-proof-required'));
  assert.ok(blocked.blockers.includes('prepared-route-transaction-raydium-missing-proof-raydium-lp-policy-message-hash-mismatch'));
});

test('jito final proof endpoints are exposed through execution capabilities', () => {
  const capabilitiesSource = readFileSync(new URL('../apps/web/app/api/execution-capabilities/route.ts', import.meta.url), 'utf8');
  const buildRouteSource = readFileSync(new URL('../apps/web/app/api/relay/jito/packed-transaction-build/route.ts', import.meta.url), 'utf8');
  const signingRouteSource = readFileSync(new URL('../apps/web/app/api/relay/jito/multi-wallet-signing-session/route.ts', import.meta.url), 'utf8');
  const waveRouteSource = readFileSync(new URL('../apps/web/app/api/relay/jito/wave-dispatch-plan/route.ts', import.meta.url), 'utf8');
  const effectRouteSource = readFileSync(new URL('../apps/web/app/api/relay/jito/chain-effect-proof/route.ts', import.meta.url), 'utf8');
  assert.ok(capabilitiesSource.includes("jitoPackedTransactionBuild: '/api/relay/jito/packed-transaction-build'"));
  assert.ok(capabilitiesSource.includes("jitoMultiWalletSigningSession: '/api/relay/jito/multi-wallet-signing-session'"));
  assert.ok(capabilitiesSource.includes("jitoWaveDispatchPlan: '/api/relay/jito/wave-dispatch-plan'"));
  assert.ok(capabilitiesSource.includes("jitoChainEffectProof: '/api/relay/jito/chain-effect-proof'"));
  assert.ok(buildRouteSource.includes('bondr-jito-packed-transaction-builder-v1'));
  assert.ok(signingRouteSource.includes('bondr-jito-multi-wallet-signing-session-v1'));
  assert.ok(waveRouteSource.includes('bondr-jito-wave-dispatch-plan-v1'));
  assert.ok(effectRouteSource.includes('bondr-jito-bundle-chain-effect-proof-v1'));
});

test('bundle sequencer loads packed transaction builder for prepared instruction legs', async () => {
  const payer = Keypair.generate();
  const secondSigner = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const destination = Keypair.generate().publicKey;
  const lookupAddress = Keypair.generate().publicKey.toBase58();
  const response = await bundleSequencerPost(new Request('http://localhost/api/bundle-sequencer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'build-packed',
      mint: mint.toBase58(),
      payer: payer.publicKey.toBase58(),
      recentBlockhash: '11111111111111111111111111111111',
      lookupTables: [{ address: lookupAddress, addresses: [mint.toBase58(), destination.toBase58()] }],
      legs: [
        { wallet: payer.publicKey.toBase58(), side: 'Buy', amount: '0.001', spendAsset: 'SOL', slippageBps: 100 },
        { wallet: secondSigner.publicKey.toBase58(), side: 'Buy', amount: '0.001', spendAsset: 'SOL', slippageBps: 100 }
      ],
      packedInstructions: [{
        id: 'packed-buy-0',
        rail: 'bundle',
        programId: SystemProgram.programId.toBase58(),
        expectedSigner: secondSigner.publicKey.toBase58(),
        keys: [
          { pubkey: payer.publicKey.toBase58(), isSigner: true, isWritable: true },
          { pubkey: secondSigner.publicKey.toBase58(), isSigner: true, isWritable: true },
          { pubkey: mint.toBase58(), isWritable: false },
          { pubkey: destination.toBase58(), isWritable: true }
        ]
      }],
      allowedPrograms: [SystemProgram.programId.toBase58(), 'ComputeBudget111111111111111111111111111111']
    })
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.flowType, 'multi-wallet-packed-transaction-build');
  assert.equal(payload.execution, 'packed-transaction-build-only-no-signing-no-relay-submit');
  assert.equal(payload.packedBuild.contract, 'bondr-jito-packed-transaction-builder-v1');
  assert.equal(payload.packedBuild.status, 'built');
  assert.equal(payload.packedBuild.transactionMessageHash.length, 64);
  assert.equal(payload.executionModel.packedTransactionBuildEndpoint, '/api/relay/jito/packed-transaction-build');
  assert.equal(payload.executionModel.signingSessionEndpoint, '/api/relay/jito/multi-wallet-signing-session');
  assert.equal(payload.packedBuild.safety.noRelaySubmit, true);
});

test('bundle sequencer can pack decoded prepared route transactions', async () => {
  const payer = Keypair.generate();
  const destination = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false }
      ],
      data: Buffer.alloc(0)
    })]
  }).compileToV0Message());
  const response = await bundleSequencerPost(new Request('http://localhost/api/bundle-sequencer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'build-packed',
      mint: mint.toBase58(),
      payer: payer.publicKey.toBase58(),
      recentBlockhash: '11111111111111111111111111111111',
      legs: [{ wallet: payer.publicKey.toBase58(), side: 'Buy', amount: '0.001', spendAsset: 'SOL', slippageBps: 100 }],
      preparedTransactions: [{
        id: 'route-buy-0',
        rail: 'bundle',
        transactionBase64: Buffer.from(tx.serialize()).toString('base64'),
        expectedSigner: payer.publicKey.toBase58()
      }],
      requiredAccounts: [destination.toBase58()],
      allowedPrograms: [SystemProgram.programId.toBase58(), 'ComputeBudget111111111111111111111111111111']
    })
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.routeInstructionSource.contract, 'bondr-jito-route-instruction-source-v1');
  assert.equal(payload.routeInstructionSource.status, 'ready');
  assert.deepEqual(payload.routeInstructionSource.preparedTransactionIds, ['route-buy-0']);
  assert.equal(payload.packedBuild.status, 'built');
  assert.equal(payload.execution, 'packed-transaction-build-only-no-signing-no-relay-submit');
});

test('jito multi-wallet signing session tracks missing and complete signatures by message hash', () => {
  const payer = Keypair.generate();
  const secondSigner = Keypair.generate();
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: secondSigner.publicKey, isSigner: true, isWritable: true }
      ],
      data: Buffer.alloc(0)
    })]
  }).compileToV0Message());
  const messageHash = createHash('sha256').update(Buffer.from(tx.message.serialize())).digest('hex');
  const unsignedBase64 = Buffer.from(tx.serialize()).toString('base64');
  const blocked = buildJitoMultiWalletSigningSession({
    transactions: [{
      id: 'packed-0',
      waveIndex: 0,
      transactionBase64: unsignedBase64,
      transactionMessageHash: messageHash,
      requiredSigners: [payer.publicKey.toBase58(), secondSigner.publicKey.toBase58()]
    }]
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.missingSignerCount, 2);
  assert.equal(blocked.nextSigner, payer.publicKey.toBase58());

  tx.sign([payer, secondSigner]);
  const signed = buildJitoMultiWalletSigningSession({
    transactions: [{
      id: 'packed-0',
      waveIndex: 0,
      transactionBase64: Buffer.from(tx.serialize()).toString('base64'),
      transactionMessageHash: messageHash,
      requiredSigners: [payer.publicKey.toBase58(), secondSigner.publicKey.toBase58()]
    }]
  });
  assert.equal(signed.contract, 'bondr-jito-multi-wallet-signing-session-v1');
  assert.equal(signed.status, 'complete');
  assert.equal(signed.signedSignerCount, 2);
  assert.equal(signed.nextSigner, null);
  assert.equal(signed.safety.noRelaySubmit, true);
});

test('jito wave dispatch plan builds payloads only after approvals and prior receipts', () => {
  const txs = Array.from({ length: 6 }, (_, index) => ({
    id: `tx-${index}`,
    waveIndex: index < 5 ? 0 : 1,
    signedTransactionBase64: Buffer.from(`signed-${index}`).toString('base64'),
    transactionMessageHash: `${index}`.repeat(64).slice(0, 64),
    simulationStatus: 'ok',
    simulationTransactionMessageHash: `${index}`.repeat(64).slice(0, 64),
    signedReviewStatus: 'passed'
  }));
  const blocked = buildJitoWaveDispatchPlan({
    transactions: txs,
    expectedSigners: [wallet.address],
    expectedMint: validMintPublicKey,
    tipLamports: 1000,
    approvals: [{ waveIndex: 0, approvalId: 'approve-wave-0' }]
  });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.blockers.includes('wave-1-explicit-approval-required'));
  assert.ok(blocked.blockers.includes('wave-1-prior-wave-receipt-required'));

  const ready = buildJitoWaveDispatchPlan({
    transactions: txs,
    expectedSigners: [wallet.address],
    expectedMint: validMintPublicKey,
    tipLamports: 1000,
    approvals: [{ waveIndex: 0, approvalId: 'approve-wave-0' }, { waveIndex: 1, approvalId: 'approve-wave-1' }],
    priorWaveReceipts: [{
      contract: 'bondr-bundle-receipt-v1',
      bundleId: 'bundle-0',
      rail: 'bundle',
      status: 'landed',
      txSignatures: ['sig-0'],
      observedAt: new Date().toISOString(),
      provider: 'jito-block-engine',
      landedSlot: 100
    }]
  });
  assert.equal(ready.contract, 'bondr-jito-wave-dispatch-plan-v1');
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.waves.map((wave) => wave.transactionCount), [5, 1]);
  assert.equal(ready.waves[0].bundlePayload?.signedTransactions?.length, 5);
  assert.equal(ready.waves[1].submitAfterWaveIndex, 0);
  assert.equal(ready.safety.noRelaySubmit, true);
});

test('jito chain effect proof requires landed receipt plus wallet token delta evidence', () => {
  const receipt = normalizeJitoBundleStatusReceipt({
    bundleId: 'bundle-proof',
    observedAt: new Date().toISOString(),
    final: {
      value: [{
        bundle_id: 'bundle-proof',
        confirmation_status: 'finalized',
        slot: 200,
        transactions: ['sig-wallet-1']
      }]
    }
  });
  const blocked = buildJitoBundleChainEffectProof({
    receipt,
    expectedEffects: [{
      wallet: wallet.address,
      mint: validMintPublicKey,
      txSignature: 'sig-wallet-1',
      preTokenAmountRaw: '0',
      postTokenAmountRaw: '0',
      minDeltaRaw: '1',
      status: 'finalized',
      slot: 200
    }]
  });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.blockers.includes(`effect-${wallet.address}-token-delta-below-minimum`));

  const verified = buildJitoBundleChainEffectProof({
    receipt,
    expectedEffects: [{
      wallet: wallet.address,
      mint: validMintPublicKey,
      txSignature: 'sig-wallet-1',
      preTokenAmountRaw: '0',
      postTokenAmountRaw: '100',
      minDeltaRaw: '1',
      status: 'finalized',
      slot: 200
    }]
  });
  assert.equal(verified.contract, 'bondr-jito-bundle-chain-effect-proof-v1');
  assert.equal(verified.status, 'verified');
  assert.equal(verified.verifiedEffectCount, 1);
  assert.equal(verified.safety.relayReceiptIsNotEnough, true);
});

test('jito launch bundle plan models legs, hashes, signing, and closed relay gates', () => {
  const plan = buildJitoLaunchBundlePlan(project, [wallet], activation, { expectedMint: validMintPublicKey });
  assert.equal(plan.contract, 'bondr-jito-launch-bundle-plan-v1');
  assert.equal(plan.execution, 'launch-bundle-plan-only-no-signing-no-relay-submit');
  assert.equal(plan.synchronization.contract, 'bondr-jito-wallet-rail-synchronization-v1');
  assert.equal(plan.packedExecution.contract, 'bondr-jito-packed-execution-plan-v1');
  assert.equal(plan.packedExecution.atomicity.withinWave, true);
  assert.equal(plan.packedExecution.atomicity.acrossWaves, false);
  assert.ok(plan.legs.some((leg) => leg.rail === 'deployment'));
  assert.ok(plan.legs.some((leg) => leg.id === 'jito-tip'));
  assert.equal(plan.preparedTransactions.count, 0);
  assert.equal(plan.legHashes.length, plan.legs.length);
  assert.equal(plan.bundleHash.length, 64);
  assert.ok(plan.signingOrder.includes(wallet.address));
  assert.ok(plan.synchronization.signingOrder.includes(wallet.address));
  assert.ok(plan.synchronization.walletRails.some((row) => row.rail === 'deployment' && row.routePath.includes('/deployment')));
  assert.ok(plan.synchronization.walletRails.some((row) => row.rail === 'bundle' && row.routePath.includes('wallet plan(bundle)')));
  assert.ok(plan.synchronization.blockers.includes('leg-deployment-0-prepared-transaction-required'));
  assert.ok(plan.blockers.includes('broadcast-gate-closed'));
  assert.ok(plan.blockers.includes('jito-relay-disabled'));
  assert.ok(plan.blockers.includes('simulation-proof-required'));
  assert.ok(plan.blockers.includes('leg-deployment-0-prepared-transaction-required'));
  assert.equal(plan.safety.noSigning, true);
  assert.equal(plan.safety.noRelaySubmit, true);
  assert.equal(plan.antiAbuse.noWashTrading, true);
});

test('jito packed execution can fit more than five wallets into one atomic bundle wave', () => {
  const wallets = Array.from({ length: 8 }, (_, index): Wallet => ({
    ...wallet,
    id: index === 0 ? 'dev-wallet' : `bundle-wallet-${index}`,
    role: index === 0 ? 'dev wallet' : 'bundle wallet',
    address: index === 0 ? wallet.address : Keypair.generate().publicKey.toBase58(),
    custodyMode: undefined
  }));
  const packedProject: Project = {
    ...project,
    launchConfig: {
      ...project.launchConfig!,
      walletPlan: wallets.map((row, index) => ({
        walletId: row.id,
        role: row.role,
        participate: true,
        executionPhase: index === 0 ? 'dev' as const : 'bundle' as const,
        plannedBuySol: 0.001,
        maxBuySol: 0.001,
        maxSlippageBps: 100,
        takeProfitPercents: [35, 75, 150],
        stopLossPct: -18,
        trailingStopPct: 22,
        perTxSellCapPct: 25,
        cooldownSeconds: 60
      }))
    }
  };
  const plan = buildJitoLaunchBundlePlan(packedProject, wallets, activation, {
    expectedMint: validMintPublicKey,
    maxWalletsPerPackedTransaction: 4
  });

  assert.equal(plan.legs.filter((leg) => leg.rail !== 'tip').length, 8);
  assert.equal(plan.packedExecution.totalWallets, 8);
  assert.equal(plan.packedExecution.totalTransactions, 2);
  assert.equal(plan.packedExecution.waveCount, 1);
  assert.equal(plan.packedExecution.mode, 'single-atomic-bundle');
  assert.equal(plan.policy.plannedTransactions, 2);
  assert.equal(plan.policy.plannedWaves, 1);
  assert.equal(plan.policy.atomicityMode, 'single-atomic-bundle');
  assert.equal(plan.packedExecution.transactions.every((tx) => tx.walletCount <= 4), true);
  assert.ok(plan.packedExecution.blockers.includes('packed-transaction-0-address-lookup-table-proof-required'));
  assert.ok(plan.packedExecution.blockers.includes('packed-transaction-1-address-lookup-table-proof-required'));
  assert.ok(!plan.blockers.some((blocker) => blocker.includes('bundle-exceeds-5-transaction-limit')));
});

test('jito packed execution models overflow wallets as near-synchronous waves', () => {
  const wallets = Array.from({ length: 22 }, (_, index): Wallet => ({
    ...wallet,
    id: index === 0 ? 'dev-wallet' : `bundle-wallet-${index}`,
    role: index === 0 ? 'dev wallet' : 'bundle wallet',
    address: index === 0 ? wallet.address : Keypair.generate().publicKey.toBase58(),
    custodyMode: undefined
  }));
  const packedProject: Project = {
    ...project,
    launchConfig: {
      ...project.launchConfig!,
      walletPlan: wallets.map((row, index) => ({
        walletId: row.id,
        role: row.role,
        participate: true,
        executionPhase: index === 0 ? 'dev' as const : index % 5 === 0 ? 'task' as const : 'bundle' as const,
        taskType: index % 5 === 0 && index !== 0 ? 'timed-buy' as const : undefined,
        plannedBuySol: 0.001,
        maxBuySol: 0.001,
        maxSlippageBps: 100,
        takeProfitPercents: [35, 75, 150],
        stopLossPct: -18,
        trailingStopPct: 22,
        perTxSellCapPct: 25,
        cooldownSeconds: 60
      }))
    }
  };
  const plan = buildJitoLaunchBundlePlan(packedProject, wallets, activation, {
    expectedMint: validMintPublicKey,
    maxWalletsPerPackedTransaction: 4
  });

  assert.equal(plan.packedExecution.totalWallets, 22);
  assert.equal(plan.packedExecution.totalTransactions, 6);
  assert.equal(plan.packedExecution.waveCount, 2);
  assert.equal(plan.packedExecution.mode, 'near-synchronous-waves');
  assert.equal(plan.packedExecution.atomicity.label, 'near-synchronous-jito-waves');
  assert.equal(plan.packedExecution.synchronization.waveSubmitRequiresPreviousWaveReceipt, true);
  assert.equal(plan.policy.plannedWaves, 2);
  assert.equal(plan.policy.atomicityMode, 'near-synchronous-waves');
  assert.deepEqual(plan.packedExecution.waves.map((wave) => wave.transactionCount), [5, 1]);
  assert.equal(plan.packedExecution.waves[1].submitAfterWaveIndex, 0);
  assert.ok(plan.packedExecution.warnings.includes('multi-wave-plan-is-not-atomic-across-waves'));
  assert.ok(!plan.blockers.some((blocker) => blocker.includes('bundle-exceeds-5-transaction-limit')));
});

test('jito launch bundle synchronization aligns wallet rails, prepared hashes, signing order, and freshness', () => {
  const devOnly = structuredClone(project);
  devOnly.launchConfig!.walletPlan = [
    { walletId: 'dev-wallet', role: 'dev wallet', participate: true, executionPhase: 'dev', plannedBuySol: 0.01, maxBuySol: 0.01, maxSlippageBps: 100, takeProfitPercents: [35, 75, 150], stopLossPct: -18, trailingStopPct: 22, perTxSellCapPct: 25, cooldownSeconds: 60 }
  ];
  const future = new Date(Date.now() + 60_000).toISOString();
  const plan = buildJitoLaunchBundlePlan(devOnly, [wallet], activation, {
    expectedMint: validMintPublicKey,
    session: { blockhashExpiresAt: future },
    preparedTransactions: [{
      id: 'deployment-create',
      rail: 'deployment',
      transactionBase64: 'tx-create',
      expectedSigners: [wallet.address],
      messageHash: 'c'.repeat(64),
      simulationPolicyStatus: 'passed'
    }]
  });

  assert.equal(plan.synchronization.status, 'in-sync');
  assert.deepEqual(plan.synchronization.messageHashes, ['c'.repeat(64)]);
  assert.equal(plan.synchronization.blockhashExpiresAt, future);
  const deploymentRail = plan.synchronization.walletRails.find((row) => row.rail === 'deployment');
  assert.equal(deploymentRail?.signer, wallet.address);
  assert.equal(deploymentRail?.signingIndex, 0);
  assert.deepEqual(deploymentRail?.preparedTransactionIds, ['deployment-create']);
  assert.deepEqual(deploymentRail?.messageHashes, ['c'.repeat(64)]);
  assert.deepEqual(deploymentRail?.blockers, []);
  const tipRail = plan.synchronization.walletRails.find((row) => row.rail === 'tip');
  assert.equal(tipRail?.signer, wallet.address);
  assert.deepEqual(tipRail?.blockers, []);
  assert.equal(plan.synchronization.safety.rebuildAllOnExpiry, true);

  const expired = buildJitoLaunchBundlePlan(devOnly, [wallet], activation, {
    expectedMint: validMintPublicKey,
    session: { blockhashExpiresAt: '2020-01-01T00:00:00.000Z' },
    preparedTransactions: [{
      id: 'deployment-create',
      rail: 'deployment',
      transactionBase64: 'tx-create',
      expectedSigners: [wallet.address],
      messageHash: 'c'.repeat(64),
      simulationPolicyStatus: 'passed'
    }]
  });
  assert.equal(expired.synchronization.status, 'blocked');
  assert.ok(expired.synchronization.blockers.includes('blockhash-expired-rebuild-required'));
  assert.ok(expired.blockers.includes('blockhash-expired-rebuild-required'));
});

test('jito launch bundle plan accepts Raydium prepared legs only after policy simulation passes', () => {
  const build = buildRaydiumCpmmCreatePoolTransaction({
    creator: wallet.address,
    baseMint: validMintPublicKey,
    quoteMint: 'So11111111111111111111111111111111111111112',
    baseDecimals: 6,
    quoteDecimals: 9,
    baseAmountRaw: '1000000000',
    quoteAmountRaw: '100000000',
    configId: SystemProgram.programId.toBase58(),
    recentBlockhash: '11111111111111111111111111111111',
    includeUnsignedTransaction: true
  });
  const policy = buildRaydiumLpSimulationPolicy({
    transactionBase64: build.transactionBase64,
    expectedSigner: wallet.address,
    baseMint: validMintPublicKey,
    quoteMint: 'So11111111111111111111111111111111111111112',
    requiredAccounts: build.policyReview?.requiredAccounts,
    transactionMessageHash: build.messageHash,
    simulationProof: { err: null, logs: [], unitsConsumed: 123456, provider: 'quicknode' }
  });
  const plan = buildJitoLaunchBundlePlan(project, [wallet], activation, {
    expectedMint: validMintPublicKey,
    preparedTransactions: [{
      id: 'raydium-create-lp',
      transactionBase64: build.transactionBase64!,
      expectedSigners: build.requiredSigners,
      messageHash: policy.decoded.messageHash,
      simulationPolicyStatus: policy.status
    }]
  });

  assert.equal(plan.preparedTransactions.count, 1);
  assert.deepEqual(plan.preparedTransactions.ids, ['raydium-create-lp']);
  assert.equal(plan.preparedTransactions.allSimulationPoliciesPassed, true);
  assert.deepEqual(plan.preparedTransactions.blockers, []);
  assert.ok(plan.signingOrder.includes(wallet.address));
  assert.ok(plan.bundleHash.length === 64);
});

test('jito launch bundle plan blocks over-cap tips before relay submit', () => {
  const plan = buildJitoLaunchBundlePlan(project, [wallet], activation, { expectedMint: validMintPublicKey, tipLamports: 10_000_000_000 });
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.blockers.includes('jito-tip-exceeds-cap'));
  assert.equal(plan.safety.noRelaySubmit, true);
});

function jitoMarkerTransactionBase64(includeMarker: boolean) {
  const payer = Keypair.generate();
  const marker = new PublicKey('jitodontfront111111111111111111111111111111');
  const instruction = new TransactionInstruction({
    programId: SystemProgram.programId,
    keys: includeMarker ? [{ pubkey: marker, isSigner: false, isWritable: false }] : [],
    data: Buffer.alloc(0)
  });
  const transaction = new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [instruction]
  }).compileToV0Message());
  return Buffer.from(transaction.serialize()).toString('base64');
}

test('jito bundle preview requires jitodontfront marker on first transaction when anti-front-run is requested', () => {
  const protectedTx = jitoMarkerTransactionBase64(true);
  const preview = buildJitoBundlePreview({
    signedTransactions: [protectedTx],
    expectedSigners: [wallet.address],
    expectedMint: 'Mint111111111111111111111111111111111111111',
    tipLamports: 1000,
    simulationProof: { ok: true },
    approvalId: 'approval-test',
    antiFrontRunRequired: true
  }, activation);

  assert.equal(preview.policy.antiFrontRunRequired, true);
  assert.equal(preview.policy.antiFrontRunMarkerDetected, true);
  assert.deepEqual(preview.policy.antiFrontRunMarkerIndexes, [0]);
  assert.ok(!preview.blockers.includes('jitodontfront-marker-required-on-first-transaction'));
  assert.ok(!preview.blockers.includes('jitodontfront-protected-transaction-must-be-first'));
});

test('jito bundle preview blocks jitodontfront marker outside the first transaction', () => {
  const ordinaryTx = jitoMarkerTransactionBase64(false);
  const protectedTx = jitoMarkerTransactionBase64(true);
  const preview = buildJitoBundlePreview({
    signedTransactions: [ordinaryTx, protectedTx],
    expectedSigners: [wallet.address],
    expectedMint: 'Mint111111111111111111111111111111111111111',
    tipLamports: 1000,
    simulationProof: { ok: true },
    approvalId: 'approval-test',
    antiFrontRunRequired: true
  }, activation);

  assert.deepEqual(preview.policy.antiFrontRunMarkerIndexes, [1]);
  assert.ok(preview.blockers.includes('jitodontfront-marker-required-on-first-transaction'));
  assert.ok(preview.blockers.includes('jitodontfront-protected-transaction-must-be-first'));
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
      expectedTransactionSignatures: ['sig-one', 'sig-two'],
      tipLamports: 1000,
      simulationProof: { ok: true },
      approvalId: 'approval-test',
      projectId: 'sda',
      rail: 'deployment'
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
    assert.equal(result.receipt?.contract, 'bondr-bundle-receipt-v1');
    assert.equal(result.receipt?.bundleId, 'bundle-test-id');
    assert.equal(result.receipt?.status, 'submitted');
    assert.equal(result.receipt?.projectId, 'sda');
    assert.equal(result.receipt?.rail, 'deployment');
    assert.deepEqual(result.receipt?.txSignatures, ['sig-one', 'sig-two']);
    assert.equal(requests.length, 1);
    assert.equal(JSON.parse(requests[0].body).method, 'sendBundle');
    assert.deepEqual(JSON.parse(requests[0].body).params[1], { encoding: 'base64' });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('jito bundle status receipt normalization keeps relay status separate from chain proof', () => {
  const observedAt = '2026-08-16T12:00:00.000Z';
  const finalized = normalizeJitoBundleStatusReceipt({
    bundleId: 'bundle-finalized',
    observedAt,
    rail: 'deployment',
    projectId: 'sda',
    inflight: { value: [{ bundle_id: 'bundle-finalized', status: 'Landed', landed_slot: 123 }] },
    final: { value: [{ bundle_id: 'bundle-finalized', confirmation_status: 'finalized', slot: 124, transactions: ['sig-one', 'sig-two'], err: null }] }
  });
  assert.equal(finalized.status, 'finalized');
  assert.equal(finalized.confirmationStatus, 'finalized');
  assert.equal(finalized.landedSlot, 124);
  assert.deepEqual(finalized.txSignatures, ['sig-one', 'sig-two']);
  assert.equal(finalized.statusSource, 'combined');
  assert.equal(finalized.executionProofStatus, 'relay-status-only-not-chain-proof');

  const failed = normalizeJitoBundleStatusReceipt({
    bundleId: 'bundle-failed',
    observedAt,
    inflight: { value: [{ bundle_id: 'bundle-failed', status: 'Pending' }] },
    final: { value: [{ bundle_id: 'bundle-failed', confirmation_status: 'processed', err: { InstructionError: [0, 'Custom'] } }] }
  });
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.err, { InstructionError: [0, 'Custom'] });

  const pending = normalizeJitoBundleStatusReceipt({
    bundleId: 'bundle-pending',
    observedAt,
    inflight: { value: [{ bundle_id: 'bundle-pending', status: 'Pending' }] },
    final: { value: [] }
  });
  assert.equal(pending.status, 'inflight');
  assert.equal(pending.statusSource, 'getInflightBundleStatuses');
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
    assert.equal(result.receipts[0].confirmationStatus, 'finalized');
    assert.equal(result.receipts[0].executionProofStatus, 'relay-status-only-not-chain-proof');
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
  assert.ok(readiness.blockers.includes('durable-sniper-trigger-source-missing'));
  assert.ok(readiness.blockers.includes('broadcast-gate-closed'));
  assert.ok(readiness.blockers.includes('automatic-recovery-runner-missing'));
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

test('sniper trigger preview requires fresh pool proof for automated sources', () => {
  const poolId = Keypair.generate().publicKey.toBase58();
  const fresh = buildSniperTriggerPreview({ ...project, tokenMint: validMintPublicKey }, [wallet], activation, {
    source: 'pool-detector',
    mint: validMintPublicKey,
    poolId,
    poolObservedAt: new Date(Date.now() - 1000).toISOString(),
    poolSlot: 328_000_001,
    poolLiquidityUsd: 1250,
    connectedSigner: wallet.address,
    amountSol: 0.01,
    slippageBps: 100,
    simulationProof: { ok: true }
  });
  assert.equal(fresh.poolFreshnessProof.contract, 'bondr-sniper-pool-freshness-proof-v1');
  assert.equal(fresh.poolFreshnessProof.status, 'ready');
  assert.equal(fresh.poolFreshnessProof.poolId, poolId);
  assert.ok(!fresh.blockers.includes('pool-freshness-proof-required'));
  assert.equal(fresh.poolFreshnessProof.safety.noBroadcast, true);

  const stale = buildSniperTriggerPreview({ ...project, tokenMint: validMintPublicKey }, [wallet], activation, {
    source: 'webhook',
    mint: validMintPublicKey,
    poolId,
    poolObservedAt: new Date(Date.now() - 120_000).toISOString(),
    poolSlot: 328_000_001,
    poolLiquidityUsd: 1250,
    connectedSigner: wallet.address,
    amountSol: 0.01,
    slippageBps: 100,
    simulationProof: { ok: true }
  });
  assert.equal(stale.poolFreshnessProof.status, 'stale');
  assert.ok(stale.blockers.includes('pool-freshness-proof-required'));
  assert.ok(stale.blockers.includes('pool-freshness-stale'));
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
  assert.equal(preview.lifecyclePreview.contract, 'bondr-task-lifecycle-preview-v1');
  assert.equal(preview.lifecycle.idempotency, 'modeled-before-worker');
  assert.equal(preview.lifecyclePreview.safety.noTransactionBuild, true);
  assert.equal(preview.safety.noAutonomousTrading, true);
});

test('task queue preview accepts safe task shape but keeps worker and broadcast blocked', () => {
  const taskProject = structuredClone(project);
  taskProject.launchConfig!.walletPlan = [
    ...taskProject.launchConfig!.walletPlan,
    { walletId: 'dev-wallet', role: 'task wallet', participate: true, executionPhase: 'task', taskType: 'auto-take-profit', plannedBuySol: 0, maxBuySol: 0.01, maxSlippageBps: 100, takeProfitPercents: [35], stopLossPct: -18, trailingStopPct: 22, perTxSellCapPct: 25, cooldownSeconds: 60, taskMaxExecutions: 3 }
  ];
  const preview = buildTaskQueuePreview(taskProject, [wallet], activation, {
    taskName: 'standard rehearsal task',
    walletIds: ['dev-wallet'],
    schedule: 'interval',
    intervalSeconds: 60,
    maxRuns: 3,
    cooldownSeconds: 60,
    riskRuleId: 'standard-launch-rehearsal',
    paused: false,
    clockReady: true,
    priceChangePct: 40
  });
  assert.equal(preview.status, 'preview-ready');
  assert.ok(preview.blockers.includes('durable-task-worker-missing'));
  assert.ok(preview.blockers.includes('task-queue-persistence-missing'));
  assert.ok(preview.blockers.includes('broadcast-gate-closed'));
  assert.equal(preview.task.paused, false);
  assert.equal(preview.lifecyclePreview.rows[0]?.state, 'ready');
  assert.match(preview.lifecyclePreview.rows[0]?.taskId ?? '', /^task_[a-f0-9]{16}$/);
  assert.equal(preview.lifecyclePreview.rows[0]?.idempotencyKey.length, 64);
  assert.equal(preview.lifecyclePreview.rows[0]?.controls.cancel, true);
  assert.equal(preview.lifecyclePreview.rows[0]?.nextAction, 'build-unsigned-transaction-after-policy');
  assert.equal(preview.lifecyclePreview.safety.noBroadcast, true);
  assert.equal(preview.receiptLedgerPreview.contract, 'bondr-task-receipt-ledger-preview-v1');
  assert.equal(preview.receiptLedgerPreview.status, 'preview-ready');
  assert.ok(preview.receiptLedgerPreview.requiredReceiptFields.includes('transactionMessageHash'));
  assert.ok(preview.receiptLedgerPreview.blockers.includes('durable-task-receipt-ledger-missing'));
  assert.equal(preview.monitorRecoveryPreview.contract, 'bondr-task-monitor-recovery-preview-v1');
  assert.equal(preview.monitorRecoveryPreview.status, 'preview-ready');
  assert.ok(preview.monitorRecoveryPreview.watchers[0]?.watches.includes('take-profit'));
  assert.ok(preview.monitorRecoveryPreview.watchers[0]?.recovery.includes('no-blind-retry'));
  assert.equal(preview.monitorRecoveryPreview.safety.noAutomaticRecovery, true);
});

test('task lifecycle preview waits during cooldown and completes at max runs', () => {
  const taskProject = structuredClone(project);
  taskProject.launchConfig!.walletPlan = [
    { walletId: 'dev-wallet', role: 'task wallet', participate: true, executionPhase: 'task', taskType: 'stop-loss', plannedBuySol: 0, maxBuySol: 0.01, maxSlippageBps: 100, takeProfitPercents: [35], stopLossPct: -18, trailingStopPct: 22, perTxSellCapPct: 25, cooldownSeconds: 60, taskMaxExecutions: 2 }
  ];
  const waiting = buildTaskLifecyclePreview(taskProject, [wallet], activation, { walletIds: ['dev-wallet'], paused: false, maxRuns: 2, cooldownSeconds: 60, lastRunSecondsAgo: 10, priceChangePct: -20 });
  assert.equal(waiting.rows[0]?.state, 'waiting');
  assert.ok(waiting.rows[0]?.blockers.includes('task-cooldown-active'));
  assert.equal(waiting.rows[0]?.idempotencyKey.length, 64);
  const completed = buildTaskLifecyclePreview(taskProject, [wallet], activation, { walletIds: ['dev-wallet'], paused: false, maxRuns: 2, completedRuns: 2, cooldownSeconds: 60, priceChangePct: -20 });
  assert.equal(completed.rows[0]?.state, 'completed');
  assert.equal(completed.rows[0]?.taskId, waiting.rows[0]?.taskId);
  assert.ok(completed.rows[0]?.blockers.includes('task-max-runs-complete'));
  assert.equal(completed.safety.noAutonomousTrading, true);
});

test('execution recovery readiness reports monitor gaps and no-blind-retry policy', () => {
  const readiness = buildExecutionRecoveryReadiness();
  assert.equal(readiness.contract, 'bondr-execution-recovery-readiness-v1');
  assert.equal(readiness.execution, 'recovery-readiness-only-no-monitor-no-retry-no-broadcast');
  assert.equal(readiness.deploymentRecovery.contract, 'bondr-deployment-recovery-preview-v1');
  assert.equal(readiness.deploymentRecovery.execution, 'deployment-recovery-preview-only-no-monitor-no-retry-no-broadcast');
  assert.ok(readiness.deploymentRecovery.requiredReceiptFields.includes('transactionMessageHash'));
  assert.ok(readiness.deploymentRecovery.rebuildTriggers.includes('blockhash-expired'));
  assert.ok(readiness.deploymentRecovery.noRetryFailures.includes('risk-or-halt'));
  assert.ok(readiness.deploymentRecovery.blockers.includes('deployment-rebuild-runner-missing'));
  assert.equal(readiness.monitors.find((item) => item.name === 'launch tx')?.status, 'rehearsal-only');
  assert.ok(readiness.recoveryPolicy.retryable.includes('blockhash-expired-rebuild'));
  assert.ok(readiness.recoveryPolicy.noRetry.includes('slippage-or-stale-market'));
  assert.equal(readiness.recoveryPolicy.noBlindRetry, true);
  assert.ok(readiness.blockers.includes('durable-monitor-worker-missing'));
});

test('observability and recovery playbooks cover live failure responses', () => {
  const playbook = readFileSync(new URL('../docs/BONDR_FAILURE_RESPONSE_PLAYBOOKS_2026-08-16.md', import.meta.url), 'utf8');
  for (const heading of ['Auth Mismatch', 'Provider-Limited', 'Simulation Fail', 'Broadcast Fail', 'Receipt Missing', 'Route Crash']) {
    assert.match(playbook, new RegExp(`## ${heading}`));
  }
  assert.match(playbook, /Do not retry a transaction blindly/);
  assert.match(playbook, /\/api\/client-error-report/);
  assert.match(playbook, /\/api\/execution-capabilities/);
  assert.match(playbook, /\/api\/provider-readiness/);
  assert.match(playbook, /\/api\/projects\/<projectId>\/launch-reconciliation/);
  assert.match(playbook, /maxRetries=0/);
  assert.match(playbook, /blindRetries=false/);
  assert.match(playbook, /signature, provider, route, expected mint, transaction message hash/);
});

test('production smoke artifacts are bounded, redacted, and gate-aware', () => {
  const smoke = readFileSync(new URL('../scripts/bondr-production-smoke.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /join\('\/tmp'/);
  assert.match(smoke, /redact\(report\)/);
  assert.match(smoke, /SECRET_KEY_RE/);
  assert.match(smoke, /LONG_SECRET_RE/);
  assert.match(smoke, /broadcastDisabled/);
  assert.match(smoke, /deploymentDisabled/);
  assert.match(smoke, /send-signed-transaction smoke must not broadcast/);
  assert.match(smoke, /contained embedded RSC route error digest/);
});

test('client error report remains bounded and sanitized for recovery diagnostics', () => {
  const source = readFileSync(new URL('../apps/web/app/api/client-error-report/route.ts', import.meta.url), 'utf8');
  assert.match(source, /z\.string\(\)\.max\(120\)/);
  assert.match(source, /z\.string\(\)\.max\(500\)/);
  assert.match(source, /recentReports\.splice\(20\)/);
  assert.match(source, /Bearer \[redacted\]/);
  assert.match(source, /token\|jwt\|secret\|private\|seed\|password\|authorization\|bearer/i);
  assert.match(source, /cache-control': 'no-store'/);
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
