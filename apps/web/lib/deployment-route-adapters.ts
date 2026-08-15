import type { Project, Wallet, WalletPlanEntry } from './meridian-store';
import type { getLiveActivationStatus } from './live-activation';
import { getJitoRelayReadiness } from './jito-relay-readiness';
import { pinataJwt } from './ipfs-metadata-readiness';
import { buildPumpPortalCreatePreview } from './pumpportal-deploy-readiness';
import { buildWalletSigningReadiness } from './wallet-signing-readiness';

export type DeploymentRouteAdapterId =
  | 'pumpportal-create'
  | 'pumpportal-trade-local'
  | 'pumpportal-jito-bundle'
  | 'raydium-original-lp-burn';

export type DeploymentRouteAdapter = {
  id: DeploymentRouteAdapterId;
  label: string;
  route: string;
  supportLevel: 'mapped' | 'research' | 'scaffolded' | 'blocked';
  requiredInputs: string[];
  apiFlow: string[];
  signingModel: string;
  safeguards: string[];
  blockedUntil: string[];
};

export const DEPLOYMENT_ROUTE_ADAPTERS: DeploymentRouteAdapter[] = [
  {
    id: 'pumpportal-create',
    label: 'Pump.fun / PumpPortal create',
    route: 'PumpPortal trade-local create',
    supportLevel: 'scaffolded',
    requiredInputs: ['metadata URI from IPFS', 'dev wallet public key', 'mint keypair public key', 'initial dev buy SOL', 'slippage bps', 'priority fee cap'],
    apiFlow: ['upload metadata to IPFS', 'POST https://pumpportal.fun/api/trade-local with action=create', 'deserialize transaction', 'verify signer and mint binding', 'simulate', 'browser/dev wallet sign', 'broadcast only after approval'],
    signingModel: 'client-side dev wallet plus client-created mint keypair; server never signs',
    safeguards: ['exact dev signer', 'exact mint binding', 'max SOL cap', 'slippage cap', 'priority fee cap', 'fresh blockhash', 'no hidden writable account injection'],
    blockedUntil: ['explicit launch approval', 'LIVE_DEPLOYMENT_ENABLED=true', 'broadcast gate approval', 'metadata URI verified']
  },
  {
    id: 'pumpportal-trade-local',
    label: 'PumpPortal trade-local',
    route: 'Post-launch buy/sell preview',
    supportLevel: 'mapped',
    requiredInputs: ['mint', 'wallet public key', 'side', 'amount', 'denominatedInSol', 'slippage', 'priorityFee', 'pool'],
    apiFlow: ['POST trade-local', 'deserialize versioned transaction', 'bind signer/mint/amount policy', 'simulate', 'browser wallet sign', 'broadcast only after separate approval'],
    signingModel: 'browser wallet per participating wallet',
    safeguards: ['wallet allowlist', 'per-wallet SOL cap', 'route/pool freshness', 'deterministic failures do not retry blindly'],
    blockedUntil: ['real launched mint exists', 'rail-specific approval for secondary wallets']
  },
  {
    id: 'pumpportal-jito-bundle',
    label: 'PumpPortal Jito bundle',
    route: 'Array trade-local body plus Jito sendBundle',
    supportLevel: 'research',
    requiredInputs: ['up to five wallet intents', 'signed transactions per wallet', 'Jito endpoint', 'Jito tip cap', 'bundle simulation result'],
    apiFlow: ['build array body', 'deserialize each transaction', 'verify wallet/mint/amount policies', 'sign per wallet', 'submit bundle only after approval'],
    signingModel: 'one approved signer per bundle leg; no server custody',
    safeguards: ['max five legs', 'total SOL cap', 'Jito tip cap', 'no self-trade loop', 'all-or-nothing bundle status tracking'],
    blockedUntil: ['Jito provider configured', 'bundle simulation implemented', 'explicit bundle approval']
  },
  {
    id: 'raydium-original-lp-burn',
    label: 'Raydium original LP + burn',
    route: 'SPL token deploy, Raydium LP add, LP-token burn',
    supportLevel: 'mapped',
    requiredInputs: ['mint', 'token metadata', 'deployer wallet', 'SOL liquidity', 'withheld token allocation', 'LP burn policy'],
    apiFlow: ['build SPL token mint transaction', 'build Raydium pool/liquidity transaction', 'resolve LP mint/account', 'build LP burn transaction', 'simulate all legs', 'browser wallet sign', 'broadcast only after approval'],
    signingModel: 'browser deployer wallet signs reviewed unsigned Raydium pool and burn transactions',
    safeguards: ['exact deployer signer', 'exact mint binding', 'liquidity SOL cap', 'withheld token cap', 'LP mint/account verification', 'burn destination verification', 'simulation proof'],
    blockedUntil: ['Raydium original LP builder implemented', 'LP burn transaction builder implemented', 'simulation proof', 'explicit launch approval']
  }
];

