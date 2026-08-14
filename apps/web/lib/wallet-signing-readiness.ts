import type { Project, Wallet, WalletPlanEntry } from './meridian-store';

export type WalletSigningReadinessRow = {
  walletId: string;
  phase: NonNullable<WalletPlanEntry['executionPhase']>;
  role: string;
  address: string | null;
  custodyMode: Wallet['custodyMode'] | 'missing';
  signingMode: 'watch-only' | 'browser-signer-required' | 'managed-local-future' | 'unavailable';
  canSignCurrentRail: boolean;
  requiredForBundle: boolean;
  requiredForSniper: boolean;
  requiredForTask: boolean;
  blockers: string[];
};

export type BundleSigningSessionReadiness = {
  status: 'ready-to-request-signatures' | 'blocked' | 'not-required';
  requiredWalletIds: string[];
  signedCount: number;
  missingCount: number;
  blockhashFreshness: 'fresh-required-before-signing';
  expiryRebuildRequirement: 'rebuild-all-unsigned-transactions-after-blockhash-expiry';
  blockers: string[];
};

export type WalletSigningReadiness = {
  contract: 'bondr-wallet-signing-readiness-v1';
  status: 'single-signer-rehearsal' | 'multi-wallet-blocked' | 'multi-wallet-ready' | 'no-wallets';
  rows: WalletSigningReadinessRow[];
  bundleSession: BundleSigningSessionReadiness;
  connectedSignerRequired: boolean;
  serverCustody: false;
  summary: {
    participatingWallets: number;
    executableWallets: number;
    watchOnlyWallets: number;
    bundleWallets: number;
    sniperWallets: number;
    taskWallets: number;
  };
  blockers: string[];
};

function phaseFor(entry: WalletPlanEntry): NonNullable<WalletPlanEntry['executionPhase']> {
  if (entry.executionPhase) return entry.executionPhase;
  const role = entry.role.toLowerCase();
  if (role.includes('dev') || role.includes('creator')) return 'dev';
  if (role.includes('bundle')) return 'bundle';
  if (role.includes('sniper')) return 'sniper';
  if (role.includes('task')) return 'task';
  return 'observe';
}

export function buildWalletSigningReadiness(project: Project, wallets: Wallet[]): WalletSigningReadiness {
  const participating = project.launchConfig?.walletPlan.filter((entry) => entry.participate) ?? [];
  const rows = participating.map((entry): WalletSigningReadinessRow => {
    const wallet = wallets.find((item) => item.id === entry.walletId) ?? null;
    const phase = phaseFor(entry);
    const custodyMode = wallet?.custodyMode ?? 'missing';
    const isWatchOnly = custodyMode === 'watch-only' || custodyMode === 'missing';
    const isManagedLocal = custodyMode === 'managed-local';
    const signingMode: WalletSigningReadinessRow['signingMode'] = !wallet
      ? 'unavailable'
      : isManagedLocal
        ? 'managed-local-future'
        : phase === 'dev'
          ? 'browser-signer-required'
          : 'watch-only';
    const blockers = [
      wallet ? null : 'wallet-record-missing',
      isWatchOnly && phase === 'dev' ? 'browser-signer-not-connected-or-not-proven' : null,
      isWatchOnly && phase !== 'dev' ? 'watch-only-wallet-cannot-sign-execution-leg' : null,
      isManagedLocal ? 'managed-local-signing-policy-not-implemented' : null
    ].filter((item): item is string => Boolean(item));

    return {
      walletId: entry.walletId,
      phase,
      role: entry.role,
      address: wallet?.address ?? null,
      custodyMode,
      signingMode,
      canSignCurrentRail: blockers.length === 0,
      requiredForBundle: phase === 'bundle',
      requiredForSniper: phase === 'sniper',
      requiredForTask: phase === 'task',
      blockers
    };
  });
  const bundleRows = rows.filter((row) => row.requiredForBundle);
  const sessionBlockers = [
    ...bundleRows.flatMap((row) => row.blockers),
    bundleRows.length ? 'signed-transaction-session-not-started' : null,
    bundleRows.length ? 'fresh-blockhash-required-before-signing' : null
  ].filter((item): item is string => Boolean(item));
  const blockers = Array.from(new Set(rows.flatMap((row) => row.blockers)));
  const executableWallets = rows.filter((row) => row.canSignCurrentRail).length;
  const watchOnlyWallets = rows.filter((row) => row.custodyMode === 'watch-only' || row.custodyMode === 'missing').length;
  const hasMultiWalletRail = rows.some((row) => row.phase === 'bundle' || row.phase === 'sniper' || row.phase === 'task');

  return {
    contract: 'bondr-wallet-signing-readiness-v1',
    status: rows.length === 0
      ? 'no-wallets'
      : hasMultiWalletRail
        ? blockers.length ? 'multi-wallet-blocked' : 'multi-wallet-ready'
        : 'single-signer-rehearsal',
    rows,
    bundleSession: {
      status: bundleRows.length ? sessionBlockers.length ? 'blocked' : 'ready-to-request-signatures' : 'not-required',
      requiredWalletIds: bundleRows.map((row) => row.walletId),
      signedCount: 0,
      missingCount: bundleRows.length,
      blockhashFreshness: 'fresh-required-before-signing',
      expiryRebuildRequirement: 'rebuild-all-unsigned-transactions-after-blockhash-expiry',
      blockers: Array.from(new Set(sessionBlockers))
    },
    connectedSignerRequired: rows.some((row) => row.signingMode === 'browser-signer-required'),
    serverCustody: false,
    summary: {
      participatingWallets: rows.length,
      executableWallets,
      watchOnlyWallets,
      bundleWallets: rows.filter((row) => row.phase === 'bundle').length,
      sniperWallets: rows.filter((row) => row.phase === 'sniper').length,
      taskWallets: rows.filter((row) => row.phase === 'task').length
    },
    blockers
  };
}
