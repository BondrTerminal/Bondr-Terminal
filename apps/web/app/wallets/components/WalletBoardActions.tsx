'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProfileScopedActiveWallet, getProfileScopedWalletRailDraft, setProfileScopedActiveWallet, setProfileScopedWalletRailDraft } from '../../../lib/profile-scoped-browser-state';

type WalletAction = 'phantom' | 'track' | 'send' | 'receive' | 'archive' | 'group' | 'export' | null;
type WalletFilter = 'all' | 'project' | 'global' | 'trading' | 'treasury' | 'archived' | 'deployer' | 'launch' | 'reserve';
type RailPhase = 'dev' | 'bundle' | 'sniper' | 'task' | 'observe';

type BoardWallet = {
  id: string;
  role: string;
  roleBadge: string;
  address: string;
  shortAddress: string;
  groupId: string;
  groupName: string;
  projectName: string | null;
  projectId: string | null;
  status: string;
  scope: string;
  balanceSol: number;
  balanceStatus: string;
  balanceSource: string;
  balanceNote: string;
  tokenCount?: number;
  tokenValueUsd?: number | null;
  tokenStatus?: string;
  purpose: string;
  archived: boolean;
  custodyMode?: 'watch-only' | 'managed-local';
  vaultKeyId?: string | null;
  keyExportedAt?: string | null;
  lastActivity: string;
  lastActivityDetail: string;
};

type BoardGroup = { id: string; name: string; scope: string; walletCount: number; activeCount: number; archivedCount: number; projectNames: string[] };
type ExecutionCapabilities = {
  readiness?: string;
  readinessLevel?: string;
  liveTradingEnabled?: boolean;
  signingEnabled?: boolean;
  broadcastEnabled?: boolean;
  fundingBroadcastEnabled?: boolean;
  walletVaultEnabled?: boolean;
};
type SendBuildResult = {
  status: 'idle' | 'building' | 'built' | 'error';
  message: string;
  rpcProvider?: string;
  requiredSigners?: string[];
  transactionBase64?: string;
};
type LaunchConfigPayload = {
  launchConfig?: {
    walletPlan?: Array<{
      walletId?: string;
      role?: string;
      participate?: boolean;
      executionPhase?: RailPhase;
      plannedBuySol?: number;
      maxBuySol?: number;
      maxSlippageBps?: number;
      takeProfitPercents?: number[];
      stopLossPct?: number;
      trailingStopPct?: number;
      perTxSellCapPct?: number;
      cooldownSeconds?: number;
    }>;
  };
};
type JitoStatus = {
  status?: string;
  relay?: {
    status?: string;
    relayEnabled?: boolean;
    maxTransactionsPerBundle?: number;
    tip?: { maxSol?: number };
    blockers?: string[];
  };
};

type Props = {
  wallets: BoardWallet[];
  groups: BoardGroup[];
  selectedProjectName?: string;
  selectedProjectId?: string;
  selectedGroupId?: string;
  totalSol: number;
  activeCount: number;
  archivedCount: number;
  hydrationStatus: string;
  hydrationProvider: string;
};

function actionTitle(action: WalletAction) {
  if (action === 'phantom') return 'Connect Phantom';
  if (action === 'track') return 'Track address';
  if (action === 'send') return 'Send assets';
  if (action === 'receive') return 'Receive assets';
  if (action === 'archive') return 'Archive / restore';
  if (action === 'group') return 'Manage groups';
  if (action === 'export') return 'Public record';
  return '';
}

function matchesFilter(wallet: BoardWallet, filter: WalletFilter, selectedGroupId?: string) {
  if (filter === 'all') return !wallet.archived;
  if (filter === 'project') return !wallet.archived && (selectedGroupId ? wallet.groupId === selectedGroupId : wallet.scope === 'project');
  if (filter === 'global') return !wallet.archived && wallet.scope === 'global';
  if (filter === 'trading') return !wallet.archived && wallet.roleBadge === 'trading';
  if (filter === 'treasury') return !wallet.archived && wallet.roleBadge === 'treasury';
  if (filter === 'archived') return wallet.archived;
  if (filter === 'deployer') return !wallet.archived && wallet.roleBadge === 'deployer';
  if (filter === 'launch') return !wallet.archived && wallet.roleBadge === 'launch';
  if (filter === 'reserve') return !wallet.archived && wallet.roleBadge === 'reserve';
  return true;
}

