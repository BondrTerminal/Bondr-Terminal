import type { LiveActivationStatus } from './live-activation';
import type { Project, Wallet, WalletPlanEntry } from './meridian-store';
import { getJitoRelayReadiness } from './jito-relay-readiness';
import { buildJitoLaunchBundlePlan } from './jito-launch-bundle-plan';
import { buildRaydiumOriginalLpPlan } from './raydium-original-lp-plan';

type EngineStatus = 'transaction-builder-ready' | 'deployment-disabled' | 'rehearsal-contract-ready' | 'protocol-sdk-required' | 'not-required';
type ImplementationStatus = 'builder-implemented' | 'rehearsal-contract-only' | 'adapter-missing' | 'not-required';

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
  const bundlePlan = buildJitoLaunchBundlePlan(project, wallets, activation, { relay });
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
    bundlePlan,
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
    id: 'pumpfun-pumpportal-launch',
    label: 'Pump.fun / PumpPortal bonding curve',
    implementationStatus: 'not-required' as ImplementationStatus,
    requiredSdkOrApi: 'PumpPortal trade-local create for unsigned launch transaction',
    requiredInputs: ['IPFS metadata URI', 'dev wallet', 'client mint keypair public key', 'initial buy SOL', 'slippage cap', 'priority fee cap'],
    signingModel: 'browser dev wallet plus client-created mint keypair; server never signs',
    simulationRequirement: 'deserialize, policy-check, then simulate returned unsigned create transaction before signature',
    blockers: ['pumpportal-provider-build-gated', 'deployment-gate-closed', 'broadcast-gate-closed'],
    lpPolicy: 'BONDR does not create a Raydium LP in the Pump.fun route; launch liquidity is bonding-curve/migration governed.'
  },
  {
    id: 'raydium-original-lp-burn',
    label: 'Raydium original LP + burn on launch',
    implementationStatus: 'adapter-missing' as ImplementationStatus,
    requiredSdkOrApi: '@raydium-io/raydium-sdk-v2 or verified Raydium pool transaction API for original LP creation and LP-token burn',
    requiredInputs: ['base token mint', 'quote/SOL mint', 'initial token liquidity', 'initial SOL/quote liquidity', 'deployer wallet', 'pool config', 'LP token destination', 'burn authority/policy'],
    signingModel: 'browser deployer wallet signs reviewed unsigned Raydium pool + burn transactions',
    simulationRequirement: 'simulate pool create/add-liquidity transaction, verify LP token mint/account, then simulate LP burn before signature/broadcast',
    blockers: ['raydium-original-lp-builder-missing', 'lp-token-account-derivation-missing', 'verified-lp-token-account-required', 'lp-burn-simulation-proof-missing'],
    lpPolicy: 'Automated LP burn is in-scope only after BONDR can build and verify the real Raydium LP token account and burn transaction.'
  }
] as const;

export function buildCreateLpEngineReadiness(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus) {
  const routePlatform = project?.launchPath === 'raydium' || project?.launchConfig?.route.platform === 'raydium' ? 'raydium' : 'pump';
  const raydiumPlan = buildRaydiumOriginalLpPlan(project, wallets, activation);
  const selectedAdapter = routePlatform === 'raydium'
    ? LP_ADAPTER_READINESS.find((adapter) => adapter.id === 'raydium-original-lp-burn')!
    : LP_ADAPTER_READINESS.find((adapter) => adapter.id === 'pumpfun-pumpportal-launch')!;

  return {
    contract: 'bondr-create-lp-engine-readiness-v1' as const,
    routePlatform,
    selectedAdapterId: selectedAdapter.id,
    status: routePlatform === 'raydium' ? 'rehearsal-contract-ready' as EngineStatus : 'not-required' as EngineStatus,
    implementationStatus: routePlatform === 'raydium' ? 'rehearsal-contract-only' as ImplementationStatus : 'not-required' as ImplementationStatus,
    execution: 'pumpfun-or-raydium-lp-readiness-map-only-no-lp-transaction' as const,
    adapters: LP_ADAPTER_READINESS,
    blockers: routePlatform === 'raydium' ? raydiumPlan.blockers : [],
    raydiumPlan,
    routeSummary: routePlatform === 'raydium'
      ? 'Raydium launch now has a deterministic LP lifecycle plan; it still needs the SDK transaction adapter and chain proofs before any LP add or burn can be signed.'
      : 'Pump.fun launch does not require BONDR-created LP at launch; LP creation is not a blocker for the Pump.fun route.',
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
    createLp: buildCreateLpEngineReadiness(project, wallets, activation)
  };
}