const CLI_COMMANDS = [
  ['Cluster', 'solana config get'],
  ['CLI wallet', 'solana address'],
  ['Dev wallet balance', 'solana balance <DEV_WALLET>'],
  ['Dev wallet token accounts', 'spl-token accounts --owner <DEV_WALLET>'],
  ['Mint account after launch', 'spl-token account-info <MINT_OR_TOKEN_ACCOUNT>']
] as const;

function short(address?: string | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-5)}` : 'not selected';
}

function planByPhase(project: Project, phase: NonNullable<WalletPlanEntry['executionPhase']>) {
  return project.launchConfig?.walletPlan.find((entry) => entry.executionPhase === phase || entry.role.toLowerCase().includes(phase));
}

export function buildDeploymentLaunchReadiness(project: Project, wallets: Wallet[], activation: ReturnType<typeof getLiveActivationStatus>) {
  const relay = getJitoRelayReadiness();
  const devPlan = planByPhase(project, 'dev') ?? project.launchConfig?.walletPlan.find((entry) => entry.participate) ?? null;
  const devWallet = wallets.find((wallet) => wallet.id === devPlan?.walletId) ?? wallets[0] ?? null;
  const bundlePlans = project.launchConfig?.walletPlan.filter((entry) => entry.executionPhase === 'bundle') ?? [];
  const sniperPlans = project.launchConfig?.walletPlan.filter((entry) => entry.executionPhase === 'sniper') ?? [];
  const taskPlans = project.launchConfig?.walletPlan.filter((entry) => entry.executionPhase === 'task') ?? [];
  const participatingPlans = project.launchConfig?.walletPlan.filter((entry) => entry.participate) ?? [];
  const signingReadiness = buildWalletSigningReadiness(project, wallets);
  const maxDevBuySol = devPlan?.maxBuySol || devPlan?.plannedBuySol || project.fundingPlan.devBuySol || 0;
  const route = project.launchConfig?.route;
  const metadataFieldsReady = Boolean(project.metadata.name && project.metadata.symbol && project.metadata.description && project.metadata.imageUrl);
  const ipfsReady = /^ipfs:\/\//i.test(project.metadata.metadataUri ?? '') || /\/ipfs\//i.test(project.metadata.metadataUri ?? '') || /^ipfs:\/\//i.test(project.metadata.imageUrl) || /\/ipfs\//i.test(project.metadata.imageUrl);
  const pumpPortalCreatePreview = buildPumpPortalCreatePreview(project, wallets, activation);
  const jitoTipCapSol = relay.tip.maxSol;
  const maxPriorityFeeSol = project.launchConfig?.devWalletRules.maxPriorityFeeSol ?? 0;
  const estimatedCreateFeeSol = Number(process.env.DEPLOYMENT_ESTIMATED_CREATE_FEE_SOL ?? '0.005');
  const requiredBufferSol = Number(process.env.DEPLOYMENT_REQUIRED_BUFFER_SOL ?? '0.01');
  const modeledRequiredSol = Math.max(project.fundingPlan.budgetSol, maxDevBuySol) + maxPriorityFeeSol + jitoTipCapSol + estimatedCreateFeeSol + requiredBufferSol;
  const blockers = [
    !project.metadata.name || !project.metadata.symbol || !project.metadata.description ? 'metadata-incomplete' : null,
    !project.metadata.imageUrl ? 'token-image-missing' : null,
    ipfsReady ? null : 'ipfs-metadata-uri-missing',
    !devWallet ? 'dev-wallet-missing' : null,
    maxDevBuySol <= 0 ? 'dev-buy-cap-missing' : null,
    bundlePlans.length && !relay.relayEnabled ? 'jito-relay-disabled-for-bundle' : null,
    signingReadiness.blockers.some((blocker) => blocker.includes('watch-only')) ? 'multi-wallet-signing-orchestration-missing' : null,
    activation.deploymentEnabled ? null : 'deployment-gate-closed',
    activation.broadcastEnabled ? null : 'broadcast-gate-closed'
  ].filter((item): item is string => Boolean(item));
  const intentionalLiveGateIds = ['deployment-gate-closed', 'broadcast-gate-closed'];
  const optionalBlockerIds = ['jito-relay-disabled-for-bundle'];
  const intentionalLiveGateBlockers = blockers.filter((blocker) => intentionalLiveGateIds.includes(blocker));
  const optionalBlockers = blockers.filter((blocker) => optionalBlockerIds.includes(blocker));
  const rehearsalBlockers = blockers.filter((blocker) => !intentionalLiveGateBlockers.includes(blocker) && !optionalBlockers.includes(blocker));

  return {
    status: blockers.length ? 'blocked' : 'ready-for-approval',
    mode: 'dev-wallet-only',
    broadcastReady: false,
    blockers,
    rehearsalStatus: rehearsalBlockers.length ? 'blocked' : 'ready-for-dry-run-rehearsal',
    rehearsalBlockers,
    optionalBlockers,
    intentionalLiveGateBlockers,
    adapterRecommendation: project.launchPath.toLowerCase().includes('raydium') || route?.platform === 'raydium' ? 'raydium-original-lp-burn' : 'pumpportal-create',
    devWallet: devWallet ? { id: devWallet.id, role: devWallet.role, address: devWallet.address, shortAddress: short(devWallet.address), custodyMode: devWallet.custodyMode ?? 'watch-only' } : null,
    railCounts: { bundle: bundlePlans.length, sniper: sniperPlans.length, task: taskPlans.length },
    approvalSummary: {
      launchVenue: route?.platform ?? project.launchPath,
      tokenName: project.metadata.name || project.name,
      tokenSymbol: project.metadata.symbol || project.ticker,
      description: project.metadata.description || 'pending',
      imageUri: project.metadata.imageUrl || 'pending',
      website: project.metadata.website || 'none',
      socials: { twitter: project.metadata.twitter || 'none', telegram: project.metadata.telegram || 'none' },
      devWalletAddress: devWallet?.address ?? 'pending',
      custodyPath: devWallet?.custodyMode ?? 'browser/watch-only',
      mintKeypairHandling: 'client-created mint keypair; server never stores private key',
      maxDevBuySol,
      maxTotalSolAtRisk: Math.max(project.fundingPlan.budgetSol, maxDevBuySol),
      slippageCapBps: route?.slippageBps ?? project.launchConfig?.devWalletRules.maxSlippageBps ?? 100,
      priorityFeeCapSol: project.launchConfig?.devWalletRules.maxPriorityFeeSol ?? 0,
      jitoTipCapSol,
      estimatedCreateFeeSol,
      requiredBufferSol,
      modeledRequiredSol,
      rpcBroadcastEndpoint: 'configured Solana RPC / explicit broadcast route after approval',
      publicLaunchConfirmation: 'pending Yakuzamoto approval'
    },
    pumpPortalCreateReadiness: pumpPortalCreatePreview,
    ipfsMetadataReadiness: {
      status: ipfsReady ? 'ready' : pinataJwt() ? 'pinning-provider-configured-upload-needed' : 'provider-required',
      imageUrl: project.metadata.imageUrl || null,
      metadataUri: project.metadata.metadataUri ?? null,
      requiredEnv: ['PINATA_JWT', 'BONDR_PINATA_API'],
      optionalEnv: ['IPFS_GATEWAY_URL'],
      blockers: [
        project.metadata.imageUrl ? null : 'token-image-missing',
        ipfsReady ? null : 'metadata-not-pinned-to-ipfs'
      ].filter((item): item is string => Boolean(item)),
      docs: ['https://pumpportal.fun/creation/']
    },
    signingOrchestration: signingReadiness,
    relayReadiness: relay,
    fundingAndTipReadiness: {
      status: project.fundingPlan.budgetSol >= modeledRequiredSol ? 'modeled-covered' : 'review',
      plannedBuySol: participatingPlans.reduce((sum, entry) => sum + entry.plannedBuySol, 0),
      maxBuySol: participatingPlans.reduce((sum, entry) => sum + entry.maxBuySol, 0),
      priorityFeeCapSol: maxPriorityFeeSol,
      jitoTipCapSol,
      estimatedCreateFeeSol,
      requiredBufferSol,
      modeledRequiredSol,
      modeledBudgetSol: project.fundingPlan.budgetSol,
      liveBalanceStatus: 'not-hydrated-here'
    },
    cliChecklist: CLI_COMMANDS.map(([label, command]) => ({ label, command: command.replaceAll('<DEV_WALLET>', devWallet?.address ?? '<DEV_WALLET>') })),
    transactionPolicyChecks: [
      'exact mint binding',
      'exact signer binding',
      'no hidden writable account injection',
      'no hidden program injection',
      'max SOL spend cap',
      'max priority fee / Jito tip cap',
      'fresh blockhash',
      'route and pool freshness',
      'deterministic failures do not retry blindly',
      'expiry may rebuild only under retry cap'
    ],
    postLaunchRailVerification: [
      { rail: 'bundle', count: bundlePlans.length, broadcastReady: false, requiredProof: ['build preview against real mint', 'wallet allowlist', 'total SOL cap', 'Jito relay readiness', 'tip cap', 'no self-trade loop', 'bundle simulation before Jito'] },
      { rail: 'sniper', count: sniperPlans.length, broadcastReady: false, requiredProof: ['trigger source', 'build preview against real mint', 'signer allowlist', 'slippage cap', 'priority fee cap', 'TP/SL/cooldown rules', 'relay/RPC submit policy'] },
      { rail: 'task', count: taskPlans.length, broadcastReady: false, requiredProof: ['durable scheduler/worker', 'task wallet allowlist', 'amount ranges', 'delay/cooldown bounds', 'sell caps', 'no artificial volume loop'] }
    ]
  };
}
