import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import type { LiveActivationStatus } from './live-activation';
import type { Project, Wallet, WalletPlanEntry } from './meridian-store';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export type RaydiumOriginalLpPlan = {
  contract: 'bondr-raydium-original-lp-plan-v1';
  status: 'preflight-ready' | 'blocked';
  execution: 'raydium-lp-plan-only-no-sdk-call-no-signing-no-broadcast';
  projectId: string | null;
  baseMint: string | null;
  quoteMint: string;
  deployer: string | null;
  planHash: string;
  unsignedBuildContract: {
    adapter: '@raydium-io/raydium-sdk-v2';
    method: 'makeCreateCpmmPoolInInstruction';
    endpoint: '/api/deployment/raydium/build-lp';
    returnedShape: 'unsigned-legacy-transaction';
    mustExpose: string[];
  };
  liquidityPolicy: {
    initialTokenLiquidityMode: 'withheld-token-percent' | 'withheld-token-amount' | 'unresolved';
    withheldTokenPct: number | null;
    withheldTokenAmount: number | null;
    quoteLiquiditySol: number | null;
    slippageBps: number | null;
    maxPriorityFeeSol: number | null;
    burnLiquidity: boolean;
  };
  stages: Array<{
    id: string;
    status: 'ready' | 'blocked' | 'requires-sdk-adapter' | 'requires-chain-proof';
    requiredSigners: string[];
    blockers: string[];
  }>;
  requiredProofs: string[];
  blockers: string[];
  warnings: string[];
  safety: {
    noProviderCall: true;
    noFakeLpCreation: true;
    noSigning: true;
    noBroadcast: true;
    requiresSimulationBeforeSigning: true;
    requiresVerifiedLpAccountBeforeBurn: true;
  };
};

