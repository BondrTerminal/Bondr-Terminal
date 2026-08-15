import type { LiveActivationStatus } from './live-activation';
import type { Project, Wallet, WalletPlanEntry } from './meridian-store';
import { getJitoRelayReadiness } from './jito-relay-readiness';

type EngineStatus = 'transaction-builder-ready' | 'deployment-disabled' | 'rehearsal-contract-ready' | 'protocol-sdk-required';
type ImplementationStatus = 'builder-implemented' | 'rehearsal-contract-only' | 'adapter-missing';

function planByPhase(project: Project, phase: NonNullable<WalletPlanEntry['executionPhase']>) {
  return project.launchConfig?.walletPlan.filter((entry) => entry.executionPhase === phase) ?? [];
}

function devWallet(project: Project, wallets: Wallet[]) {
  const devPlan = planByPhase(project, 'dev')[0] ?? project.launchConfig?.walletPlan.find((entry) => entry.participate) ?? null;
  return wallets.find((wallet) => wallet.id === devPlan?.walletId) ?? wallets[0] ?? null;
}

function walletAddressByPlan(wallets: Wallet[], entry: WalletPlanEntry) {
  return wallets.find((wallet) => wallet.id === entry.walletId)?.address ?? null;
}

export function buildTokenMintEngineReadiness(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus) {
  const payer = project ? devWallet(project, wallets) : null;
  return {
    contract: 'bondr-token-mint-engine-readiness-v1' as const,
    status: activation.deploymentEnabled ? 'transaction-builder-ready' as EngineStatus : 'deployment-disabled' as EngineStatus,
    implementationStatus: 'builder-implemented' as ImplementationStatus,
    method: 'POST {operation:"create-spl-token", payer, mint, decimals, initialSupply, freezeAuthority?}',
    requiredInputs: ['payer', 'mint', 'decimals', 'initialSupply', 'freezeAuthority?'],
    requiredSigners: {
      payer: payer?.address ?? null,
      clientMintKeypair: 'required-client-side',
      serverSigner: false
    },
    unsignedBuild: {
      availableWhenDeploymentEnabled: true,
      availableNow: activation.deploymentEnabled,
      transactionReturnedByPostOnly: true,
      noSigning: true,
      noBroadcast: true
    },
    blockers: [
      activation.deploymentEnabled ? null : 'deployment-gate-closed',
      payer?.address ? null : 'payer-dev-wallet-missing'
    ].filter((item): item is string => Boolean(item)),
    safety: {
      noServerCustody: true,
      noPrivateKeys: true,
      explicitApprovalRequired: true
    }
  };
}

export function buildLaunchBundleEngineReadiness(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus) {
  const relay = getJitoRelayReadiness();
  const dev = project ? devWallet(project, wallets) : null;
  const bundlePlans = project ? planByPhase(project, 'bundle') : [];
  const sniperPlans = project ? planByPhase(project, 'sniper') : [];
  const taskPlans = project ? planByPhase(project, 'task') : [];
  const walletPlans = project?.launchConfig?.walletPlan ?? [];
  const participatingPlans = walletPlans.filter((entry) => entry.participate);
  const totalMaxSol = participatingPlans.reduce((sum, entry) => sum + entry.maxBuySol, 0);
  const signingOrder = [
    dev?.address ?? null,
    ...bundlePlans.map((entry) => walletAddressByPlan(wallets, entry)),
    ...sniperPlans.map((entry) => walletAddressByPlan(wallets, entry)),
    ...taskPlans.map((entry) => walletAddressByPlan(wallets, entry))
  ].filter((item, index, all): item is string => Boolean(item) && all.indexOf(item) === index);

  return {
    contract: 'bondr-launch-bundle-engine-readiness-v1' as const,
    status: 'rehearsal-contract-ready' as EngineStatus,
    implementationStatus: 'rehearsal-contract-only' as ImplementationStatus,
    execution: 'preflight-only-no-jito-submit-no-broadcast' as const,
    legs: [
      { id: 'create', label: 'Create token', required: true, builder: 'pumpportal-create-or-spl-mint', signer: dev?.address ?? null },
      { id: 'dev-buy', label: 'Dev initial buy', required: true, builder: 'pumpportal-trade-local', signer: dev?.address ?? null },
      { id: 'bundle-buys', label: 'Optional bundle buys', required: false, count: bundlePlans.length, builder: 'pumpportal-jito-bundle', signers: bundlePlans.map((entry) => walletAddressByPlan(wallets, entry)) },
      { id: 'sniper-rails', label: 'Optional sniper rails', required: false, count: sniperPlans.length, builder: 'terminal-swap-rehearsal', signers: sniperPlans.map((entry) => walletAddressByPlan(wallets, entry)) },
      { id: 'task-rails', label: 'Optional wallet tasks', required: false, count: taskPlans.length, builder: 'task-queue-preview', signers: taskPlans.map((entry) => walletAddressByPlan(wallets, entry)) }
    ],
    signingOrder,
    caps: {
      maxTotalSol: totalMaxSol,
      maxSlippageBps: project?.launchConfig?.route.slippageBps ?? null,
      maxPriorityFeeSol: project?.launchConfig?.devWalletRules.maxPriorityFeeSol ?? null,
      maxJitoTipSol: relay.tip.maxSol
    },
    antiAbuseChecks: [
      'no-self-trade-loop',
      'no-wash-trading',
      'no-fake-volume',
      'wallet-allowlist-required',
      'per-wallet-sol-cap-required',
      'simulation-before-signing',
      'explicit-bundle-approval-before-relay'
    ],
    ready: {
      walletPlanPresent: Boolean(walletPlans.length),
      devWalletPresent: Boolean(dev?.address),
      signingOrderModeled: signingOrder.length > 0,
      relayReadinessModeled: true
    },
    blockers: [
      project ? null : 'project-required',
      dev?.address ? null : 'dev-wallet-missing',
      walletPlans.length ? null : 'wallet-plan-missing',
      activation.broadcastEnabled ? null : 'broadcast-gate-closed',
      relay.relayEnabled ? null : 'jito-relay-disabled',
      'bundle-simulation-proof-required',
      'signed-bundle-review-required'
    ].filter((item): item is string => Boolean(item)),
    relay: {
      status: relay.status,
      provider: relay.provider,
      relayEnabled: relay.relayEnabled,
      requiredEnv: relay.requiredEnv
    },
    safety: {
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      noAutonomousTrading: true
    }
  };
}