function ActionButton({ children, onClick, disabled, title }: { children: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

function walletSolDisplay(wallet?: Pick<BoardWallet, 'balanceSol' | 'balanceStatus'> | null) {
  if (!wallet) return '—';
  if (wallet.balanceStatus !== 'live') return wallet.balanceStatus === 'provider-limited' ? 'provider-limited' : wallet.balanceStatus === 'modeled' ? 'modeled · SOL not live' : 'unavailable';
  return `${wallet.balanceSol.toFixed(4)} SOL`;
}

function railLabel(phase: RailPhase) {
  if (phase === 'dev') return 'Deployer';
  if (phase === 'bundle') return 'Bundle';
  if (phase === 'sniper') return 'Sniper';
  if (phase === 'task') return 'Task';
  return 'Observe';
}

function roleForRail(phase: RailPhase) {
  if (phase === 'dev') return 'dev wallet';
  if (phase === 'bundle') return 'bundle wallet';
  if (phase === 'sniper') return 'sniper wallet';
  if (phase === 'task') return 'task wallet';
  return 'observe wallet';
}

function inferWalletRail(wallet: BoardWallet): RailPhase {
  const role = `${wallet.role} ${wallet.roleBadge} ${wallet.purpose}`.toLowerCase();
  if (/dev|deployer|creator/.test(role)) return 'dev';
  if (/bundle/.test(role)) return 'bundle';
  if (/sniper|snipe/.test(role)) return 'sniper';
  if (/task|automation|worker/.test(role)) return 'task';
  return 'observe';
}

function canWalletSign(wallet: BoardWallet, activeWalletAddress: string) {
  return Boolean(activeWalletAddress && wallet.address === activeWalletAddress);
}

function initialRailDraft(wallets: BoardWallet[]) {
  const active = wallets.filter((wallet) => !wallet.archived);
  const draft: Record<RailPhase, string[]> = { dev: [], bundle: [], sniper: [], task: [], observe: [] };
  for (const wallet of active) {
    const phase = inferWalletRail(wallet);
    if (phase === 'dev' && draft.dev.length) draft.observe.push(wallet.id);
    else draft[phase].push(wallet.id);
  }
  if (!draft.dev.length && active[0]) draft.dev.push(active[0].id);
  return draft;
}

const FUNDING_TEST_SOURCE = '8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz';
const FUNDING_TEST_DESTINATION = '6oaGmdSBmMq7qCAc36cjivzgMVrozQq35ukka4EHGBuy';
const FUNDING_TEST_AMOUNT_SOL = '0.001';

export function WalletBoardActions({ wallets, groups, selectedProjectName, selectedProjectId, selectedGroupId, totalSol, activeCount, archivedCount, hydrationStatus, hydrationProvider }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<WalletFilter>(selectedGroupId ? 'project' : 'all');
  const [action, setAction] = useState<WalletAction>(null);
  const [detailWalletId, setDetailWalletId] = useState<string | null>(null);
  const [fromWalletId, setFromWalletId] = useState(wallets.find((wallet) => !wallet.archived)?.id ?? wallets[0]?.id ?? '');
  const [receiveWalletId, setReceiveWalletId] = useState(wallets.find((wallet) => !wallet.archived)?.id ?? wallets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [receiver, setReceiver] = useState('');
  const [roleInput, setRoleInput] = useState('launch wallet');
  const [addressInput, setAddressInput] = useState('');
  const [purposeInput, setPurposeInput] = useState('Watch-only wallet managed by Bond.Terminal Wallet Ops.');
  const [groupInput, setGroupInput] = useState(selectedGroupId ?? groups[0]?.id ?? '');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [custodyInput, setCustodyInput] = useState<'watch-only' | 'managed-local'>('watch-only');
  const [phantomStatus, setPhantomStatus] = useState<'unknown' | 'available' | 'missing' | 'connected'>('unknown');
  const [phantomAddress, setPhantomAddress] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [activeWalletAddress, setActiveWalletAddress] = useState('');
  const [executionCapabilities, setExecutionCapabilities] = useState<ExecutionCapabilities | null>(null);
  const [jitoStatus, setJitoStatus] = useState<JitoStatus | null>(null);
  const [sendBuildResult, setSendBuildResult] = useState<SendBuildResult>({ status: 'idle', message: 'Load the capped funding test, then build the unsigned transaction.' });
  const [railDraft, setRailDraft] = useState<Record<RailPhase, string[]>>(() => initialRailDraft(wallets));
  const [loading, setLoading] = useState(false);
  const visibleWallets = useMemo(() => wallets.filter((wallet) => matchesFilter(wallet, filter, selectedGroupId)), [wallets, filter, selectedGroupId]);
  const activeWallets = wallets.filter((wallet) => !wallet.archived);
  const fromWallet = wallets.find((wallet) => wallet.id === fromWalletId) ?? activeWallets[0] ?? wallets[0];
  const receiveWallet = wallets.find((wallet) => wallet.id === receiveWalletId) ?? activeWallets[0] ?? wallets[0];
  const detailWallet = detailWalletId ? wallets.find((wallet) => wallet.id === detailWalletId) : null;
  const parsedAmount = Number(amount || '0');
  const remaining = fromWallet ? Math.max(0, fromWallet.balanceSol - (Number.isFinite(parsedAmount) ? parsedAmount : 0)) : 0;
  const deploymentHref = selectedProjectId ? `/deployment?project=${selectedProjectId}` : '/deployment';
  const terminalHref = selectedProjectId ? `/sniper?project=${selectedProjectId}` : '/sniper';
  const portfolioHref = selectedProjectId ? `/portfolio?project=${selectedProjectId}` : '/portfolio';
  const tabs: Array<[WalletFilter, string]> = [['all', 'All'], ['project', 'Project'], ['global', 'Global'], ['trading', 'Trading'], ['treasury', 'Treasury'], ['archived', 'Archived'], ['deployer', 'Deployer'], ['launch', 'Launch'], ['reserve', 'Reserve']];
  const selectedActiveWallet = activeWalletAddress;
  const selectedWallet = wallets.find((wallet) => wallet.address === selectedActiveWallet) ?? null;
  const fundingTestShape = Boolean(fromWallet && fromWallet.address === FUNDING_TEST_SOURCE && receiver === FUNDING_TEST_DESTINATION && amount === FUNDING_TEST_AMOUNT_SOL);
  const fundingGateEnabled = Boolean(executionCapabilities?.fundingBroadcastEnabled);
  const generalBroadcastEnabled = Boolean(executionCapabilities?.broadcastEnabled);
  const bundleWallets = railDraft.bundle.map((id) => wallets.find((wallet) => wallet.id === id)).filter((wallet): wallet is BoardWallet => Boolean(wallet && !wallet.archived));
  const sniperWallets = railDraft.sniper.map((id) => wallets.find((wallet) => wallet.id === id)).filter((wallet): wallet is BoardWallet => Boolean(wallet && !wallet.archived));
  const taskWallets = railDraft.task.map((id) => wallets.find((wallet) => wallet.id === id)).filter((wallet): wallet is BoardWallet => Boolean(wallet && !wallet.archived));
  const devWallet = railDraft.dev.map((id) => wallets.find((wallet) => wallet.id === id)).find((wallet): wallet is BoardWallet => Boolean(wallet && !wallet.archived)) ?? activeWallets[0] ?? null;
  const executableRailWallets = [...(devWallet ? [devWallet] : []), ...bundleWallets, ...sniperWallets, ...taskWallets].filter((wallet, index, rows) => rows.findIndex((row) => row.id === wallet.id) === index);
  const unsignedRailWallets = executableRailWallets.filter((wallet) => !canWalletSign(wallet, selectedActiveWallet));
  const railPlannedSol = executableRailWallets.reduce((sum, wallet) => sum + Math.max(0, wallet.balanceSol || 0), 0);
  const jitoMaxTx = Number(jitoStatus?.relay?.maxTransactionsPerBundle ?? 5);
  const bundleOverLimit = bundleWallets.length > Math.max(0, jitoMaxTx - 1);
  const railGateLabel = executionCapabilities?.broadcastEnabled ? 'broadcast enabled' : 'broadcast closed';
  const railIssueCount = (devWallet ? 0 : 1) + unsignedRailWallets.length + (bundleOverLimit ? 1 : 0);
  const railStatusLabel = railIssueCount ? `${railIssueCount} review` : 'rail ready';
  const selectedDetailWallet = selectedWallet ?? fromWallet ?? activeWallets[0] ?? null;
  const managedWalletCount = wallets.filter((wallet) => wallet.custodyMode === 'managed-local' && !wallet.archived).length;
  const transactionReadinessRows = [
    { label: 'Signer', state: selectedDetailWallet && canWalletSign(selectedDetailWallet, selectedActiveWallet) ? 'pass' : 'review', detail: selectedDetailWallet ? (canWalletSign(selectedDetailWallet, selectedActiveWallet) ? 'Current browser signer matches this wallet.' : 'Select the matching browser signer before building transactions.') : 'Select a wallet before building transactions.' },
    { label: 'Simulation', state: sendBuildResult.status === 'built' ? 'pass' : sendBuildResult.status === 'error' ? 'blocked' : 'review', detail: sendBuildResult.message },
    { label: 'Broadcast', state: generalBroadcastEnabled ? 'review' : 'blocked', detail: generalBroadcastEnabled ? 'General broadcast gate is open; still require explicit action policy.' : 'General broadcast is closed, so Wallet Center cannot live-send arbitrary transfers.' },
    { label: 'Funding test', state: fundingTestShape ? 'pass' : 'review', detail: fundingTestShape ? 'Approved capped transfer shape is loaded.' : 'Only the capped funding test can be built from this surface.' }
  ];
  const walletActivityRows = [...wallets]
    .sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)))
    .slice(0, 6);

  function openAction(nextAction: Exclude<WalletAction, null>) {
    setAddressInput('');
    if (nextAction !== 'send') setSendBuildResult({ status: 'idle', message: 'Load the capped funding test, then build the unsigned transaction.' });
    if (nextAction === 'phantom') {
      setPurposeInput('Browser wallet connected through Phantom. Key stays in Phantom; Bond.Terminal cannot export it.');
      if (typeof window !== 'undefined') {
        const solana = (window as unknown as { solana?: { isPhantom?: boolean; publicKey?: { toBase58?: () => string } } }).solana;
        setPhantomStatus(solana?.isPhantom ? solana.publicKey ? 'connected' : 'available' : 'missing');
        setPhantomAddress(solana?.publicKey?.toBase58?.() ?? '');
      }
    }
    if (nextAction === 'track') {
      setCustodyInput('watch-only');
      setPurposeInput('Watch-only address tracked by Bond.Terminal Wallet Ops.');
    }
    setAction(nextAction);
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setActiveWalletAddress(getProfileScopedActiveWallet());
    const updateActiveWallet = (event: Event) => {
      const detail = (event as CustomEvent<{ address?: string }>).detail;
      setActiveWalletAddress(detail?.address ?? getProfileScopedActiveWallet());
    };
    const updateProfileSubject = () => setActiveWalletAddress(getProfileScopedActiveWallet());
    window.addEventListener('bondr-active-wallet-changed', updateActiveWallet);
    window.addEventListener('bondr-profile-subject-changed', updateProfileSubject);
    return () => {
      window.removeEventListener('bondr-active-wallet-changed', updateActiveWallet);
      window.removeEventListener('bondr-profile-subject-changed', updateProfileSubject);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/relay/jito/status', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json: JitoStatus) => { if (!cancelled) setJitoStatus(json); })
      .catch(() => { if (!cancelled) setJitoStatus({ status: 'unavailable', relay: { status: 'unavailable', relayEnabled: false, blockers: ['relay-status-fetch-failed'] } }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setRailDraft((current) => {
      const activeIds = new Set(wallets.filter((wallet) => !wallet.archived).map((wallet) => wallet.id));
      const next: Record<RailPhase, string[]> = {
        dev: current.dev.filter((id) => activeIds.has(id)).slice(0, 1),
        bundle: current.bundle.filter((id) => activeIds.has(id)),
        sniper: current.sniper.filter((id) => activeIds.has(id)),
        task: current.task.filter((id) => activeIds.has(id)),
        observe: current.observe.filter((id) => activeIds.has(id))
      };
      if (!next.dev.length) return initialRailDraft(wallets);
      return next;
    });
  }, [wallets]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/execution-capabilities', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json: ExecutionCapabilities) => { if (!cancelled) setExecutionCapabilities(json); })
      .catch(() => { if (!cancelled) setExecutionCapabilities({ readiness: 'unavailable' }); });
    return () => { cancelled = true; };
  }, []);

  async function mutate(url: string, init: RequestInit, success: string) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
      const json = await res.json().catch(() => null) as null | { error?: string };
      if (!res.ok) throw new Error(json?.error ?? `Request failed with ${res.status}`);
      setMessage({ type: 'ok', text: success });
      router.refresh();
      return json;
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Wallet operation failed.' });
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function createWatchOnlyWallet(kind: 'created' | 'imported') {
    const result = await mutate('/api/wallets', { method: 'POST', body: JSON.stringify({ role: roleInput, address: addressInput, purpose: purposeInput, groupId: groupInput }) }, kind === 'created' ? 'Watch-only wallet record created.' : 'Watch-only wallet imported.');
    if (result) setAddressInput('');
    return result;
  }

  async function connectPhantom() {
    const solana = typeof window !== 'undefined' ? (window as unknown as { solana?: { isPhantom?: boolean; connect?: () => Promise<{ publicKey?: { toBase58?: () => string } }>; publicKey?: { toBase58?: () => string } } }).solana : undefined;
    if (!solana?.isPhantom || !solana.connect) {
      setPhantomStatus('missing');
      setMessage({ type: 'warn', text: 'Phantom is not detected in this browser. Install/open Phantom, then refresh Wallet Ops.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await solana.connect();
      const address = result.publicKey?.toBase58?.() ?? solana.publicKey?.toBase58?.() ?? '';
      setPhantomAddress(address);
      setPhantomStatus(address ? 'connected' : 'available');
      if (address && typeof window !== 'undefined') {
        setProfileScopedActiveWallet(address);
      }
      setAddressInput(address);
      setMessage({ type: 'ok', text: address ? `Phantom connected and set active: ${address.slice(0, 4)}…${address.slice(-4)}. No transaction signature requested. Use Track Address to save it as watch-only if missing.` : 'Phantom opened. No transaction signature requested.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Phantom connection was rejected.' });
    } finally {
      setLoading(false);
    }
  }

  function updateWallet(walletId: string, patch: Record<string, unknown>, success = 'Wallet updated.') {
    return mutate('/api/wallets', { method: 'PATCH', body: JSON.stringify({ walletId, ...patch }) }, success);
  }

  function createGroup() {
    return mutate('/api/wallet-groups', { method: 'POST', body: JSON.stringify({ name: groupNameInput, scope: 'project' }) }, 'Wallet group created.');
  }

  async function runSendPreflight() {
    if (!fromWallet) return;
    if (!fundingTestShape) {
      const text = 'Only the approved 0.001 SOL funding test shape can be built from Wallet Center. Load the capped funding test before running preflight.';
      setSendBuildResult({ status: 'error', message: text });
      setMessage({ type: 'warn', text });
      return;
    }
    setLoading(true);
    setMessage(null);
    setSendBuildResult({ status: 'building', message: 'Building unsigned funding-test transaction...' });
    try {
      const response = await fetch('/api/wallet-ops-engine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'fund', from: fromWallet.address, to: receiver, amountSol: Number(amount) })
      });
      const json = await response.json().catch(() => null) as null | { error?: string; reason?: string; rpcProvider?: string; requiredSigners?: string[]; transactionBase64?: string };
      if (!response.ok || !json?.transactionBase64) {
        const error = json?.error ?? json?.reason ?? `Unsigned build failed with ${response.status}.`;
        setSendBuildResult({ status: 'error', message: error });
        setMessage({ type: 'error', text: error });
        return;
      }
      setSendBuildResult({
        status: 'built',
        message: 'Unsigned transaction built. Next: use the Terminal signing flow to simulate, sign in browser wallet, then broadcast only when the funding gate is enabled.',
        rpcProvider: json.rpcProvider,
        requiredSigners: json.requiredSigners,
        transactionBase64: json.transactionBase64
      });
      setMessage({ type: 'ok', text: 'Unsigned funding-test transaction built. Continue in Terminal for simulate/sign/broadcast.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unsigned build failed.';
      setSendBuildResult({ status: 'error', message: text });
      setMessage({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  }

  function selectWallet(wallet: BoardWallet) {
    if (typeof window !== 'undefined') {
      setProfileScopedActiveWallet(wallet.address);
      setActiveWalletAddress(wallet.address);
    }
    setFromWalletId(wallet.id);
    setReceiveWalletId(wallet.id);
    setMessage({ type: 'ok', text: `${wallet.role} selected as the active wallet for this browser.` });
  }

  function phaseForWallet(walletId: string): RailPhase {
    if (railDraft.dev.includes(walletId)) return 'dev';
    if (railDraft.bundle.includes(walletId)) return 'bundle';
    if (railDraft.sniper.includes(walletId)) return 'sniper';
    if (railDraft.task.includes(walletId)) return 'task';
    return 'observe';
  }

  function assignWalletRail(walletId: string, phase: RailPhase) {
    setRailDraft((current) => {
      const next: Record<RailPhase, string[]> = {
        dev: current.dev.filter((id) => id !== walletId),
        bundle: current.bundle.filter((id) => id !== walletId),
        sniper: current.sniper.filter((id) => id !== walletId),
        task: current.task.filter((id) => id !== walletId),
        observe: current.observe.filter((id) => id !== walletId)
      };
      if (phase === 'dev') next.dev = [walletId];
      else next[phase] = [...next[phase], walletId];
      return next;
    });
    setMessage({ type: 'ok', text: `Wallet staged for ${railLabel(phase)} rail. Save into Deployment config when the rail set looks right.` });
  }

  function toggleRailSelection(walletId: string, phase: Exclude<RailPhase, 'dev'>) {
    const currentPhase = phaseForWallet(walletId);
    assignWalletRail(walletId, currentPhase === phase ? 'observe' : phase);
  }

  function saveRailDraftToBrowser() {
    if (typeof window === 'undefined') return;
    const payload = { projectId: selectedProjectId ?? null, savedAt: new Date().toISOString(), railDraft };
    setProfileScopedWalletRailDraft(selectedProjectId ?? 'global', JSON.stringify(payload));
    setMessage({ type: 'ok', text: 'Wallet rail draft saved in this browser. No launch config, funding, signing, or broadcast changed.' });
  }

  function loadRailDraftFromBrowser() {
    if (typeof window === 'undefined') return;
    const raw = getProfileScopedWalletRailDraft(selectedProjectId ?? 'global');
    if (!raw) {
      setMessage({ type: 'warn', text: 'No saved wallet rail draft found in this browser.' });
      return;
    }
    try {
      const payload = JSON.parse(raw) as { railDraft?: Record<RailPhase, string[]> };
      if (!payload.railDraft) throw new Error('missing rail draft');
      setRailDraft({
        dev: Array.isArray(payload.railDraft.dev) ? payload.railDraft.dev.slice(0, 1) : [],
        bundle: Array.isArray(payload.railDraft.bundle) ? payload.railDraft.bundle : [],
        sniper: Array.isArray(payload.railDraft.sniper) ? payload.railDraft.sniper : [],
        task: Array.isArray(payload.railDraft.task) ? payload.railDraft.task : [],
        observe: Array.isArray(payload.railDraft.observe) ? payload.railDraft.observe : []
      });
      setMessage({ type: 'ok', text: 'Loaded saved wallet rail draft from this browser.' });
    } catch {
      setMessage({ type: 'error', text: 'Saved wallet rail draft could not be parsed.' });
    }
  }

  function autoSortRailDraft() {
    setRailDraft(initialRailDraft(wallets));
    setMessage({ type: 'ok', text: 'Wallet rails auto-sorted from wallet labels and purposes. Review before staging to Deployment.' });
  }

  function clearRailDraft() {
    const active = wallets.filter((wallet) => !wallet.archived);
    setRailDraft({ dev: active[0] ? [active[0].id] : [], bundle: [], sniper: [], task: [], observe: active.slice(1).map((wallet) => wallet.id) });
    setMessage({ type: 'warn', text: 'Wallet rails reset to one dev candidate and observe-only inventory.' });
  }

  function applyBundlePreset() {
    const active = wallets.filter((wallet) => !wallet.archived);
    const dev = devWallet ?? active[0] ?? null;
    const candidates = active.filter((wallet) => wallet.id !== dev?.id).slice(0, Math.max(0, jitoMaxTx - 1));
    setRailDraft({
      dev: dev ? [dev.id] : [],
      bundle: candidates.map((wallet) => wallet.id),
      sniper: [],
      task: [],
      observe: active.filter((wallet) => wallet.id !== dev?.id && !candidates.some((candidate) => candidate.id === wallet.id)).map((wallet) => wallet.id)
    });
    setMessage({ type: 'ok', text: `Jito bundle rehearsal preset staged with ${candidates.length} bundle wallet(s).` });
  }

  function applySniperPreset() {
    const active = wallets.filter((wallet) => !wallet.archived);
    const dev = devWallet ?? active[0] ?? null;
    const candidates = active.filter((wallet) => wallet.id !== dev?.id).slice(0, 3);
    setRailDraft({
      dev: dev ? [dev.id] : [],
      bundle: [],
      sniper: candidates.map((wallet) => wallet.id),
      task: [],
      observe: active.filter((wallet) => wallet.id !== dev?.id && !candidates.some((candidate) => candidate.id === wallet.id)).map((wallet) => wallet.id)
    });
    setMessage({ type: 'ok', text: `Sniper rehearsal preset staged with ${candidates.length} sniper wallet(s).` });
  }

  async function stageRailIntoDeployment() {
    if (!selectedProjectId) {
      setMessage({ type: 'warn', text: 'Open a project-scoped wallet dashboard before staging rails into Deployment.' });
      return;
    }
    setLoading(true);
    setMessage({ type: 'warn', text: 'Staging wallet rails into Deployment config. This is config-only; no signing, funding, or broadcast.' });
    try {
      const response = await fetch(`/api/projects/${selectedProjectId}/launch-config`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as LaunchConfigPayload | null;
      if (!response.ok) throw new Error('Could not load existing launch config.');
      const existingById = new Map((payload?.launchConfig?.walletPlan ?? []).map((entry) => [entry.walletId, entry]));
      const walletPlan = wallets.map((wallet) => {
        const phase = phaseForWallet(wallet.id);
        const existing = existingById.get(wallet.id) ?? {};
        return {
          ...existing,
          walletId: wallet.id,
          role: roleForRail(phase),
          participate: phase !== 'observe',
          executionPhase: phase,
          plannedBuySol: Number(existing.plannedBuySol ?? 0),
          maxBuySol: Number(existing.maxBuySol ?? existing.plannedBuySol ?? 0),
          maxSlippageBps: Number(existing.maxSlippageBps ?? 100),
          takeProfitPercents: Array.isArray(existing.takeProfitPercents) ? existing.takeProfitPercents : [35, 75, 150],
          stopLossPct: Number(existing.stopLossPct ?? -18),
          trailingStopPct: Number(existing.trailingStopPct ?? 22),
          perTxSellCapPct: Number(existing.perTxSellCapPct ?? 25),
          cooldownSeconds: Number(existing.cooldownSeconds ?? 60)
        };
      });
      const patch = await fetch(`/api/projects/${selectedProjectId}/launch-config`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ launchConfig: { walletPlan } })
      });
      const json = await patch.json().catch(() => null) as null | { error?: string; persisted?: boolean; mode?: string };
      if (!patch.ok) throw new Error(json?.error ?? 'Deployment wallet rail staging failed.');
      setMessage({ type: 'ok', text: `Wallet rails staged into Deployment config (${json?.persisted ? 'persisted' : json?.mode ?? 'accepted'}). Gates remain closed.` });
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Deployment wallet rail staging failed.' });
    } finally {
      setLoading(false);
    }
  }

  function useFundingTest() {
    const source = wallets.find((wallet) => wallet.address === FUNDING_TEST_SOURCE);
    if (source) setFromWalletId(source.id);
    setReceiver(FUNDING_TEST_DESTINATION);
    setAmount(FUNDING_TEST_AMOUNT_SOL);
    setSendBuildResult({ status: 'idle', message: 'Approved 0.001 SOL funding test loaded. Build the unsigned transaction next.' });
    setMessage({ type: 'warn', text: 'Loaded the capped funding test: 0.001 SOL to the approved receiver. Build/simulate/sign/broadcast still require the Live Beta flow and gates.' });
  }

  return (
    <section className="walletBoardShell">
      <header className="walletBoardHeader">
        <div className="walletBoardTitleBlock">
          <span>Bond.Terminal wallet center</span>
          <h1>Portfolio Wallets</h1>
          <p>{selectedProjectName ? `${selectedProjectName} · ${selectedGroupId}` : 'All wallet groups'} · Browser wallets sign in the wallet extension; watch-only records track public addresses; managed-local wallets require encrypted vault backup before funding.</p>
        </div>
        <div className="walletBoardActions walletBoardRouteActions">
          <a href={deploymentHref}>Launch Rail</a>
          <a href={terminalHref}>Terminal</a>
          <a href={portfolioHref}>Portfolio</a>
        </div>
      </header>

      <section className="walletOpsCommandDesk" aria-label="Professional wallet operations dashboard">
        <aside className="walletOpsRailMap">
          <span>Workspace</span>
          <strong>{selectedProjectName ?? 'Global wallet desk'}</strong>
          <div className="walletOpsRailSteps" aria-label="Wallet rail workflow">
            <span className="active">01 Inventory</span>
            <span>02 Assign Rails</span>
            <span>03 Prove Signers</span>
            <span>04 Stage Launch</span>
          </div>
          <p>{railStatusLabel} · {executableRailWallets.length} routed · {railGateLabel}</p>
        </aside>
        <div className="walletOpsPrimaryPanel">
          <div className="walletOpsPanelHeader">
            <div>
              <span>Wallet command surface</span>
              <strong>Organize, configure, and route wallets</strong>
              <small>Use the actions below to track public records, select browser custody, stage launch rails, and move into Deployment without changing live gates.</small>
            </div>
          <div className="walletOpsStatusStack">
            <span>{activeCount} active</span>
            <span>{unsignedRailWallets.length} signer gap(s)</span>
            <span>{bundleOverLimit ? 'bundle over cap' : 'bundle in cap'}</span>
            <span>{jitoStatus?.relay?.relayEnabled ? 'Jito on' : 'Jito off'}</span>
          </div>
          </div>
          <div className="walletOpsActionGrid" aria-label="Wallet action buttons">
            <button type="button" onClick={() => openAction('phantom')}><span>Connect</span><strong>Browser signer</strong><small>Phantom public key only</small></button>
            <button type="button" onClick={() => openAction('track')}><span>Track</span><strong>Public address</strong><small>Watch-only inventory</small></button>
            <button type="button" onClick={() => openAction('send')}><span>Build</span><strong>Funding test</strong><small>unsigned, capped only</small></button>
            <button type="button" onClick={() => openAction('receive')}><span>Receive</span><strong>Deposit view</strong><small>address and Solscan</small></button>
            <button type="button" onClick={() => openAction('group')}><span>Group</span><strong>Wallet sets</strong><small>project and global</small></button>
            <button type="button" onClick={() => openAction('export')}><span>Export</span><strong>Records</strong><small>public metadata</small></button>
          </div>
        </div>
        <aside className="walletOpsConfigPanel">
          <span>Configuration</span>
          <strong>Rail presets</strong>
          <div className="walletOpsConfigButtons">
            <button type="button" onClick={autoSortRailDraft}>Auto Sort</button>
            <button type="button" onClick={applyBundlePreset}>Jito Bundle</button>
            <button type="button" onClick={applySniperPreset}>Sniper Set</button>
            <button type="button" onClick={clearRailDraft}>Observe Only</button>
            <button type="button" onClick={saveRailDraftToBrowser}>Save Draft</button>
            <button type="button" onClick={loadRailDraftFromBrowser}>Load Draft</button>
            <button type="button" onClick={stageRailIntoDeployment} disabled={loading || !selectedProjectId}>{loading ? 'Staging' : 'Stage Config'}</button>
            <a href={deploymentHref}>Open Launch</a>
          </div>
          <div className="walletOpsConfigReadout">
            <div><span>Project group</span><strong>{selectedGroupId ?? 'global'}</strong></div>
            <div><span>Bundle cap</span><strong>{jitoMaxTx} tx</strong></div>
            <div><span>Stage target</span><strong>{selectedProjectId ?? 'none'}</strong></div>
          </div>
        </aside>
      </section>

      <div className="walletBoardMetrics">
        <div><span>Total SOL</span><strong>{totalSol.toFixed(4)}</strong><small>source-labeled balance: live, modeled, or provider-limited</small></div>
        <div><span>Active</span><strong>{activeCount}</strong><small>wallets available</small></div>
        <div><span>Archived</span><strong>{archivedCount}</strong><small>audit retained</small></div>
        <div><span>Hydration</span><strong>{hydrationStatus}</strong><small>{hydrationProvider}</small></div>
        <div><span>Server custody</span><strong>disabled</strong><small>{managedWalletCount ? `${managedWalletCount} legacy managed record(s)` : 'browser/watch-only only'}</small></div>
      </div>

      <div className="walletReadinessRail" aria-label="Wallet readiness">
        <div><span>Selected wallet</span><strong>{selectedWallet ? selectedWallet.shortAddress : 'none'}</strong><small>{selectedWallet ? selectedWallet.role : 'Select a wallet row'}</small></div>
        <div><span>Signer match</span><strong>{fromWallet && selectedActiveWallet === fromWallet.address ? 'matched' : 'review'}</strong><small>{fromWallet ? `Send source ${fromWallet.shortAddress}` : 'No send source'}</small></div>
        <div><span>Signing</span><strong>{executionCapabilities?.signingEnabled ? 'enabled' : 'disabled'}</strong><small>{executionCapabilities?.readinessLevel ?? executionCapabilities?.readiness ?? 'checking readiness'}</small></div>
        <div><span>General broadcast</span><strong>{generalBroadcastEnabled ? 'enabled' : 'disabled'}</strong><small>Broad sends remain policy-gated</small></div>
        <div><span>Funding test</span><strong>{fundingGateEnabled ? 'enabled' : 'disabled'}</strong><small>{fundingTestShape ? 'approved shape loaded' : 'load capped test'}</small></div>
      </div>

      <section className="walletDashboardGrid" aria-label="Wallet operations dashboard">
        <article className="walletDashboardPanel selected">
          <div className="walletDashboardPanelHead">
            <div><span>Selected wallet</span><strong>{selectedDetailWallet ? selectedDetailWallet.role : 'No wallet selected'}</strong></div>
            {selectedDetailWallet ? <button type="button" onClick={() => setDetailWalletId(selectedDetailWallet.id)}>Details</button> : null}
          </div>
          {selectedDetailWallet ? (
            <>
              <div className="walletSelectedAddressRow">
                <code>{selectedDetailWallet.address}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(selectedDetailWallet.address).then(() => setMessage({ type: 'ok', text: 'Wallet address copied.' })).catch(() => setMessage({ type: 'warn', text: 'Copy failed in this browser context.' }))}>Copy</button>
              </div>
              <div className="walletSelectedStats">
                <div><span>SOL</span><strong>{walletSolDisplay(selectedDetailWallet)}</strong></div>
                <div><span>Tokens</span><strong>{selectedDetailWallet.tokenCount ?? 0}</strong><small>{typeof selectedDetailWallet.tokenValueUsd === 'number' ? `$${selectedDetailWallet.tokenValueUsd.toFixed(2)}` : selectedDetailWallet.tokenStatus ?? 'unpriced'}</small></div>
                <div><span>Custody</span><strong>{selectedDetailWallet.custodyMode === 'managed-local' ? 'managed legacy' : 'watch-only'}</strong><small>{selectedDetailWallet.custodyMode === 'managed-local' ? 'server key actions disabled' : 'public record only'}</small></div>
                <div><span>Rail</span><strong>{railLabel(phaseForWallet(selectedDetailWallet.id))}</strong><small>{canWalletSign(selectedDetailWallet, selectedActiveWallet) ? 'signer ready' : 'signer blocked'}</small></div>
              </div>
              <div className="walletSelectedActionRow">
                <button type="button" onClick={() => selectWallet(selectedDetailWallet)}>{selectedActiveWallet === selectedDetailWallet.address ? 'Active signer' : 'Select signer'}</button>
                <button type="button" onClick={() => { setFromWalletId(selectedDetailWallet.id); openAction('send'); }}>Build tx</button>
                <button type="button" onClick={() => { setReceiveWalletId(selectedDetailWallet.id); openAction('receive'); }}>Receive</button>
                <button type="button" onClick={() => { setFromWalletId(selectedDetailWallet.id); openAction('export'); }}>Export record</button>
              </div>
            </>
          ) : <p className="walletDashboardEmpty">Create, track, or select a wallet to unlock transaction prep and launch rail controls.</p>}
        </article>

        <article className="walletDashboardPanel transaction">
          <div className="walletDashboardPanelHead"><div><span>Transaction lanes</span><strong>Prepare, simulate, then gate</strong></div></div>
          <div className="walletActionLaneGrid">
            <div><span>Movement</span><button type="button" onClick={() => openAction('send')}>Send SOL</button><button type="button" disabled>Send SPL</button><button type="button" disabled>Distribute</button><button type="button" disabled>Collect</button></div>
            <div><span>Trading</span><a href={terminalHref}>Open Terminal</a><button type="button" disabled>Buy</button><button type="button" disabled>Sell</button><button type="button" disabled>Swap</button></div>
            <div><span>Safety</span><button type="button" onClick={useFundingTest}>Load capped test</button><button type="button" onClick={runSendPreflight} disabled={loading || !fundingTestShape}>{sendBuildResult.status === 'building' ? 'Building' : 'Build unsigned'}</button><button type="button" onClick={() => setSendBuildResult({ status: 'idle', message: 'Transaction draft cleared. Load the capped funding test, then build the unsigned transaction.' })}>Clear draft</button></div>
            <div><span>Execution</span><a href={terminalHref}>Terminal</a><button type="button" disabled>Sign gated</button><button type="button" disabled>Broadcast gated</button></div>
          </div>
        </article>

        <article className="walletDashboardPanel risk">
          <div className="walletDashboardPanelHead"><div><span>Risk controls</span><strong>Policy visible before action</strong></div></div>
          <div className="walletRiskControlGrid">
            <div><span>Stop loss</span><strong>-18%</strong><small>deployment default</small></div>
            <div><span>Take profit</span><strong>35 / 75 / 150</strong><small>staged per wallet</small></div>
            <div><span>Sell cap</span><strong>25%</strong><small>per transaction</small></div>
            <div><span>Cooldown</span><strong>60s</strong><small>task rail default</small></div>
            <div><span>Slippage</span><strong>100 bps</strong><small>rail default</small></div>
            <div><span>Jito max</span><strong>{jitoMaxTx} tx</strong><small>{bundleOverLimit ? 'bundle over limit' : 'bundle within cap'}</small></div>
            <div><span>Server custody</span><strong>disabled</strong><small>{managedWalletCount ? `${managedWalletCount} legacy managed record(s)` : 'no managed records'}</small></div>
            <div><span>Gate state</span><strong>{railGateLabel}</strong><small>no live wallet mutation by dashboard</small></div>
          </div>
        </article>

        <article className="walletDashboardPanel simulation">
          <div className="walletDashboardPanelHead"><div><span>Simulation</span><strong>{sendBuildResult.status === 'built' ? 'Unsigned build ready' : sendBuildResult.status === 'error' ? 'Blocked' : 'Waiting for draft'}</strong></div></div>
          <div className="walletSimulationRows">
            {transactionReadinessRows.map((row) => <div className={`walletSimulationRow ${row.state}`} key={row.label}><span>{row.label}</span><strong>{row.state}</strong><small>{row.detail}</small></div>)}
          </div>
        </article>

        <article className="walletDashboardPanel activity">
          <div className="walletDashboardPanelHead"><div><span>Activity</span><strong>Recent wallet rows</strong></div><button type="button" onClick={() => router.refresh()}>Refresh</button></div>
          <div className="walletActivityTable">
            <div className="walletActivityTableHead"><span>Wallet</span><span>Rail</span><span>Status</span><span>Last activity</span></div>
            {walletActivityRows.length ? walletActivityRows.map((wallet) => (
              <div className="walletActivityTableRow" key={wallet.id}>
                <strong>{wallet.role}</strong>
                <span>{railLabel(phaseForWallet(wallet.id))}</span>
                <span>{wallet.archived ? 'archived' : wallet.status}</span>
                <small>{wallet.lastActivity} · {wallet.lastActivityDetail}</small>
              </div>
            )) : <p className="walletDashboardEmpty">No wallet records yet.</p>}
          </div>
        </article>
      </section>

      <section className="walletLaunchRailDesk" aria-label="Launch wallet rail">
        <div className="walletLaunchRailHeader">
          <div>
            <span>Launch wallet rail</span>
            <strong>{selectedProjectName ? `${selectedProjectName} routing` : 'Project routing'}</strong>
            <small>Organize wallets into Deployment, Jito bundle, Sniper, Task, and observe rails before launch rehearsal.</small>
          </div>
          <div className="walletLaunchRailActions">
            <button type="button" onClick={saveRailDraftToBrowser}>Save Draft</button>
            <button type="button" onClick={stageRailIntoDeployment} disabled={loading || !selectedProjectId}>{loading ? 'Staging...' : 'Stage To Deployment'}</button>
            <a href={deploymentHref}>Open Launch Rail</a>
          </div>
        </div>
        <div className="walletLaunchRailMetrics">
          <div><span>Deployer</span><strong>{devWallet ? devWallet.shortAddress : 'missing'}</strong><small>{devWallet ? devWallet.role : 'assign one dev wallet'}</small></div>
          <div><span>Bundle</span><strong>{bundleWallets.length}</strong><small>{bundleOverLimit ? `over Jito ${jitoMaxTx} tx limit` : `${Math.max(0, jitoMaxTx - 1)} buy legs available`}</small></div>
          <div><span>Sniper</span><strong>{sniperWallets.length}</strong><small>fast-entry rail selection</small></div>
          <div><span>Task</span><strong>{taskWallets.length}</strong><small>automation queue selection</small></div>
          <div><span>Signer gaps</span><strong>{unsignedRailWallets.length}</strong><small>{unsignedRailWallets.length ? 'watch-only or mismatched' : 'current browser can sign selected rail'}</small></div>
          <div><span>Modeled SOL</span><strong>{railPlannedSol.toFixed(4)}</strong><small>selected rail inventory, not live spend approval</small></div>
          <div><span>Jito</span><strong>{jitoStatus?.relay?.relayEnabled ? 'enabled' : 'disabled'}</strong><small>tip cap {Number(jitoStatus?.relay?.tip?.maxSol ?? 0).toFixed(6)} SOL · {railGateLabel}</small></div>
        </div>
        <div className="walletRailLaneGrid">
          {(['dev', 'bundle', 'sniper', 'task', 'observe'] as RailPhase[]).map((phase) => {
            const laneWallets = (phase === 'dev' ? (devWallet ? [devWallet] : []) : railDraft[phase].map((id) => wallets.find((wallet) => wallet.id === id)).filter((wallet): wallet is BoardWallet => Boolean(wallet && !wallet.archived)));
            return (
              <div className={`walletRailLane ${phase}`} key={phase}>
                <div><span>{railLabel(phase)}</span><strong>{laneWallets.length}</strong><small>{phase === 'bundle' ? 'Jito bundle candidates' : phase === 'dev' ? 'launch authority candidate' : phase === 'observe' ? 'read-only inventory' : `${railLabel(phase)} candidates`}</small></div>
                {laneWallets.length ? laneWallets.slice(0, 5).map((wallet) => <p key={wallet.id}><strong>{wallet.role}</strong><span>{wallet.shortAddress} · {canWalletSign(wallet, selectedActiveWallet) ? 'can sign in current model' : 'signer blocked'}</span></p>) : <em>No wallets assigned</em>}
              </div>
            );
          })}
        </div>
      </section>

      <nav className="walletBoardTabs" aria-label="Wallet board filters">
        {tabs.map(([value, label]) => <button type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{label}</button>)}
      </nav>

      {message && <div className={`walletBoardMessage ${message.type}`}>{message.text}</div>}

      <div className="walletListWrap">
        <div className="walletList" role="table" aria-label="Wallet list">
          <div className="walletListRow walletListHead" role="row">
            <span></span><span>Wallet</span><span>Address</span><span>Balance</span><span>Group</span><span>Activity</span><span>Status</span><span>Actions</span>
          </div>
          {visibleWallets.map((wallet) => {
            const railPhase = phaseForWallet(wallet.id);
            const signerReady = canWalletSign(wallet, selectedActiveWallet);
            return (
            <div className={`walletListRow walletCenterBoxRow walletBoxLayout rail-${railPhase}`} role="row" key={wallet.id} onDoubleClick={() => setDetailWalletId(wallet.id)}>
              <div className="walletBoxLayer walletBoxTopLayer">
                <label className="walletSelectCell"><input type="checkbox" checked={selectedActiveWallet === wallet.address} readOnly title={selectedActiveWallet === wallet.address ? 'Active in this browser' : 'Not active'} /> {selectedActiveWallet === wallet.address ? 'active' : 'selectable'}</label>
                <span className={wallet.archived ? 'statusChip warn' : wallet.status === 'active' ? 'statusChip good' : 'statusChip'}>{wallet.archived ? 'archived' : wallet.status}</span>
                <span className={`walletRailChip ${railPhase}`}>{railLabel(railPhase)}</span>
              </div>
              <div className="walletBoxLayer walletBoxIdentityLayer">
                <button type="button" className="walletIdentityCell" onClick={() => setDetailWalletId(wallet.id)}>
                  <strong>{wallet.role}</strong>
                  <em className={`walletRoleBadge ${wallet.roleBadge}`}>{wallet.roleBadge}</em><em className={`walletCustodyBadge ${wallet.custodyMode === 'managed-local' ? 'managed' : ''}`}>{wallet.custodyMode === 'managed-local' ? 'managed local' : 'watch-only'}</em>
                </button>
                <div className="walletAddressCell" title={wallet.address}><strong>{wallet.shortAddress}</strong><input readOnly value={wallet.address} aria-label={`Copy address ${wallet.role}`} /></div>
              </div>
              <div className="walletBoxLayer walletBoxMetaLayer">
                <div className="walletBalanceCell"><strong>{walletSolDisplay(wallet)}</strong><small title={wallet.balanceNote}>{wallet.balanceStatus === 'provider-limited' ? 'provider-limited' : wallet.balanceStatus === 'modeled' ? 'modeled · not live funds' : wallet.balanceStatus} · {wallet.balanceSource}</small></div>
                <div className="walletGroupCell"><strong>{wallet.groupName}</strong><small>{wallet.custodyMode === 'managed-local' ? 'legacy managed record; key actions disabled' : 'watch-only no key'}</small></div>
                <div className="walletActivityCell"><strong>{wallet.lastActivity}</strong><small>{wallet.lastActivityDetail}</small></div>
                <div className="walletSignerCell"><strong>{signerReady ? 'signer ready' : 'signer blocked'}</strong><small>{wallet.custodyMode === 'managed-local' ? 'select matching browser wallet instead' : selectedActiveWallet === wallet.address ? 'browser signer matches' : 'watch-only or inactive browser signer'}</small></div>
              </div>
              <div className="walletRailAssignLayer">
                <button type="button" className={railPhase === 'dev' ? 'active' : ''} onClick={() => assignWalletRail(wallet.id, 'dev')}>Dev</button>
                <button type="button" className={railPhase === 'bundle' ? 'active' : ''} onClick={() => toggleRailSelection(wallet.id, 'bundle')}>Bundle</button>
                <button type="button" className={railPhase === 'sniper' ? 'active' : ''} onClick={() => toggleRailSelection(wallet.id, 'sniper')}>Sniper</button>
                <button type="button" className={railPhase === 'task' ? 'active' : ''} onClick={() => toggleRailSelection(wallet.id, 'task')}>Task</button>
                <button type="button" className={railPhase === 'observe' ? 'active' : ''} onClick={() => assignWalletRail(wallet.id, 'observe')}>Observe</button>
              </div>
              <div className="walletRowActions">
                <button type="button" onClick={() => { setFromWalletId(wallet.id); openAction('send'); }}>Send</button>
                <button type="button" onClick={() => selectWallet(wallet)}>{selectedActiveWallet === wallet.address ? 'Selected' : 'Select'}</button>
                <button type="button" onClick={() => { setReceiveWalletId(wallet.id); openAction('receive'); }}>Receive</button>
                <button type="button" onClick={() => setDetailWalletId(wallet.id)}>Details</button>
                <button type="button" onClick={() => { setFromWalletId(wallet.id); openAction('export'); }}>Public Record</button>
                <button type="button" onClick={() => updateWallet(wallet.id, { archived: !wallet.archived, archiveReason: wallet.archived ? '' : 'Archived from Wallet Board row action.' }, wallet.archived ? 'Wallet restored.' : 'Wallet archived.')}>{wallet.archived ? 'Restore' : 'Archive'}</button>
                <a href={deploymentHref}>Launch Prep</a><a href={terminalHref}>Terminal</a><a href={portfolioHref}>Portfolio</a>
              </div>
            </div>
          )})}
          {!visibleWallets.length && <div className="walletEmptyState">No wallets match this filter.</div>}
        </div>
      </div>

      {detailWallet && (
        <div className="walletDrawerBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailWalletId(null); }}>
          <aside className="walletDetailDrawer" role="dialog" aria-modal="true" aria-label="Wallet details">
            <div className="walletDrawerHeader"><div><span>Wallet detail</span><h2>{detailWallet.role}</h2></div><button type="button" onClick={() => setDetailWalletId(null)}>×</button></div>
            <div className="walletDrawerAddress"><span>Address</span><strong>{detailWallet.address}</strong><input readOnly value={detailWallet.address} /></div>
            <div className="walletDrawerGrid">
              <div><span>Balance</span><strong>{walletSolDisplay(detailWallet)}</strong></div><div><span>Status</span><strong>{detailWallet.status}</strong></div>
              <div><span>Group</span><strong>{detailWallet.groupName}</strong></div><div><span>Project</span><strong>{detailWallet.projectName ?? 'Unassigned'}</strong></div>
              <div><span>Source</span><strong>{detailWallet.balanceStatus}</strong></div><div><span>Last activity</span><strong>{detailWallet.lastActivity}</strong></div>
            </div>
            <p>{detailWallet.balanceNote}</p>
            <form className="walletDrawerEditForm" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); updateWallet(detailWallet.id, { role: form.get('role'), purpose: form.get('purpose'), status: form.get('status'), groupId: form.get('groupId') }); }}>
              <label><span>Role / label</span><input name="role" defaultValue={detailWallet.role} /></label>
              <label><span>Status</span><input name="status" defaultValue={detailWallet.status} /></label>
              <label><span>Group</span><select name="groupId" defaultValue={detailWallet.groupId}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
              <label><span>Purpose</span><textarea name="purpose" defaultValue={detailWallet.purpose} /></label>
              <button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save safe fields'}</button>
            </form>
            <div className="walletDrawerLinks"><a href={deploymentHref}>Open Deployment</a><a href={terminalHref}>Open Terminal</a><a href={portfolioHref}>View Portfolio</a></div>
            <div className="walletDisabledMutations"><button type="button" onClick={() => selectWallet(detailWallet)}>Select wallet</button><button type="button" onClick={() => updateWallet(detailWallet.id, { archived: !detailWallet.archived, archiveReason: detailWallet.archived ? '' : 'Archived from detail drawer.' }, detailWallet.archived ? 'Wallet restored.' : 'Wallet archived.')}>{detailWallet.archived ? 'Restore wallet' : 'Archive wallet'}</button><button type="button" onClick={() => { setFromWalletId(detailWallet.id); openAction('export'); }}>Export public record</button></div>
          </aside>
        </div>
      )}

      {action && (
        <div className="walletModalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAction(null); }}>
          <section className="walletActionModal" role="dialog" aria-modal="true" aria-label={actionTitle(action)}>
            <div className="walletModalHeader"><div><span>Wallet operation</span><h2>{actionTitle(action)}</h2></div><button type="button" onClick={() => setAction(null)}>×</button></div>
            {action === 'phantom' && (
              <div className="walletScaffoldPanel"><strong>Connect Phantom / browser wallet</strong><p>Use this for normal browser-wallet custody. The private key stays inside Phantom. Connecting sets this browser wallet as active for Terminal. Bond.Terminal can read the public address after connection, but cannot export the key and will require Phantom signatures for future live actions.</p><div className="walletCustodyExplainer"><span>Custody mode</span><strong>Browser wallet</strong><em>Key stays in Phantom · no private-key import · no transaction signature requested</em></div><div className="walletTypeGrid"><div><span>Detection</span><strong>{phantomStatus}</strong><small>{phantomStatus === 'missing' ? 'Install/open Phantom, then refresh.' : phantomStatus === 'connected' ? 'Connected for readiness display only.' : 'Phantom is available in this browser.'}</small></div><div><span>Address</span><strong>{phantomAddress ? `${phantomAddress.slice(0, 4)}…${phantomAddress.slice(-4)}` : 'Not connected'}</strong><small>{phantomAddress || 'No public key shared yet.'}</small></div></div><button className="walletModalPrimary" type="button" onClick={connectPhantom} disabled={loading || phantomStatus === 'missing'}>{loading ? 'Opening Phantom…' : phantomStatus === 'connected' ? 'Reconnect Phantom' : 'Connect Phantom'}</button><p className="walletSecurityFootnote">This flow does not store a private key in Bond.Terminal. Backup/export is handled inside Phantom, not Bond.Terminal Wallet Ops. To make Terminal signer matching easier, save the connected public address with Track Address/watch-only.</p></div>
            )}
            {action === 'send' && fromWallet && (
              <div className="walletModalGrid sendModalGrid">
                <label><span>From wallet</span><select value={fromWallet.id} onChange={(event) => setFromWalletId(event.currentTarget.value)}>{activeWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.role} · {wallet.shortAddress} · {walletSolDisplay(wallet)}</option>)}</select></label>
                <label><span>Asset</span><select value="SOL" disabled><option>SOL</option><option>SPL token support pending</option></select></label>
                <label><span>Amount</span><input value={amount} onChange={(event) => setAmount(event.currentTarget.value)} inputMode="decimal" placeholder="0.001" /></label>
                <div className="walletQuickAmounts"><button type="button" onClick={() => setAmount((fromWallet.balanceSol * 0.25).toFixed(4))}>25%</button><button type="button" onClick={() => setAmount((fromWallet.balanceSol * 0.5).toFixed(4))}>50%</button><button type="button" onClick={() => setAmount(Math.max(0, fromWallet.balanceSol - 0.002).toFixed(4))}>Max</button></div>
                <label className="wide"><span>Receiver address</span><input value={receiver} onChange={(event) => setReceiver(event.currentTarget.value)} placeholder="Solana receiver address" /></label>
                <label className="wide"><span>Memo / note</span><input placeholder="Optional local note" /></label>
                <div className="walletPreflightSummary wide"><strong>Preflight summary</strong><span>From: {fromWallet.role} · {fromWallet.shortAddress}</span><span>To: {receiver || 'Missing receiver address'}</span><span>Amount: {amount || '0'} SOL</span><span>Estimated fee: provider-calculated later</span><span>Remaining balance: {fromWallet.balanceStatus === 'live' ? `${remaining.toFixed(4)} SOL` : fromWallet.balanceStatus === 'modeled' ? 'modeled · not live funds' : 'provider-limited'}</span><span>Signer: {selectedActiveWallet === fromWallet.address ? 'selected wallet matches source' : 'browser selected wallet must match source'}</span><span>Funding gate: {fundingGateEnabled ? 'enabled' : 'disabled'}</span><span>Funding test: {fundingTestShape ? 'approved shape' : 'not approved shape'}</span><em>This Wallet Center only builds the approved funding-test transfer. Arbitrary sends stay disabled until a broader send policy exists.</em></div>
                <button className="walletModalPrimary wide" type="button" onClick={useFundingTest}>Load capped funding test</button>
                <button className="walletModalPrimary wide" type="button" onClick={runSendPreflight} disabled={loading || !fundingTestShape}>{loading ? 'Building unsigned transaction…' : fundingTestShape ? 'Build Funding Test Transaction' : 'Load approved funding test first'}</button>
                <div className={`walletSendResult wide ${sendBuildResult.status}`} aria-live="polite">
                  <strong>{sendBuildResult.status === 'built' ? 'Transaction built' : sendBuildResult.status === 'building' ? 'Building' : sendBuildResult.status === 'error' ? 'Build blocked' : 'Ready'}</strong>
                  <span>{sendBuildResult.message}</span>
                  {sendBuildResult.rpcProvider && <span>RPC provider: {sendBuildResult.rpcProvider}</span>}
                  {sendBuildResult.requiredSigners?.length ? <span>Required signer: {sendBuildResult.requiredSigners.join(', ')}</span> : null}
                  {sendBuildResult.transactionBase64 && <span>Unsigned payload: {sendBuildResult.transactionBase64.length.toLocaleString()} base64 chars</span>}
                  {sendBuildResult.status === 'built' && <a href={terminalHref}>Open Terminal</a>}
                </div>
              </div>
            )}
            {action === 'receive' && receiveWallet && (
              <div className="walletReceivePanel"><label><span>Wallet</span><select value={receiveWallet.id} onChange={(event) => setReceiveWalletId(event.currentTarget.value)}>{activeWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.role} · {wallet.shortAddress}</option>)}</select></label><div className="walletQrPlaceholder">QR</div><div className="walletAddressBlock"><span>Receive address</span><strong>{receiveWallet.address}</strong><input readOnly value={receiveWallet.address} /></div><div className="walletPreflightSummary"><span>Balance: {walletSolDisplay(receiveWallet)}</span><span>Status: {receiveWallet.status}</span><span>Group: {receiveWallet.groupName}</span><em>Only send Solana assets to this address.</em></div><div className="walletDrawerLinks"><a href={`https://solscan.io/account/${receiveWallet.address}`} target="_blank" rel="noreferrer">Solscan</a><a href={portfolioHref}>Portfolio</a><a href={terminalHref}>Terminal</a></div></div>
            )}
            {action === 'group' && <div className="walletScaffoldPanel"><strong>Manage wallet groups</strong><p>Create local wallet groups and review membership. Project assignment remains preserved until explicitly changed elsewhere.</p><div className="walletModalGrid"><label><span>New group name</span><input value={groupNameInput} onChange={(event) => setGroupNameInput(event.currentTarget.value)} placeholder="Launch group" /></label><label><span>Scope</span><input value="project" disabled onChange={() => {}} /></label></div><button className="walletModalPrimary" type="button" disabled={loading || !groupNameInput} onClick={createGroup}>{loading ? 'Creating…' : 'Create group'}</button><div className="walletGroupSummaryList">{groups.map((group) => <div key={group.id}><strong>{group.name}</strong><span>{group.activeCount} active · {group.archivedCount} archived · {group.projectNames.join(', ') || 'unassigned'}</span></div>)}</div></div>}

            {action === 'track' && <div className="walletScaffoldPanel"><strong>Track public address</strong><p>Use this for watch-only monitoring. It stores only a public Solana address and cannot sign, trade, or export a private key.</p><div className="walletCustodyExplainer"><span>Custody mode</span><strong>Watch-only record</strong><em>Public address only · no key material · no recovery export</em></div><div className="walletModalGrid"><label><span>Role / label</span><input value={roleInput} onChange={(event) => setRoleInput(event.currentTarget.value)} placeholder="observed wallet" /></label><label><span>Group</span><select value={groupInput} onChange={(event) => setGroupInput(event.currentTarget.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="wide"><span>Public address</span><input value={addressInput} onChange={(event) => setAddressInput(event.currentTarget.value)} placeholder="Solana public address only" /></label><label className="wide"><span>Purpose</span><input value={purposeInput} onChange={(event) => setPurposeInput(event.currentTarget.value)} /></label></div><button className="walletModalPrimary" type="button" disabled={loading || !addressInput || !groupInput} onClick={() => createWatchOnlyWallet('imported')}>{loading ? 'Saving…' : 'Track watch-only address'}</button></div>}

            {action === 'export' && fromWallet && <div className="walletScaffoldPanel"><strong>Export public wallet record</strong><p>This exports only BONDR tracking metadata. Server-side key custody is disabled; use Phantom/Solflare backup tools for browser-wallet custody.</p><div className="walletPreflightSummary"><span>Wallet: {fromWallet.role}</span><span>Address: {fromWallet.address}</span><span>Custody: {fromWallet.custodyMode ?? 'watch-only'}</span><span>Server custody: disabled</span><em>No key material, seed phrase, vault password, or signing material is included.</em></div><textarea className="walletExportRecord" readOnly value={JSON.stringify({ id: fromWallet.id, role: fromWallet.role, address: fromWallet.address, groupId: fromWallet.groupId, groupName: fromWallet.groupName, status: fromWallet.status, scope: fromWallet.scope, custodyMode: fromWallet.custodyMode ?? 'watch-only', purpose: fromWallet.purpose, archived: fromWallet.archived }, null, 2)} /><button className="walletModalPrimary" type="button" onClick={() => navigator.clipboard?.writeText(JSON.stringify({ id: fromWallet.id, role: fromWallet.role, address: fromWallet.address, groupId: fromWallet.groupId, custodyMode: fromWallet.custodyMode ?? 'watch-only' }, null, 2)).then(() => setMessage({ type: 'ok', text: 'Public wallet record copied.' })).catch(() => setMessage({ type: 'warn', text: 'Copy failed in this browser context.' }))}>Copy public record</button></div>}
            {action === 'archive' && <div className="walletScaffoldPanel"><strong>Archive / restore wallet</strong><p>Select a wallet and toggle archived state. This only changes the local Bond.Terminal record and activity log.</p><label><span>Wallet</span><select value={fromWallet?.id ?? ''} onChange={(event) => setFromWalletId(event.currentTarget.value)}>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.role} · {wallet.shortAddress} · {wallet.archived ? 'archived' : 'active'}</option>)}</select></label>{fromWallet && <button className="walletModalPrimary" type="button" disabled={loading} onClick={() => updateWallet(fromWallet.id, { archived: !fromWallet.archived, archiveReason: fromWallet.archived ? '' : 'Archived from Wallet Ops modal.' }, fromWallet.archived ? 'Wallet restored.' : 'Wallet archived.')}>{fromWallet.archived ? 'Restore wallet' : 'Archive wallet'}</button>}</div>}
          </section>
        </div>
      )}
    </section>
  );
}
