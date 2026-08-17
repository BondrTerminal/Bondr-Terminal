import type { BundleReceiptRecord, JitoBundlePayload } from './jito-relay-adapter';

export type JitoWaveDispatchTransaction = {
  id: string;
  waveIndex: number;
  signedTransactionBase64?: string | null;
  transactionMessageHash: string;
  simulationStatus?: string | null;
  simulationTransactionMessageHash?: string | null;
  signedReviewStatus?: string | null;
};

export type JitoWaveApproval = {
  waveIndex: number;
  approvalId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
};

export type JitoWaveDispatchPlan = {
  contract: 'bondr-jito-wave-dispatch-plan-v1';
  status: 'ready' | 'blocked';
  waveCount: number;
  waves: Array<{
    waveIndex: number;
    status: 'ready' | 'blocked';
    transactionCount: number;
    transactionIds: string[];
    bundlePayload: JitoBundlePayload | null;
    approvalId: string | null;
    submitAfterWaveIndex: number | null;
    priorWaveReceiptStatus: BundleReceiptRecord['status'] | null;
    atomicWithinWave: true;
    atomicAcrossWaves: false;
    blockers: string[];
  }>;
  blockers: string[];
  safety: {
    noRelaySubmit: true;
    noBroadcast: true;
    noSigning: true;
    explicitApprovalPerWave: true;
    priorWaveReceiptRequiredForOverflow: true;
  };
};

const LANDED_STATUSES: Array<BundleReceiptRecord['status']> = ['landed', 'finalized'];

function groupByWave(transactions: JitoWaveDispatchTransaction[]) {
  const groups = new Map<number, JitoWaveDispatchTransaction[]>();
  for (const tx of transactions) {
    const index = Number.isInteger(tx.waveIndex) && tx.waveIndex >= 0 ? tx.waveIndex : 0;
    groups.set(index, [...(groups.get(index) ?? []), tx]);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a - b);
}

export function buildJitoWaveDispatchPlan(input: {
  transactions: JitoWaveDispatchTransaction[];
  expectedSigners: string[];
  expectedMint: string;
  tipLamports: number;
  approvals?: JitoWaveApproval[] | null;
  priorWaveReceipts?: BundleReceiptRecord[] | null;
  maxTransactionsPerBundle?: number;
  projectId?: string | null;
  rail?: JitoBundlePayload['rail'];
}): JitoWaveDispatchPlan {
  const maxTransactionsPerBundle = Math.max(1, Math.min(Math.floor(input.maxTransactionsPerBundle ?? 5), 5));
  const approvals = input.approvals ?? [];
  const receipts = input.priorWaveReceipts ?? [];
  const waves = groupByWave(input.transactions).map(([waveIndex, transactions]) => {
    const approval = approvals.find((item) => item.waveIndex === waveIndex) ?? null;
    const priorReceipt = waveIndex > 0 ? receipts.find((receipt) => receipt.status === 'landed' || receipt.status === 'finalized') ?? null : null;
    const blockers = [
      transactions.length ? null : `wave-${waveIndex}-transactions-required`,
      transactions.length <= maxTransactionsPerBundle ? null : `wave-${waveIndex}-exceeds-${maxTransactionsPerBundle}-transaction-limit`,
      approval?.approvalId ? null : `wave-${waveIndex}-explicit-approval-required`,
      waveIndex > 0 && (!priorReceipt || !LANDED_STATUSES.includes(priorReceipt.status)) ? `wave-${waveIndex}-prior-wave-receipt-required` : null,
      ...transactions.flatMap((tx) => [
        tx.signedTransactionBase64 ? null : `wave-${waveIndex}-transaction-${tx.id}-signed-transaction-required`,
        tx.transactionMessageHash ? null : `wave-${waveIndex}-transaction-${tx.id}-message-hash-required`,
        tx.simulationStatus === 'ok' ? null : `wave-${waveIndex}-transaction-${tx.id}-simulation-not-ok`,
        tx.simulationTransactionMessageHash === tx.transactionMessageHash ? null : `wave-${waveIndex}-transaction-${tx.id}-simulation-hash-mismatch`,
        tx.signedReviewStatus === 'passed' ? null : `wave-${waveIndex}-transaction-${tx.id}-signed-review-required`
      ])
    ].filter((item): item is string => Boolean(item));
    return {
      waveIndex,
      status: blockers.length ? 'blocked' as const : 'ready' as const,
      transactionCount: transactions.length,
      transactionIds: transactions.map((tx) => tx.id),
      bundlePayload: blockers.length ? null : {
        signedTransactions: transactions.map((tx) => tx.signedTransactionBase64!),
        expectedSigners: input.expectedSigners,
        expectedMint: input.expectedMint,
        tipLamports: input.tipLamports,
        simulationProof: transactions.map((tx) => ({ status: tx.simulationStatus, transactionMessageHash: tx.simulationTransactionMessageHash })),
        approvalId: approval!.approvalId,
        projectId: input.projectId,
        rail: input.rail ?? 'bundle'
      },
      approvalId: approval?.approvalId ?? null,
      submitAfterWaveIndex: waveIndex === 0 ? null : waveIndex - 1,
      priorWaveReceiptStatus: priorReceipt?.status ?? null,
      atomicWithinWave: true as const,
      atomicAcrossWaves: false as const,
      blockers: Array.from(new Set(blockers))
    };
  });
  const blockers = Array.from(new Set([
    input.transactions.length ? null : 'wave-dispatch-transactions-required',
    ...waves.flatMap((wave) => wave.blockers)
  ].filter((item): item is string => Boolean(item))));

  return {
    contract: 'bondr-jito-wave-dispatch-plan-v1',
    status: blockers.length ? 'blocked' : 'ready',
    waveCount: waves.length,
    waves,
    blockers,
    safety: {
      noRelaySubmit: true,
      noBroadcast: true,
      noSigning: true,
      explicitApprovalPerWave: true,
      priorWaveReceiptRequiredForOverflow: true
    }
  };
}
