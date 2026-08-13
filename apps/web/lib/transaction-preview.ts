export type TransactionPreviewAction = 'swap' | 'launch' | 'lp' | 'claim' | 'wallet-send';
export type TransactionPreviewMode = 'preview-only' | 'unsigned-build' | 'simulation-ready';

export type TransactionPreview = {
  status: 'ok' | 'blocked' | 'error';
  mode: TransactionPreviewMode;
  action: TransactionPreviewAction;
  projectId?: string;
  tokenMint?: string;
  wallet?: string;
  provider?: string;
  route?: string;
  inputAmount?: string;
  outputEstimate?: string;
  slippageBps?: number;
  priorityFeeLamports?: number;
  estimatedNetworkFeeLamports?: number;
  simulationStatus?: 'not-run' | 'ready' | 'failed' | 'passed';
  unsignedTransaction?: string | null;
  expiresAt?: string;
  blockers: string[];
  warnings: string[];
  userConfirmationRequired: true;
  signingEnabled: false;
  broadcastEnabled: false;
};

type BuildPreviewInput = Partial<Omit<TransactionPreview, 'userConfirmationRequired' | 'signingEnabled' | 'broadcastEnabled' | 'blockers' | 'warnings'>> & {
  action: TransactionPreviewAction;
  blockers?: string[];
  warnings?: string[];
};

export function buildTransactionPreview(input: BuildPreviewInput): TransactionPreview {
  const blockers = input.blockers ?? [];
  const status = input.status ?? (blockers.length ? 'blocked' : 'ok');
  return {
    status,
    mode: input.mode ?? 'preview-only',
    action: input.action,
    projectId: input.projectId,
    tokenMint: input.tokenMint,
    wallet: input.wallet,
    provider: input.provider,
    route: input.route,
    inputAmount: input.inputAmount,
    outputEstimate: input.outputEstimate,
    slippageBps: input.slippageBps,
    priorityFeeLamports: input.priorityFeeLamports,
    estimatedNetworkFeeLamports: input.estimatedNetworkFeeLamports,
    simulationStatus: input.simulationStatus ?? 'not-run',
    unsignedTransaction: input.unsignedTransaction ?? null,
    expiresAt: input.expiresAt,
    blockers,
    warnings: input.warnings ?? [],
    userConfirmationRequired: true,
    signingEnabled: false,
    broadcastEnabled: false
  };
}

export function liveDisabledPreview(action: TransactionPreviewAction, route: string, blockers: string[] = ['LIVE_TRADING_ENABLED is false.']): TransactionPreview {
  return buildTransactionPreview({
    status: 'blocked',
    mode: 'preview-only',
    action,
    route,
    blockers,
    warnings: ['Signing and broadcast are intentionally disabled until the approved live beta activation step.']
  });
}