export const LP_ADAPTER_READINESS = [
  {
    id: 'raydium-launchlab',
    label: 'Raydium LaunchLab',
    implementationStatus: 'adapter-missing' as ImplementationStatus,
    requiredSdkOrApi: '@raydium-io/raydium-sdk-v2 LaunchLab builder or verified Raydium API flow',
    requiredInputs: ['base token mint', 'quote token', 'curve config', 'metadata', 'dev wallet', 'initial buy caps'],
    signingModel: 'browser wallet signs reviewed unsigned transaction',
    simulationRequirement: 'simulate LaunchLab initialize/buy transaction before signature',
    blockers: ['raydium-launchlab-builder-missing', 'launchlab-simulation-proof-missing']
  },
  {
    id: 'raydium-cpmm',
    label: 'Raydium CPMM / Trade API',
    implementationStatus: 'adapter-missing' as ImplementationStatus,
    requiredSdkOrApi: '@raydium-io/raydium-sdk-v2 CPMM pool builder or Raydium transaction API',
    requiredInputs: ['base mint', 'quote mint', 'initial liquidity', 'fee tier/pool config', 'owner wallet', 'LP burn/lock policy'],
    signingModel: 'browser wallet signs reviewed unsigned pool transaction',
    simulationRequirement: 'simulate pool create/add-liquidity transaction and verify pool accounts',
    blockers: ['raydium-cpmm-builder-missing', 'lp-lock-or-burn-policy-unverified']
  },
  {
    id: 'orca-whirlpool',
    label: 'Orca Whirlpool',
    implementationStatus: 'adapter-missing' as ImplementationStatus,
    requiredSdkOrApi: '@orca-so/whirlpools position/pool builder',
    requiredInputs: ['token A/B mints', 'tick spacing', 'price range', 'liquidity amount', 'owner wallet'],
    signingModel: 'browser wallet signs reviewed unsigned pool/position transaction',
    simulationRequirement: 'simulate whirlpool initialize/open-position/add-liquidity path',
    blockers: ['orca-whirlpool-builder-missing', 'whirlpool-price-range-policy-missing']
  },
  {
    id: 'meteora-dlmm',
    label: 'Meteora DLMM',
    implementationStatus: 'adapter-missing' as ImplementationStatus,
    requiredSdkOrApi: '@meteora-ag/dlmm pool/position builder',
    requiredInputs: ['token X/Y mints', 'bin step', 'active bin/price', 'liquidity distribution', 'owner wallet'],
    signingModel: 'browser wallet signs reviewed unsigned pool/position transaction',
    simulationRequirement: 'simulate DLMM pool/position transaction and verify bins',
    blockers: ['meteora-dlmm-builder-missing', 'dlmm-bin-policy-missing']
  }
] as const;

export function buildCreateLpEngineReadiness() {
  return {
    contract: 'bondr-create-lp-engine-readiness-v1' as const,
    status: 'protocol-sdk-required' as EngineStatus,
    implementationStatus: 'adapter-missing' as ImplementationStatus,
    execution: 'readiness-map-only-no-lp-transaction' as const,
    adapters: LP_ADAPTER_READINESS,
    blockers: Array.from(new Set(LP_ADAPTER_READINESS.flatMap((adapter) => adapter.blockers))),
    safety: {
      noFakeLpCreation: true,
      noSigning: true,
      noBroadcast: true,
      explicitProtocolBuilderRequired: true
    }
  };
}

export function buildDeploymentEngineReadiness(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus) {
  return {
    contract: 'bondr-deployment-engine-readiness-v1' as const,
    tokenMint: buildTokenMintEngineReadiness(project, wallets, activation),
    launchBundle: buildLaunchBundleEngineReadiness(project, wallets, activation),
    createLp: buildCreateLpEngineReadiness()
  };
}