function validPublicKey(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function phaseFor(entry: WalletPlanEntry) {
  return entry.executionPhase ?? (entry.role.toLowerCase().includes('dev') ? 'dev' : 'observe');
}

function deployerWallet(project: Project | null, wallets: Wallet[]) {
  const plan = project?.launchConfig?.walletPlan.find((entry) => phaseFor(entry) === 'dev') ?? project?.launchConfig?.walletPlan.find((entry) => entry.participate) ?? null;
  return wallets.find((wallet) => wallet.id === plan?.walletId) ?? wallets[0] ?? null;
}

function positive(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function buildRaydiumOriginalLpPlan(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus): RaydiumOriginalLpPlan {
  const route = project?.launchConfig?.route ?? null;
  const rules = project?.launchConfig?.devWalletRules ?? null;
  const deployer = deployerWallet(project, wallets);
  const baseMint = validPublicKey(project?.tokenMint ?? project?.launchReceipt?.tokenMint ?? null);
  const quoteMint = route?.quoteToken === 'USDC' ? 'USDC-resolver-required' : WSOL_MINT;
  const burnLiquidity = Boolean(route?.burnLiquidity);
  const withheldTokenPct = typeof route?.raydiumWithheldTokenPct === 'number' ? route.raydiumWithheldTokenPct : null;
  const withheldTokenAmount = typeof route?.raydiumWithheldTokenAmount === 'number' ? route.raydiumWithheldTokenAmount : null;
  const initialTokenLiquidityMode = positive(withheldTokenAmount)
    ? 'withheld-token-amount'
    : withheldTokenPct !== null && withheldTokenPct >= 0 && withheldTokenPct <= 100
      ? 'withheld-token-percent'
      : 'unresolved';
  const inputBlockers = [
    project ? null : 'project-required',
    baseMint ? null : 'base-token-mint-required',
    deployer?.address ? null : 'deployer-wallet-required',
    positive(route?.raydiumLiquiditySol) ? null : 'quote-liquidity-sol-required',
    initialTokenLiquidityMode !== 'unresolved' ? null : 'token-liquidity-policy-required',
    burnLiquidity ? null : 'lp-burn-policy-required',
    quoteMint === WSOL_MINT ? null : 'quote-token-resolver-required'
  ].filter((item): item is string => Boolean(item));
  const chainProofBlockers = [
    'raydium-cpmm-config-id-required',
    'raydium-user-token-account-proof-required',
    'raydium-pool-account-proof-required',
    'verified-lp-token-account-required',
    'lp-burn-simulation-proof-required'
  ];
  const gateBlockers = [
    activation.deploymentEnabled ? null : 'deployment-gate-closed',
    activation.broadcastEnabled ? null : 'broadcast-gate-closed'
  ].filter((item): item is string => Boolean(item));
  const stages: RaydiumOriginalLpPlan['stages'] = [
    { id: 'validate-inputs', status: inputBlockers.length ? 'blocked' : 'ready', requiredSigners: [], blockers: inputBlockers },
    { id: 'build-raydium-lp-unsigned', status: inputBlockers.length ? 'blocked' : 'ready', requiredSigners: deployer?.address ? [deployer.address] : [], blockers: inputBlockers.length ? inputBlockers : [] },
    { id: 'verify-lp-mint-and-account', status: 'requires-chain-proof', requiredSigners: [], blockers: ['raydium-pool-account-proof-required', 'lp-token-account-derivation-required'] },
    { id: 'build-lp-burn-unsigned', status: burnLiquidity ? 'requires-chain-proof' : 'blocked', requiredSigners: deployer?.address ? [deployer.address] : [], blockers: burnLiquidity ? ['verified-lp-token-account-required', 'lp-burn-simulation-proof-required'] : ['lp-burn-policy-required'] }
  ];
  const blockers = Array.from(new Set([...inputBlockers, ...chainProofBlockers, ...gateBlockers]));
  const planCore = {
    projectId: project?.id ?? null,
    baseMint,
    quoteMint,
    deployer: deployer?.address ?? null,
    liquiditySol: route?.raydiumLiquiditySol ?? null,
    withheldTokenPct,
    withheldTokenAmount,
    burnLiquidity
  };

  return {
    contract: 'bondr-raydium-original-lp-plan-v1',
    status: blockers.filter((blocker) => !['deployment-gate-closed', 'broadcast-gate-closed'].includes(blocker)).length ? 'blocked' : 'preflight-ready',
    execution: 'raydium-lp-plan-only-no-sdk-call-no-signing-no-broadcast',
    projectId: project?.id ?? null,
    baseMint,
    quoteMint,
    deployer: deployer?.address ?? null,
    planHash: hash(planCore),
    unsignedBuildContract: {
      adapter: '@raydium-io/raydium-sdk-v2',
      method: 'makeCreateCpmmPoolInInstruction',
      endpoint: '/api/deployment/raydium/build-lp',
      returnedShape: 'unsigned-legacy-transaction',
      mustExpose: ['poolId', 'lpMint', 'lpTokenAccount', 'requiredSigners', 'writableAccounts', 'simulationRequest']
    },
    liquidityPolicy: {
      initialTokenLiquidityMode,
      withheldTokenPct,
      withheldTokenAmount,
      quoteLiquiditySol: route?.raydiumLiquiditySol ?? null,
      slippageBps: route?.slippageBps ?? null,
      maxPriorityFeeSol: rules?.maxPriorityFeeSol ?? null,
      burnLiquidity
    },
    stages,
    requiredProofs: ['unsigned Raydium LP transaction', 'successful LP transaction simulation', 'verified pool id', 'verified LP mint', 'verified owner LP token account', 'successful LP burn simulation'],
    blockers,
    warnings: quoteMint === WSOL_MINT ? [] : ['usdc-raydium-route-needs-token-account-and-pool-config-resolver'],
    safety: {
      noProviderCall: true,
      noFakeLpCreation: true,
      noSigning: true,
      noBroadcast: true,
      requiresSimulationBeforeSigning: true,
      requiresVerifiedLpAccountBeforeBurn: true
    }
  };
}
