import type { Project, Wallet } from './meridian-store';
import { meridianAuthConfig } from './meridian-auth';
import type { RpcHealthStatus } from './rpc-health';

export type PreLiveChecklistStatus = 'pass' | 'warn' | 'fail';
export type PreLiveChecklistState = 'blocked' | 'partial' | 'ready-for-explicit-live-activation';

export type PreLiveChecklistItem = {
  id: string;
  label: string;
  status: PreLiveChecklistStatus;
  evidence: string;
  owner: 'auth' | 'rpc' | 'wallets' | 'deployment' | 'terminal' | 'safety';
};

export type PreLiveChecklist = {
  contract: 'meridian-pre-live-checklist-v1';
  observedAt: string;
  projectId: string | null;
  projectName: string | null;
  state: PreLiveChecklistState;
  failed: string[];
  warnings: string[];
  items: PreLiveChecklistItem[];
  liveExecutionAllowed: false;
  note: string;
};

type RpcInput = {
  configured: boolean;
  status: RpcHealthStatus;
  providerLabel: string;
  note?: string | null;
  currentSlot?: number | null;
  providerSummary?: string | null;
  configuredProviderCount?: number | null;
  quotaLimited?: boolean;
};

type AuthInput = { configured: boolean; authenticated?: boolean; reason?: string };

type ChecklistInput = {
  project?: Project | null;
  wallets: Wallet[];
  rpc: RpcInput;
  auth?: AuthInput | null;
};

function item(id: string, label: string, status: PreLiveChecklistStatus, evidence: string, owner: PreLiveChecklistItem['owner']): PreLiveChecklistItem {
  return { id, label, status, evidence, owner };
}

function roleIncludes(wallet: Wallet, needle: string) {
  return wallet.role.toLowerCase().includes(needle);
}

function quotaLimited(rpc: RpcInput) {
  const note = `${rpc.note ?? ''}`.toLowerCase();
  return Boolean(rpc.quotaLimited) || (rpc.status === 'provider-limited' && (note.includes('429') || note.includes('quota') || note.includes('max usage')));
}

