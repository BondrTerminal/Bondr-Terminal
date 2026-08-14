import type { Project, Wallet, WalletPlanEntry } from './meridian-store';
import type { getLiveActivationStatus } from './live-activation';

export type DeploymentRouteAdapterId =
  | 'pumpportal-create'
  | 'pumpportal-trade-local'
  | 'pumpportal-jito-bundle'
  | 'raydium-launchlab'
  | 'raydium-trade-api';

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
    id: 'raydium-launchlab',
    label: 'Raydium LaunchLab',
    route: 'Direct LaunchLab bonding-curve launch',
    supportLevel: 'mapped',
    requiredInputs: ['LaunchLab params', 'metadata', 'dev wallet', 'quote token', 'curve config', 'initial buy caps'],
    apiFlow: ['prepare LaunchLab initialize/buy transaction', 'verify curve/quote params', 'simulate', 'browser wallet sign', 'broadcast only after approval'],
    signingModel: 'browser wallet; server builds/validates only',
    safeguards: ['cluster alignment', 'ATA rent accounted', 'fresh LaunchLab state', 'compute fee cap', 'slippage by pool type'],
    blockedUntil: ['direct SDK builder implemented', 'LaunchLab simulation proof', 'explicit launch approval']
  },
  {
    id: 'raydium-trade-api',
    label: 'Raydium Trade API',
    route: 'Post-launch route/transaction build',
    supportLevel: 'mapped',
    requiredInputs: ['input mint', 'output mint', 'amount', 'slippage', 'compute unit price', 'wallet public key'],
    apiFlow: ['compute quote', 'build V0 transaction', 'verify returned transaction', 'simulate', 'browser wallet sign', 'broadcast only after approval'],
    signingModel: 'browser wallet for returned V0 transaction',
    safeguards: ['quote freshness', 'pool freshness', 'compute unit price cap', 'slippage cap', 'address lookup table review'],
    blockedUntil: ['post-launch mint/pool exists', 'secondary wallet approval']
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
  const devPlan = planByPhase(project, 'dev') ?? project.launchConfig?.walletPlan.find((entry) => entry.participate) ?? null;
  const devWallet = wallets.find((wallet) => wallet.id === devPlan?.walletId) ?? wallets[0] ?? null;
  const bundlePlans = project.launchConfig?.walletPlan.filter((entry) => entry.executionPhase === 'bundle') ?? [];
  const sniperPlans = project.launchConfig?.walletPlan.filter((entry) => entry.executionPhase === 'sniper') ?? [];
  const taskPlans = project.launchConfig?.walletPlan.filter((entry) => entry.executionPhase === 'task') ?? [];
  const maxDevBuySol = devPlan?.maxBuySol || devPlan?.plannedBuySol || project.fundingPlan.devBuySol || 0;
  const route = project.launchConfig?.route;
  const blockers = [
    !project.metadata.name || !project.metadata.symbol || !project.metadata.description ? 'metadata-incomplete' : null,
    !project.metadata.imageUrl ? 'token-image-missing' : null,
    !devWallet ? 'dev-wallet-missing' : null,
    maxDevBuySol <= 0 ? 'dev-buy-cap-missing' : null,
    activation.deploymentEnabled ? null : 'deployment-gate-closed',
    activation.broadcastEnabled ? null : 'broadcast-gate-closed'
  ].filter((item): item is string => Boolean(item));

  return {
    status: blockers.length ? 'blocked' : 'ready-for-approval',
    mode: 'dev-wallet-only',
    broadcastReady: false,
    blockers,
    adapterRecommendation: project.launchPath.toLowerCase().includes('raydium') ? 'raydium-launchlab' : route?.platform === 'bonk' ? 'pumpportal-trade-local' : 'pumpportal-create',
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
      jitoTipCapSol: 0,
      rpcBroadcastEndpoint: 'configured Solana RPC / explicit broadcast route after approval',
      publicLaunchConfirmation: 'pending Yakuzamoto approval'
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
      { rail: 'bundle', count: bundlePlans.length, broadcastReady: false, requiredProof: ['build preview against real mint', 'wallet allowlist', 'total SOL cap', 'no self-trade loop', 'bundle simulation before Jito'] },
      { rail: 'sniper', count: sniperPlans.length, broadcastReady: false, requiredProof: ['build preview against real mint', 'signer allowlist', 'slippage cap', 'priority fee cap', 'TP/SL/cooldown rules'] },
      { rail: 'task', count: taskPlans.length, broadcastReady: false, requiredProof: ['task wallet allowlist', 'amount ranges', 'delay/cooldown bounds', 'sell caps', 'no artificial volume loop'] }
    ]
  };
}
