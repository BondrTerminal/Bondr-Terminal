import type { Wallet } from './meridian-store';
import { meridianAuthConfig } from './meridian-auth';
import type { RpcHealthStatus } from './rpc-health';
import { vaultStatus } from './wallet-vault';

export type LiveReadinessCheck = { id: string; label: string; status: 'pass' | 'warn' | 'fail'; evidence: string };

export function walletLiveReadiness(input: { rpc: { configured: boolean; status: RpcHealthStatus; providerLabel: string }; wallets: Wallet[] }) {
  const auth = meridianAuthConfig();
  const vault = vaultStatus();
  const managed = input.wallets.filter((wallet) => wallet.custodyMode === 'managed-local' && !wallet.archived);
  const backedUp = managed.filter((wallet) => Boolean(wallet.keyExportedAt || wallet.keyBackupWarningDismissedAt));
  const checks: LiveReadinessCheck[] = [
    { id: 'dedicated-rpc', label: 'Dedicated RPC configured', status: input.rpc.configured && input.rpc.status === 'live' ? 'pass' : input.rpc.configured ? 'warn' : 'fail', evidence: `${input.rpc.providerLabel} · ${input.rpc.status}` },
    { id: 'session-auth', label: 'Meridian session auth configured', status: auth.configured ? 'pass' : 'fail', evidence: auth.configured ? 'MERIDIAN_SESSION_SECRET + MERIDIAN_OPERATOR_KEY configured' : 'Missing MERIDIAN_SESSION_SECRET and/or MERIDIAN_OPERATOR_KEY' },
    { id: 'vault-available', label: 'Encrypted wallet vault available', status: vault.exists || managed.length === 0 ? 'pass' : 'fail', evidence: vault.exists ? `${vault.managedWalletCount} encrypted key entries` : 'No local vault file yet' },
    { id: 'managed-wallet', label: 'Local custody wallet present', status: managed.length > 0 ? 'pass' : 'fail', evidence: `${managed.length} active managed-local wallet(s). Phantom/browser wallet readiness is checked in the browser UI, not stored server-side.` },
    { id: 'backup-state', label: 'Local wallet backup/export acknowledged', status: managed.length === 0 ? 'pass' : backedUp.length === managed.length ? 'pass' : 'warn', evidence: managed.length === 0 ? 'Not applicable until a managed-local wallet exists' : `${backedUp.length}/${managed.length} active managed wallet(s) backed up or acknowledged` },
    { id: 'live-trading', label: 'Live trading activation', status: process.env.LIVE_TRADING_ENABLED === 'true' ? 'warn' : 'pass', evidence: process.env.LIVE_TRADING_ENABLED === 'true' ? 'LIVE_TRADING_ENABLED=true; final activation review required' : 'LIVE_TRADING_ENABLED is false; signing/broadcasting remains disabled' }
  ];
  const failed = checks.filter((check) => check.status === 'fail').map((check) => check.id);
  const warnings = checks.filter((check) => check.status === 'warn').map((check) => check.id);
  return {
    status: failed.length ? 'blocked' : warnings.length ? 'partial' : 'ready-for-final-activation-review',
    liveTradingAllowed: false,
    checks,
    failed,
    warnings,
    note: 'This readiness object prepares Wallet Ops/Terminal for future live activation only. It does not enable signing, swaps, funding, broadcasts, or launches.'
  };
}
