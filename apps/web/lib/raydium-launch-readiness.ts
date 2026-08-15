import type { LiveActivationStatus } from './live-activation';
import type { Project, Wallet, WalletPlanEntry } from './meridian-store';

type RaydiumStageStatus = 'implemented' | 'config-ready' | 'builder-missing' | 'blocked';

function planByPhase(project: Project, phase: NonNullable<WalletPlanEntry['executionPhase']>) {
  return project.launchConfig?.walletPlan.find((entry) => entry.executionPhase === phase || entry.role.toLowerCase().includes(phase));
}

function devWallet(project: Project, wallets: Wallet[]) {
  const devPlan = planByPhase(project, 'dev') ?? project.launchConfig?.walletPlan.find((entry) => entry.participate) ?? null;
  return wallets.find((wallet) => wallet.id === devPlan?.walletId) ?? wallets[0] ?? null;
}

export function buildRaydiumLaunchReadiness(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus) {
  const route = project?.launchConfig?.route ?? null;
  const deployer = project ? devWallet(project, wallets) : null;
  const raydiumSelected = project?.launchPath === 'raydium' || route?.platform === 'raydium';
  const configBlockers = [
    project ? null : 'project-required',
    deployer?.address ? null : 'deployer-wallet-required',
    route && route.raydiumLiquiditySol > 0 ? null : 'raydium-liquidity-sol-required',
    route && route.raydiumWithheldTokenPct >= 0 && route.raydiumWithheldTokenPct <= 100 ? null : 'withheld-token-policy-required',
    route?.burnLiquidity ? null : 'lp-burn-policy-required'
  ].filter((item): item is string => Boolean(item));
  const missingBuilderIds = [
    'raydium-original-lp-builder',
    'lp-token-account-derivation',
    'raydium-lp-burn-simulation-proof'
  ];
  const gatedBuilderIds = ['lp-burn-transaction-builder'];

  return {
    contract: 'bondr-raydium-launch-readiness-v1' as const,
    selected: raydiumSelected,
    status: missingBuilderIds.length ? 'builder-missing' as const : 'ready',
    developed: false,
    execution: 'readiness-only-no-raydium-transaction-no-lp-creation' as const,
    routeConfig: {
      raydiumLiquiditySol: route?.raydiumLiquiditySol ?? null,
      raydiumWithheldTokenPct: route?.raydiumWithheldTokenPct ?? null,
      raydiumWithheldTokenAmount: route?.raydiumWithheldTokenAmount ?? null,
      burnLiquidity: route?.burnLiquidity ?? false
    },
    requiredSigners: {
      deployer: deployer?.address ?? null,
      clientMintKeypair: 'required-client-side',
      serverSigner: false
    },
    stages: [
      {
        id: 'spl-token-create',
        label: 'SPL token creation',
        status: 'implemented' as RaydiumStageStatus,
        builder: 'deployment-engine create-spl-token unsigned builder',
        requiredInputs: ['payer/deployer', 'client mint public key', 'decimals', 'initial supply', 'freeze authority optional'],
        outputProof: ['unsigned transaction', 'required signer list', 'mint binding']
      },
      {
        id: 'raydium-lp-add',
        label: 'Raydium original LP add',
        status: 'builder-missing' as RaydiumStageStatus,
        builder: '@raydium-io/raydium-sdk-v2 or verified Raydium pool transaction API',
        requiredInputs: ['base token mint', 'SOL/quote mint', 'initial token liquidity', 'initial SOL liquidity', 'deployer wallet', 'pool config'],
        outputProof: ['unsigned pool/liquidity transaction', 'exact writable accounts', 'LP mint/account evidence']
      },
      {
        id: 'lp-token-identify',
        label: 'LP token/account identification',
        status: 'builder-missing' as RaydiumStageStatus,
        builder: 'post-LP transaction account resolver',
        requiredInputs: ['Raydium pool id', 'owner token accounts', 'LP mint', 'LP token account'],
        outputProof: ['verified LP mint', 'verified LP token account owner', 'expected LP balance']
      },
      {
        id: 'lp-burn-build',
        label: 'Automated LP burn transaction',
        status: 'blocked' as RaydiumStageStatus,
        builder: 'SPL token burn/close-account transaction builder',
        requiredInputs: ['verified LP token account', 'LP mint', 'burn amount', 'deployer authority'],
        outputProof: ['unsigned burn transaction', 'burn amount policy', 'remaining LP balance policy'],
        blockers: ['verified-lp-token-account-required', 'deployment-gate-closed']
      },
      {
        id: 'simulate-and-review',
        label: 'Simulation and review',
        status: 'builder-missing' as RaydiumStageStatus,
        builder: 'multi-leg simulation harness',
        requiredInputs: ['SPL mint tx', 'Raydium LP tx', 'LP burn tx', 'fresh blockhashes'],
        outputProof: ['simulation success for each leg', 'account delta review', 'no hidden signer/program injection']
      }
    ],
    configBlockers,
    missingBuilderIds,
    gatedBuilderIds,
    blockers: [
      ...configBlockers,
      ...missingBuilderIds,
      'verified-lp-token-account-required',
      activation.deploymentEnabled ? null : 'deployment-gate-closed',
      activation.broadcastEnabled ? null : 'broadcast-gate-closed'
    ].filter((item): item is string => Boolean(item)),
    safety: {
      noFakeLpCreation: true,
      noProviderCall: true,
      noSigning: true,
      noBroadcast: true,
      noServerCustody: true,
      explicitApprovalRequired: true
    }
  };
}