export function buildPreLiveChecklist(input: ChecklistInput): PreLiveChecklist {
  const authConfig = meridianAuthConfig();
  const auth = input.auth ?? { configured: authConfig.configured, authenticated: false, reason: authConfig.configured ? 'session-not-checked' : 'auth-not-configured' };
  const project = input.project ?? null;
  const activeWallets = input.wallets.filter((wallet) => !wallet.archived);
  const managed = activeWallets.filter((wallet) => wallet.custodyMode === 'managed-local');
  const backedUpManaged = managed.filter((wallet) => Boolean(wallet.keyExportedAt || wallet.keyBackupWarningDismissedAt));
  const watchOnly = activeWallets.filter((wallet) => (wallet.custodyMode ?? 'watch-only') === 'watch-only');
  const tradingWallets = activeWallets.filter((wallet) => roleIncludes(wallet, 'trading') || roleIncludes(wallet, 'sniper') || roleIncludes(wallet, 'launch'));
  const launchConfig = project?.launchConfig;
  const dryRun = project?.preLiveDryRun ?? null;
  const walletPlan = launchConfig?.walletPlan ?? [];
  const participatingPlan = walletPlan.filter((entry) => entry.participate);
  const maxSpendConfigured = participatingPlan.length > 0 && participatingPlan.every((entry) => Number(entry.maxBuySol) > 0 && Number(entry.plannedBuySol) >= 0 && Number(entry.maxBuySol) >= Number(entry.plannedBuySol));
  const slippageConfigured = participatingPlan.length > 0 && participatingPlan.every((entry) => Number(entry.maxSlippageBps) > 0 && Number(entry.maxSlippageBps) <= 3000);
  const riskRulesConfigured = participatingPlan.length > 0 && participatingPlan.every((entry) => Number(entry.stopLossPct) < 0 && entry.takeProfitPercents.length > 0 && Number(entry.perTxSellCapPct) > 0 && Number(entry.perTxSellCapPct) <= 100);
  const rpcQuotaLimited = quotaLimited(input.rpc);
  const liveTradingEnabled = process.env.LIVE_TRADING_ENABLED === 'true';

  const items: PreLiveChecklistItem[] = [
    item('session-authenticated', 'Session authenticated', auth.configured && auth.authenticated ? 'pass' : auth.configured ? 'warn' : 'fail', auth.configured ? auth.authenticated ? 'Valid Meridian operator session is present.' : `Session auth configured but current request is not authenticated (${auth.reason ?? 'unknown'}).` : 'MERIDIAN_SESSION_SECRET and/or MERIDIAN_OPERATOR_KEY missing.', 'auth'),
    item('dedicated-rpc-configured', 'Dedicated RPC configured', input.rpc.configured ? 'pass' : 'fail', input.rpc.configured ? `${input.rpc.configuredProviderCount ?? 1} dedicated provider(s): ${input.rpc.providerSummary ?? input.rpc.providerLabel}.` : 'No dedicated RPC configured; public RPC cannot satisfy pre-live readiness.', 'rpc'),
    item('rpc-health', 'RPC health live or acknowledged', input.rpc.status === 'live' ? 'pass' : rpcQuotaLimited ? 'warn' : input.rpc.configured ? 'warn' : 'fail', input.rpc.status === 'live' ? `${input.rpc.providerLabel} selected and live at slot ${input.rpc.currentSlot ?? 'unknown'}; ${input.rpc.providerSummary ?? 'provider summary unavailable'}.` : rpcQuotaLimited ? `${input.rpc.providerLabel} configured but quota/rate limit hit. Add another dedicated RPC or wait for quota reset; public RPC still does not count.` : input.rpc.configured ? `${input.rpc.providerLabel} selected but health is ${input.rpc.status}; ${input.rpc.providerSummary ?? 'provider summary unavailable'}.` : 'No dedicated RPC health available.', 'rpc'),
    item('wallet-custody', 'Signing-capable wallet custody selected', managed.length > 0 ? 'pass' : 'warn', managed.length > 0 ? `${managed.length} managed-local wallet(s) available for future signing eligibility.` : watchOnly.length > 0 ? `${watchOnly.length} watch-only wallet(s) present; connect Phantom or create/import a managed-local wallet before live signing.` : 'No active project wallet custody path selected.', 'wallets'),
    item('local-wallet-backup', 'Local wallet backup/export complete', managed.length === 0 ? 'warn' : backedUpManaged.length === managed.length ? 'pass' : 'warn', managed.length === 0 ? 'Not applicable unless using Meridian local custody; Phantom backup is handled in Phantom.' : `${backedUpManaged.length}/${managed.length} managed-local wallet(s) backed up or acknowledged.`, 'wallets'),
    item('project-wallet-group', 'Selected project wallet group exists', project && activeWallets.length > 0 ? 'pass' : 'fail', project ? `${activeWallets.length} active wallet(s) attached to ${project.walletGroupId}.` : 'No selected project context.', 'wallets'),
    item('trading-wallet-role', 'Trading/launch wallet role assigned', tradingWallets.length > 0 ? 'pass' : 'fail', tradingWallets.length > 0 ? `${tradingWallets.length} active trading/launch-role wallet(s).` : 'Assign at least one active wallet role containing launch, trading, or sniper.', 'wallets'),
    item('max-spend-caps', 'Max spend caps configured', maxSpendConfigured ? 'pass' : participatingPlan.length ? 'fail' : 'fail', maxSpendConfigured ? `${participatingPlan.length} participating wallet plan(s) have max/planned buy caps.` : 'Configure participating wallet maxBuySol and plannedBuySol in Deployment.', 'deployment'),
    item('slippage-caps', 'Slippage caps configured', slippageConfigured ? 'pass' : 'fail', slippageConfigured ? 'Participating wallet slippage caps are set and bounded.' : 'Configure maxSlippageBps for participating wallets.', 'deployment'),
    item('risk-rules', 'Stop-loss / take-profit rules configured', riskRulesConfigured ? 'pass' : 'fail', riskRulesConfigured ? 'Stop-loss, take-profit ladder, and per-tx sell caps are configured.' : 'Configure stop-loss, take-profit ladder, and per-tx sell cap rules.', 'deployment'),
    item('dry-run-build', 'Dry-run quote/build successful', dryRun?.status === 'pass' ? 'pass' : dryRun?.status === 'fail' ? 'fail' : 'warn', dryRun ? `Last dry-run ${dryRun.status} at ${dryRun.observedAt}; ${dryRun.participatingWalletCount} participating wallet(s), max ${dryRun.totalMaxBuySol.toFixed(3)} SOL.` : 'Not run yet. Required before explicit live activation.', 'terminal'),
    item('live-trading-disabled', 'Live trading still disabled', liveTradingEnabled ? 'fail' : 'pass', liveTradingEnabled ? 'LIVE_TRADING_ENABLED=true; disable until explicit activation ceremony.' : 'LIVE_TRADING_ENABLED is false; signing/broadcasting remains blocked.', 'safety')
  ];

  const failed = items.filter((check) => check.status === 'fail').map((check) => check.id);
  const warnings = items.filter((check) => check.status === 'warn').map((check) => check.id);
  return {
    contract: 'meridian-pre-live-checklist-v1',
    observedAt: new Date().toISOString(),
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    state: failed.length ? 'blocked' : warnings.length ? 'partial' : 'ready-for-explicit-live-activation',
    failed,
    warnings,
    items,
    liveExecutionAllowed: false,
    note: 'Read-only pre-live checklist. It does not sign, swap, fund, broadcast, or launch.'
  };
}
