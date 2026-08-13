'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type WalletAction = 'phantom' | 'create' | 'import' | 'track' | 'send' | 'receive' | 'archive' | 'group' | 'export' | null;
type WalletFilter = 'all' | 'project' | 'global' | 'trading' | 'treasury' | 'archived' | 'deployer' | 'launch' | 'reserve';

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
  purpose: string;
  archived: boolean;
  custodyMode?: 'watch-only' | 'managed-local';
  vaultKeyId?: string | null;
  keyExportedAt?: string | null;
  lastActivity: string;
  lastActivityDetail: string;
};

type BoardGroup = { id: string; name: string; scope: string; walletCount: number; activeCount: number; archivedCount: number; projectNames: string[] };
type CreatedManagedWallet = { id: string; role: string; address: string; custodyMode?: 'managed-local' | 'watch-only'; vaultKeyId?: string | null };

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
  if (action === 'create') return 'Create local wallet';
  if (action === 'import') return 'Import local wallet';
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

const MANAGED_LOCAL_WALLET_BETA_ENABLED = false;

function ActionButton({ children, onClick, disabled, title }: { children: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

function walletSolDisplay(wallet?: Pick<BoardWallet, 'balanceSol' | 'balanceStatus'> | null) {
  if (!wallet) return '—';
  if (wallet.balanceStatus !== 'live') return wallet.balanceStatus === 'provider-limited' ? 'provider-limited' : wallet.balanceStatus === 'modeled' ? 'modeled · SOL not live' : 'unavailable';
  return `${wallet.balanceSol.toFixed(4)} SOL`;
}

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
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [importPreview, setImportPreview] = useState<{ publicKey: string; exists: boolean } | null>(null);
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [vaultPassphraseConfirm, setVaultPassphraseConfirm] = useState('');
  const [exportConfirmation, setExportConfirmation] = useState('');
  const [exportedSecret, setExportedSecret] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [lastManagedWallet, setLastManagedWallet] = useState<CreatedManagedWallet | null>(null);
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

  function openAction(nextAction: Exclude<WalletAction, null>) {
    if (!MANAGED_LOCAL_WALLET_BETA_ENABLED && (nextAction === 'create' || nextAction === 'import')) {
      setMessage({ type: 'warn', text: 'Managed local wallet create/import is disabled for browser-wallet beta. Use Connect Phantom or Track Address/watch-only instead.' });
      setAction(null);
      return;
    }
    setExportedSecret('');
    setExportConfirmation('');
    setPrivateKeyInput('');
    setImportPreview(null);
    setAddressInput('');
    if (nextAction !== 'export') setLastManagedWallet(null);
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
    if (nextAction === 'create' || nextAction === 'import') {
      setCustodyInput('managed-local');
      setPurposeInput(nextAction === 'create' ? 'Local wallet generated and encrypted by Bond.Terminal.' : 'Local wallet imported and encrypted by Bond.Terminal.');
    }
    setAction(nextAction);
  }

  useEffect(() => {
    setExportedSecret('');
    setExportConfirmation('');
    if (action !== 'export') setVaultPassphrase('');
  }, [action, fromWalletId]);

  useEffect(() => {
    if (!exportedSecret) return;
    const timeout = window.setTimeout(() => {
      setExportedSecret('');
      setVaultPassphrase('');
      setExportConfirmation('');
      setMessage({ type: 'warn', text: 'Private key reveal cleared from the page after 60 seconds.' });
    }, 60_000);
    return () => window.clearTimeout(timeout);
  }, [exportedSecret]);

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
        window.localStorage.setItem('bondr.activeWallet', address);
        window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address } }));
      }
      setAddressInput(address);
      setMessage({ type: 'ok', text: address ? `Phantom connected and set active: ${address.slice(0, 4)}…${address.slice(-4)}. No transaction signature requested. Use Track Address to save it as watch-only if missing.` : 'Phantom opened. No transaction signature requested.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Phantom connection was rejected.' });
    } finally {
      setLoading(false);
    }
  }

  async function previewImportPrivateKey() {
    if (!MANAGED_LOCAL_WALLET_BETA_ENABLED) {
      setMessage({ type: 'warn', text: 'Private-key import is disabled for browser-wallet beta.' });
      return null;
    }
    if (!privateKeyInput) return null;
    const result = await mutate('/api/wallet-vault', { method: 'POST', body: JSON.stringify({ action: 'preview-import-private-key', privateKey: privateKeyInput }) }, 'Private key format valid. Review the derived public address before importing.');
    const preview = result && typeof result === 'object' && 'publicKey' in result ? result as { publicKey: string; exists?: boolean } : null;
    if (preview?.publicKey) setImportPreview({ publicKey: preview.publicKey, exists: Boolean(preview.exists) });
    return result;
  }

  async function createManagedWallet(importing: boolean) {
    if (!MANAGED_LOCAL_WALLET_BETA_ENABLED) {
      setMessage({ type: 'warn', text: 'Managed local wallets are disabled for browser-wallet beta. Use Phantom/Solflare plus watch-only public records.' });
      return null;
    }
    if (vaultPassphrase.length < 8) {
      setMessage({ type: 'error', text: 'Bond.Terminal vault password must be at least 8 characters.' });
      return null;
    }
    if (vaultPassphrase !== vaultPassphraseConfirm) {
      setMessage({ type: 'error', text: 'Bond.Terminal vault passwords do not match.' });
      return null;
    }
    const result = await mutate('/api/wallet-vault', {
      method: 'POST',
      body: JSON.stringify({ action: importing ? 'import-managed-wallet' : 'create-managed-wallet', role: roleInput, groupId: groupInput, purpose: purposeInput, vaultPassphrase, privateKey: privateKeyInput })
    }, importing ? 'Wallet imported and encrypted. Back it up before funding.' : 'Wallet created and encrypted. Back it up before funding.');
    const wallet = result && typeof result === 'object' && 'wallet' in result ? (result as { wallet?: CreatedManagedWallet }).wallet : null;
    if (wallet?.id) {
      setLastManagedWallet(wallet);
      setFromWalletId(wallet.id);
      setPrivateKeyInput('');
      setImportPreview(null);
      setVaultPassphraseConfirm('');
      setMessage({ type: 'ok', text: `${importing ? 'Imported' : 'Created'} ${wallet.role}. Next: back up/export the private key before funding.` });
    }
    return result;
  }

  async function exportPrivateKey() {
    if (!MANAGED_LOCAL_WALLET_BETA_ENABLED) {
      setMessage({ type: 'warn', text: 'Private-key export is disabled for browser-wallet beta.' });
      return null;
    }
    if (!fromWallet) return null;
    const result = await mutate('/api/wallet-vault', { method: 'POST', body: JSON.stringify({ action: 'export-private-key', walletId: fromWallet.id, vaultPassphrase, confirmation: exportConfirmation }) }, 'Private key exported. Store it securely.');
    const secret = result && typeof result === 'object' && 'privateKeyBase58' in result ? String((result as { privateKeyBase58: string }).privateKeyBase58) : '';
    if (secret) setExportedSecret(secret);
    return result;
  }

  function updateWallet(walletId: string, patch: Record<string, unknown>, success = 'Wallet updated.') {
    return mutate('/api/wallets', { method: 'PATCH', body: JSON.stringify({ walletId, ...patch }) }, success);
  }

  function createGroup() {
    return mutate('/api/wallet-groups', { method: 'POST', body: JSON.stringify({ name: groupNameInput, scope: 'project' }) }, 'Wallet group created.');
  }

  async function runSendPreflight() {
    if (!fromWallet) return;
    const json = await mutate('/api/wallet-ops-engine', { method: 'POST', body: JSON.stringify({ operation: 'fund', from: fromWallet.address, to: receiver, amountSol: Number(amount) }) }, 'Unsigned transfer built. Browser signing would be required next.');
    if (!json) setMessage((current) => current ?? { type: 'warn', text: 'Live send remains disabled by gate.' });
  }

  return (
    <section className="walletBoardShell">
      <header className="walletBoardHeader">
        <div className="walletBoardTitleBlock">
          <span>Bond.Terminal wallet operations</span>
          <h1>Wallet Operations</h1>
          <p>{selectedProjectName ? `${selectedProjectName} · ${selectedGroupId}` : 'All wallet groups'} · Wallet setup: connect Phantom/browser wallet or track public watch-only records. Real sends/trading/broadcasts stay live-gated; Wallet Ops records do not sign.</p>
        </div>
        <div className="walletBoardActions">
          <ActionButton onClick={() => openAction('phantom')}>Connect Phantom</ActionButton>
          <ActionButton onClick={() => openAction('track')}>Track Address</ActionButton>
          <ActionButton onClick={() => openAction('send')}>Send</ActionButton>
          <ActionButton onClick={() => openAction('receive')}>Receive</ActionButton>
          <ActionButton onClick={() => openAction('archive')}>Archive</ActionButton>
          <ActionButton onClick={() => openAction('export')}>Export Public Record</ActionButton>
          <ActionButton onClick={() => openAction('group')}>Manage Groups</ActionButton>
        </div>
      </header>

      <div className="walletBoardMetrics">
        <div><span>Total SOL</span><strong>{totalSol.toFixed(4)}</strong><small>source-labeled balance: live, modeled, or provider-limited</small></div>
        <div><span>Active</span><strong>{activeCount}</strong><small>wallets available</small></div>
        <div><span>Archived</span><strong>{archivedCount}</strong><small>audit retained</small></div>
        <div><span>Hydration</span><strong>{hydrationStatus}</strong><small>{hydrationProvider}</small></div>
      </div>

      <nav className="walletBoardTabs" aria-label="Wallet board filters">
        {tabs.map(([value, label]) => <button type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{label}</button>)}
      </nav>

      {message && <div className={`walletBoardMessage ${message.type}`}>{message.text}</div>}

      <div className="walletListWrap">
        <div className="walletList" role="table" aria-label="Wallet list">
          <div className="walletListRow walletListHead" role="row">
            <span></span><span>Wallet</span><span>Address</span><span>Balance</span><span>Group</span><span>Activity</span><span>Status</span><span>Actions</span>
          </div>
          {visibleWallets.map((wallet) => (
            <div className="walletListRow" role="row" key={wallet.id} onDoubleClick={() => setDetailWalletId(wallet.id)}>
              <label className="walletSelectCell"><input type="checkbox" disabled title="Selection actions are not wired yet" /></label>
              <button type="button" className="walletIdentityCell" onClick={() => setDetailWalletId(wallet.id)}>
                <strong>{wallet.role}</strong>
                <em className={`walletRoleBadge ${wallet.roleBadge}`}>{wallet.roleBadge}</em><em className={`walletCustodyBadge ${wallet.custodyMode === 'managed-local' ? 'managed' : ''}`}>{wallet.custodyMode === 'managed-local' ? 'managed local' : 'watch-only'}</em>
              </button>
              <div className="walletAddressCell" title={wallet.address}><strong>{wallet.shortAddress}</strong><input readOnly value={wallet.address} aria-label={`Copy address ${wallet.role}`} /></div>
              <div className="walletBalanceCell"><strong>{walletSolDisplay(wallet)}</strong><small title={wallet.balanceNote}>{wallet.balanceStatus === 'provider-limited' ? 'provider-limited' : wallet.balanceStatus === 'modeled' ? 'modeled · not live funds' : wallet.balanceStatus} · {wallet.balanceSource}</small></div>
              <div className="walletGroupCell"><strong>{wallet.groupName}</strong><small>{wallet.custodyMode === 'managed-local' ? wallet.keyExportedAt ? `exported ${wallet.keyExportedAt}` : 'backup needed' : 'watch-only no key'}</small></div>
              <div className="walletActivityCell"><strong>{wallet.lastActivity}</strong><small>{wallet.lastActivityDetail}</small></div>
              <div><span className={wallet.archived ? 'statusChip warn' : wallet.status === 'active' ? 'statusChip good' : 'statusChip'}>{wallet.archived ? 'archived' : wallet.status}</span></div>
              <div className="walletRowActions">
                <button type="button" onClick={() => { setFromWalletId(wallet.id); openAction('send'); }}>Send</button>
                <button type="button" onClick={() => { setReceiveWalletId(wallet.id); openAction('receive'); }}>Receive</button>
                <button type="button" onClick={() => setDetailWalletId(wallet.id)}>Details</button>
                <button type="button" onClick={() => { setFromWalletId(wallet.id); openAction('export'); }}>{wallet.custodyMode === 'managed-local' && MANAGED_LOCAL_WALLET_BETA_ENABLED ? 'Public Record' : 'Public Record'}</button>
                <button type="button" onClick={() => updateWallet(wallet.id, { archived: !wallet.archived, archiveReason: wallet.archived ? '' : 'Archived from Wallet Board row action.' }, wallet.archived ? 'Wallet restored.' : 'Wallet archived.')}>{wallet.archived ? 'Restore' : 'Archive'}</button>
                <a href={deploymentHref}>Launch Prep</a><a href={terminalHref}>Terminal</a><a href={portfolioHref}>Portfolio</a>
              </div>
            </div>
          ))}
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
            <div className="walletDisabledMutations"><button type="button" onClick={() => updateWallet(detailWallet.id, { archived: !detailWallet.archived, archiveReason: detailWallet.archived ? '' : 'Archived from detail drawer.' }, detailWallet.archived ? 'Wallet restored.' : 'Wallet archived.')}>{detailWallet.archived ? 'Restore wallet' : 'Archive wallet'}</button><button type="button" onClick={() => { setFromWalletId(detailWallet.id); openAction('export'); }}>{detailWallet.custodyMode === 'managed-local' && MANAGED_LOCAL_WALLET_BETA_ENABLED ? 'Public record key' : 'Export public record'}</button></div>
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
                <label><span>Amount</span><input value={amount} onChange={(event) => setAmount(event.currentTarget.value)} inputMode="decimal" placeholder="0.00" /></label>
                <div className="walletQuickAmounts"><button type="button" onClick={() => setAmount((fromWallet.balanceSol * 0.25).toFixed(4))}>25%</button><button type="button" onClick={() => setAmount((fromWallet.balanceSol * 0.5).toFixed(4))}>50%</button><button type="button" onClick={() => setAmount(Math.max(0, fromWallet.balanceSol - 0.002).toFixed(4))}>Max</button></div>
                <label className="wide"><span>Receiver address</span><input value={receiver} onChange={(event) => setReceiver(event.currentTarget.value)} placeholder="Solana receiver address" /></label>
                <label className="wide"><span>Memo / note</span><input placeholder="Optional local note" /></label>
                <div className="walletPreflightSummary wide"><strong>Preflight summary</strong><span>From: {fromWallet.role} · {fromWallet.shortAddress}</span><span>To: {receiver || 'Missing receiver address'}</span><span>Amount: {amount || '0'} SOL</span><span>Estimated fee: provider-calculated later</span><span>Remaining balance: {fromWallet.balanceStatus === 'live' ? `${remaining.toFixed(4)} SOL` : fromWallet.balanceStatus === 'modeled' ? 'modeled · not live funds' : 'provider-limited'}</span><span>Signer: browser wallet required</span><span>Live gate: disabled</span><em>Future real send requires live gate, browser-wallet signing, explicit confirmation, and unsigned transaction build.</em></div>
                <button className="walletModalPrimary wide" type="button" onClick={runSendPreflight} disabled={loading || !receiver || !amount}>{loading ? 'Checking…' : 'Run gated unsigned-build check'}</button>
              </div>
            )}
            {action === 'receive' && receiveWallet && (
              <div className="walletReceivePanel"><label><span>Wallet</span><select value={receiveWallet.id} onChange={(event) => setReceiveWalletId(event.currentTarget.value)}>{activeWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.role} · {wallet.shortAddress}</option>)}</select></label><div className="walletQrPlaceholder">QR</div><div className="walletAddressBlock"><span>Receive address</span><strong>{receiveWallet.address}</strong><input readOnly value={receiveWallet.address} /></div><div className="walletPreflightSummary"><span>Balance: {walletSolDisplay(receiveWallet)}</span><span>Status: {receiveWallet.status}</span><span>Group: {receiveWallet.groupName}</span><em>Only send Solana assets to this address.</em></div><div className="walletDrawerLinks"><a href={`https://solscan.io/account/${receiveWallet.address}`} target="_blank" rel="noreferrer">Solscan</a><a href={portfolioHref}>Portfolio</a><a href={terminalHref}>Terminal</a></div></div>
            )}
            {action === 'group' && <div className="walletScaffoldPanel"><strong>Manage wallet groups</strong><p>Create local wallet groups and review membership. Project assignment remains preserved until explicitly changed elsewhere.</p><div className="walletModalGrid"><label><span>New group name</span><input value={groupNameInput} onChange={(event) => setGroupNameInput(event.currentTarget.value)} placeholder="Launch group" /></label><label><span>Scope</span><input value="project" disabled onChange={() => {}} /></label></div><button className="walletModalPrimary" type="button" disabled={loading || !groupNameInput} onClick={createGroup}>{loading ? 'Creating…' : 'Create group'}</button><div className="walletGroupSummaryList">{groups.map((group) => <div key={group.id}><strong>{group.name}</strong><span>{group.activeCount} active · {group.archivedCount} archived · {group.projectNames.join(', ') || 'unassigned'}</span></div>)}</div></div>}
            {['create', 'import'].includes(action) && !MANAGED_LOCAL_WALLET_BETA_ENABLED && <div className="walletScaffoldPanel"><strong>Managed local wallets disabled for beta</strong><p>Browser-wallet beta only supports Phantom/Solflare custody and watch-only public address records. No private-key import, generation, reveal, or vault custody is available in this beta lane.</p><button className="walletModalPrimary" type="button" onClick={() => setAction('phantom')}>Connect Phantom instead</button><button className="walletModalPrimary" type="button" onClick={() => setAction('track')}>Track watch-only address</button></div>}
            {['create', 'import'].includes(action) && MANAGED_LOCAL_WALLET_BETA_ENABLED && <div className="walletScaffoldPanel"><strong>{action === 'create' ? 'Create Local Wallet' : 'Import Local Wallet'}</strong><p>{action === 'create' ? 'Generate a new Solana wallet, encrypt it into Bond.Terminal’s local vault, then immediately back up/export the private key before funding.' : 'Paste an existing Solana private key, preview the derived public address, then encrypt it into Bond.Terminal’s local vault. Public address tracking belongs under Track Address.'}</p><div className="walletCustodyExplainer"><span>Custody mode</span><strong>Managed local vault</strong><em>{action === 'create' ? 'New keypair generated by Bond.Terminal local vault' : 'Existing private key encrypted into Bond.Terminal local vault'} · no signing · no broadcast</em></div><div className="walletModalGrid"><label><span>Wallet name</span><input value={roleInput} onChange={(event) => setRoleInput(event.currentTarget.value)} placeholder="Launch Wallet 01" /></label><label><span>Wallet group</span><select value={groupInput} onChange={(event) => setGroupInput(event.currentTarget.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>{action === 'import' && <><label className="wide"><span>Private key</span><textarea value={privateKeyInput} onChange={(event) => { setPrivateKeyInput(event.currentTarget.value); setImportPreview(null); }} placeholder="Paste base58 Solana private key or JSON byte array. Seed phrases are intentionally not accepted yet." autoComplete="off" /></label><div className="walletImportPreview wide"><button type="button" onClick={previewImportPrivateKey} disabled={loading || !privateKeyInput}>{loading ? 'Checking…' : 'Preview derived address'}</button>{importPreview && <span>{importPreview.exists ? 'Already tracked — cannot import duplicate: ' : 'Derived address: '}{importPreview.publicKey}</span>}</div></>}<label><span>Bond.Terminal vault password</span><input type="password" value={vaultPassphrase} onChange={(event) => setVaultPassphrase(event.currentTarget.value)} autoComplete="new-password" placeholder="8+ characters" /></label><label><span>Confirm Bond.Terminal vault password</span><input type="password" value={vaultPassphraseConfirm} onChange={(event) => setVaultPassphraseConfirm(event.currentTarget.value)} autoComplete="new-password" /></label><label className="wide"><span>Purpose / note</span><input value={purposeInput} onChange={(event) => setPurposeInput(event.currentTarget.value)} /></label></div><button className="walletModalPrimary danger" type="button" disabled={loading || !groupInput || vaultPassphrase.length < 8 || vaultPassphrase !== vaultPassphraseConfirm || (action === 'import' && (!privateKeyInput || !importPreview || importPreview.exists))} onClick={() => createManagedWallet(action === 'import')}>{loading ? 'Encrypting…' : action === 'create' ? 'Create Local Wallet' : 'Import Local Wallet'}</button>{lastManagedWallet && <div className="walletPostCreatePanel"><strong>{lastManagedWallet.role} is in the vault</strong><span>{lastManagedWallet.address}</span><p>Next required step: export/backup the private key before funding this wallet.</p><button className="walletModalPrimary" type="button" onClick={() => { setFromWalletId(lastManagedWallet.id); setAction('export'); }}>Back up this wallet now</button></div>}<p className="walletSecurityFootnote">Bond.Terminal stores no seed phrase and does not sign/broadcast. This password encrypts Bond.Terminal-managed wallets only. Phantom/browser wallets are separate and authorize by signing in the browser.</p></div>}

            {action === 'track' && <div className="walletScaffoldPanel"><strong>Track public address</strong><p>Use this for watch-only monitoring. It stores only a public Solana address and cannot sign, trade, or export a private key.</p><div className="walletCustodyExplainer"><span>Custody mode</span><strong>Watch-only record</strong><em>Public address only · no key material · no recovery export</em></div><div className="walletModalGrid"><label><span>Role / label</span><input value={roleInput} onChange={(event) => setRoleInput(event.currentTarget.value)} placeholder="observed wallet" /></label><label><span>Group</span><select value={groupInput} onChange={(event) => setGroupInput(event.currentTarget.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="wide"><span>Public address</span><input value={addressInput} onChange={(event) => setAddressInput(event.currentTarget.value)} placeholder="Solana public address only" /></label><label className="wide"><span>Purpose</span><input value={purposeInput} onChange={(event) => setPurposeInput(event.currentTarget.value)} /></label></div><button className="walletModalPrimary" type="button" disabled={loading || !addressInput || !groupInput} onClick={() => createWatchOnlyWallet('imported')}>{loading ? 'Saving…' : 'Track watch-only address'}</button></div>}

            {action === 'export' && fromWallet && <div className="walletScaffoldPanel"><strong>{fromWallet.custodyMode === 'managed-local' ? 'Public record managed wallet' : 'Export watch-only record'}</strong><p>{fromWallet.custodyMode === 'managed-local' ? 'This is the recovery path for a managed-local wallet. Unlock the vault, type the exact confirmation, copy the key, then store it somewhere safe before funding.' : 'This wallet is watch-only. Bond.Terminal can export the public tracking record, but there is no private key to recover.'}</p><div className="walletPreflightSummary"><span>Wallet: {fromWallet.role}</span><span>Address: {fromWallet.address}</span><span>Custody: {fromWallet.custodyMode ?? 'watch-only'}</span><span>Backup status: {fromWallet.custodyMode === 'managed-local' ? fromWallet.keyExportedAt ? `exported ${fromWallet.keyExportedAt}` : 'backup needed' : 'watch-only no key'}</span><em>Anyone with a private key controls funds. Phantom cannot authorize export of a Bond.Terminal vault key; this export decrypts the local vault only.</em></div><textarea className="walletExportRecord" readOnly value={JSON.stringify({ id: fromWallet.id, role: fromWallet.role, address: fromWallet.address, groupId: fromWallet.groupId, groupName: fromWallet.groupName, status: fromWallet.status, scope: fromWallet.scope, custodyMode: fromWallet.custodyMode ?? 'watch-only', purpose: fromWallet.purpose, archived: fromWallet.archived }, null, 2)} /><button className="walletModalPrimary" type="button" onClick={() => navigator.clipboard?.writeText(JSON.stringify({ id: fromWallet.id, role: fromWallet.role, address: fromWallet.address, groupId: fromWallet.groupId, custodyMode: fromWallet.custodyMode ?? 'watch-only' }, null, 2)).then(() => setMessage({ type: 'ok', text: 'Public wallet record copied.' })).catch(() => setMessage({ type: 'warn', text: 'Copy failed in this browser context.' }))}>Copy public record</button>{fromWallet.custodyMode === 'managed-local' && MANAGED_LOCAL_WALLET_BETA_ENABLED ? <><label><span>Bond.Terminal vault password</span><input type="password" value={vaultPassphrase} onChange={(event) => setVaultPassphrase(event.currentTarget.value)} autoComplete="off" /></label><label><span>Type confirmation</span><input value={exportConfirmation} onChange={(event) => setExportConfirmation(event.currentTarget.value)} placeholder="EXPORT PRIVATE KEY" /></label><button className="walletModalPrimary danger" type="button" disabled={loading || !vaultPassphrase || exportConfirmation !== 'EXPORT PRIVATE KEY'} onClick={exportPrivateKey}>{loading ? 'Decrypting…' : 'Reveal private key for backup'}</button>{exportedSecret && <div className="walletSecretReveal"><strong>Private key — copy now and store securely</strong><textarea readOnly value={exportedSecret} /><button type="button" onClick={() => navigator.clipboard?.writeText(exportedSecret)}>Copy private key</button><button type="button" onClick={() => { setExportedSecret(''); setVaultPassphrase(''); setExportConfirmation(''); }}>Clear revealed key</button><em>For safety, Bond.Terminal clears this reveal from browser state after 60 seconds or when you close/switch actions.</em></div>}</> : <button className="walletModalPrimary danger" type="button" disabled>{fromWallet.custodyMode === 'managed-local' ? 'Private-key export disabled for browser-wallet beta' : 'No private key: watch-only record'}</button>}</div>}
            {action === 'archive' && <div className="walletScaffoldPanel"><strong>Archive / restore wallet</strong><p>Select a wallet and toggle archived state. This only changes the local Bond.Terminal record and activity log.</p><label><span>Wallet</span><select value={fromWallet?.id ?? ''} onChange={(event) => setFromWalletId(event.currentTarget.value)}>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.role} · {wallet.shortAddress} · {wallet.archived ? 'archived' : 'active'}</option>)}</select></label>{fromWallet && <button className="walletModalPrimary" type="button" disabled={loading} onClick={() => updateWallet(fromWallet.id, { archived: !fromWallet.archived, archiveReason: fromWallet.archived ? '' : 'Archived from Wallet Ops modal.' }, fromWallet.archived ? 'Wallet restored.' : 'Wallet archived.')}>{fromWallet.archived ? 'Restore wallet' : 'Archive wallet'}</button>}</div>}
          </section>
        </div>
      )}
    </section>
  );
}
