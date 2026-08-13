'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string; toString(): string };
  connect?: () => Promise<{ publicKey: { toBase58(): string; toString(): string } }>;
  disconnect?: () => Promise<void>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type WindowWithSolana = Window & { solana?: SolanaProvider };

type WalletRailPayload = {
  status?: string;
  connectedSigner: string | null;
  selectedWallet: string | null;
  activeMint: string | null;
  inventoryMatch: boolean;
  selectedInventoryMatch: boolean;
  inventoryWallet: { id: string; role: string; address: string; custodyMode: string; projectName?: string | null; groupName?: string | null } | null;
  selectedInventoryWallet: { id: string; role: string; address: string; custodyMode: string; projectName?: string | null; groupName?: string | null } | null;
  defaultWatchOnlyGroup?: { id: string; name: string; scope: string } | null;
  walletMode: 'browser-wallet' | 'watch-only' | 'not-connected' | string;
  authState: 'authenticated' | 'required' | 'not-configured' | string;
  solBalance: number | null;
  selectedSolBalance: number | null;
  tokenBalances: Array<{ mint: string; uiAmount: number | null; uiAmountString: string; tokenAccountCount: number; source: string }>;
  selectedTokenBalances: Array<{ mint: string; uiAmount: number | null; uiAmountString: string; tokenAccountCount: number; source: string }>;
  balanceStatus: 'fresh' | 'loading' | 'stale' | 'provider-limited' | 'error' | 'not-connected' | string;
  balanceSource: string;
  balanceNote: string;
  provider: string;
  lastUpdated: string | null;
  blockers: string[];
  warnings: string[];
};

type WalletRailStatusProps = {
  surface?: 'profile' | 'wallets' | 'terminal' | 'live-beta-test' | 'portfolio' | 'deployment';
  selectedWalletAddress?: string | null;
  activeMint?: string | null;
  compact?: boolean;
};

function short(address?: string | null) { return address ? `${address.slice(0, 5)}…${address.slice(-5)}` : '—'; }
function sol(value: number | null | undefined) { return typeof value === 'number' ? `${value.toLocaleString(undefined, { maximumFractionDigits: 5 })} SOL` : '—'; }
function tokenAmount(row?: { uiAmount: number | null; uiAmountString: string; source: string } | null) {
  if (!row) return '—';
  if (row.source === 'provider-limited' || row.uiAmount === null || row.uiAmountString === 'provider-limited') return 'provider-limited';
  return row.uiAmountString;
}

export function WalletRailStatus({ surface = 'profile', selectedWalletAddress = null, activeMint = null, compact = false }: WalletRailStatusProps) {
  const router = useRouter();
  const [providerReady, setProviderReady] = useState(false);
  const [connectedSigner, setConnectedSigner] = useState('');
  const [rail, setRail] = useState<WalletRailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Checking browser wallet and balance rail.');
  const [mutationLoading, setMutationLoading] = useState(false);
  const [activeWallet, setActiveWallet] = useState('');

  const effectiveSelectedWallet = activeWallet || selectedWalletAddress || connectedSigner || '';

  const refresh = useCallback(async (nextSigner = connectedSigner, selectedOverride?: string) => {
    setLoading(true);
    setMessage('Refreshing wallet rail and balances.');
    const params = new URLSearchParams();
    if (nextSigner) params.set('connectedSigner', nextSigner);
    const selectedForRefresh = selectedOverride || activeWallet || selectedWalletAddress || nextSigner || '';
    if (selectedForRefresh) params.set('selectedWallet', selectedForRefresh);
    if (activeMint) params.set('mint', activeMint);
    try {
      const response = await fetch(`/api/wallet-rail?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json() as WalletRailPayload;
      setRail(payload);
      setMessage(payload.status === 'ok' ? 'Wallet rail refreshed.' : 'Wallet rail returned a warning.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wallet rail refresh failed.');
      setRail((current) => current ? { ...current, balanceStatus: 'error', warnings: [...current.warnings, 'Wallet rail refresh failed.'] } : null);
    } finally {
      setLoading(false);
    }
  }, [activeMint, activeWallet, connectedSigner, selectedWalletAddress]);

  useEffect(() => {
    const storedActive = window.localStorage.getItem('bondr.activeWallet') ?? '';
    if (storedActive) setActiveWallet(storedActive);
    const provider = (window as WindowWithSolana).solana;
    setProviderReady(Boolean(provider?.connect));
    const existing = provider?.publicKey?.toBase58?.() ?? provider?.publicKey?.toString?.() ?? '';
    if (existing) setConnectedSigner(existing);
    void refresh(existing);
    const onAccount = (pubkey?: unknown) => {
      const next = typeof pubkey === 'object' && pubkey && 'toBase58' in pubkey && typeof pubkey.toBase58 === 'function' ? pubkey.toBase58() : (window as WindowWithSolana).solana?.publicKey?.toBase58?.() ?? '';
      setConnectedSigner(next);
      void refresh(next);
    };
    const onActiveWalletChanged = (event: Event) => {
      const custom = event as CustomEvent<{ address?: string }>;
      const next = custom.detail?.address ?? window.localStorage.getItem('bondr.activeWallet') ?? '';
      setActiveWallet(next);
      void refresh(connectedSigner || existing, next);
    };
    provider?.on?.('accountChanged', onAccount);
    window.addEventListener('bondr-active-wallet-changed', onActiveWalletChanged);
    return () => {
      provider?.off?.('accountChanged', onAccount);
      window.removeEventListener('bondr-active-wallet-changed', onActiveWalletChanged);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    if (!(window as WindowWithSolana).solana?.connect) { setMessage('Connect a Solana browser wallet.'); return; }
    try {
      const result = await (window as WindowWithSolana).solana!.connect!();
      const next = result.publicKey.toBase58?.() ?? result.publicKey.toString();
      setConnectedSigner(next);
      window.localStorage.setItem('bondr.activeWallet', next);
      setActiveWallet(next);
      window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address: next } }));
      await refresh(next, next);
      setMessage('Browser wallet connected and set as active wallet for this browser.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wallet connection rejected.');
    }
  }

  async function addConnectedSignerAsWatchOnly() {
    if (!connectedSigner) { setMessage('Connect a Solana browser wallet.'); return; }
    const groupId = rail?.defaultWatchOnlyGroup?.id;
    if (!groupId) { setMessage('No Wallet Ops group is available for watch-only add.'); return; }
    setMutationLoading(true);
    setMessage('Adding connected signer as watch-only wallet.');
    try {
      const response = await fetch('/api/wallets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: connectedSigner,
          role: 'browser signer watch-only',
          groupId,
          purpose: 'Watch-only public address for A-profile browser-wallet matching and balance display.',
          status: 'active'
        })
      });
      const payload = await response.json().catch(() => null) as { error?: string; note?: string; mutationMode?: string; persisted?: boolean; alreadyExisted?: boolean } | null;
      if (!response.ok) throw new Error(`${payload?.error ?? 'Watch-only wallet add failed.'} HTTP ${response.status}.`);
      window.localStorage.setItem('bondr.activeWallet', connectedSigner);
      setActiveWallet(connectedSigner);
      window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address: connectedSigner } }));
      window.dispatchEvent(new CustomEvent('bondr-watch-only-wallet-added', { detail: { address: connectedSigner } }));
      setMessage(`${payload?.alreadyExisted ? 'Watch-only wallet already existed' : 'Watch-only wallet added'} and selected for this browser. ${payload?.mutationMode ? `Storage=${payload.mutationMode} persisted=${Boolean(payload.persisted)}. ` : ''}Browser wallet still signs; Wallet Ops only stores the public address.`);
      router.refresh();
      await refresh(connectedSigner, connectedSigner);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Watch-only wallet add failed.');
    } finally {
      setMutationLoading(false);
    }
  }

  function useConnectedAsActive() {
    if (!connectedSigner) { setMessage('Connect a Solana browser wallet first.'); return; }
    window.localStorage.setItem('bondr.activeWallet', connectedSigner);
    setActiveWallet(connectedSigner);
    window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address: connectedSigner } }));
    setMessage('Connected browser wallet is now the active wallet for this browser.');
    void refresh(connectedSigner);
  }

  async function disconnect() {
    await (window as WindowWithSolana).solana?.disconnect?.().catch(() => undefined);
    setConnectedSigner('');
    await refresh('');
    setMessage('Browser wallet disconnected.');
  }

  const warnings = rail?.warnings ?? [];
  const blockers = rail?.blockers ?? [];
  const connectedToken = rail?.tokenBalances?.[0] ?? null;
  const selectedToken = rail?.selectedTokenBalances?.[0] ?? null;
  const railLoaded = Boolean(rail);
  const connectedInventoryLabel = rail?.inventoryWallet
    ? `${rail.inventoryWallet.role} · ${rail.inventoryWallet.custodyMode}`
    : connectedSigner
      ? railLoaded ? 'not in Wallet Ops' : 'checking Wallet Ops'
      : 'not connected';
  const selectedInventoryLabel = rail?.selectedInventoryWallet
    ? `${rail.selectedInventoryWallet.role} · ${rail.selectedInventoryWallet.custodyMode}`
    : effectiveSelectedWallet
      ? railLoaded ? 'not in Wallet Ops' : 'checking Wallet Ops'
      : 'not selected';
  const connectedInventoryDetail = rail?.inventoryMatch
    ? 'Connected signer is in Wallet Ops.'
    : connectedSigner
      ? railLoaded ? 'Connected signer is not in Wallet Ops.' : 'Checking connected signer against Wallet Ops.'
      : 'Browser wallet not connected in this tab.';
  const selectedInventoryDetail = rail?.selectedInventoryMatch
    ? 'Selected wallet is saved in Wallet Ops.'
    : effectiveSelectedWallet
      ? railLoaded ? 'Selected wallet not matched to inventory. If this is your connected signer, add it as watch-only to save the public record.' : 'Checking selected wallet against Wallet Ops.'
      : 'No selected wallet for this browser/page.';
  const title = surface === 'terminal' ? 'Terminal wallet rail' : surface === 'live-beta-test' ? 'Live Beta wallet rail' : surface === 'deployment' ? 'Deployment wallet rail' : surface === 'portfolio' ? 'Portfolio wallet rail' : surface === 'wallets' ? 'Wallet Ops wallet rail' : 'Profile wallet rail';
  const badge = connectedSigner ? 'Browser wallet connected' : providerReady ? 'Provider ready' : 'Connect browser wallet';

  const rows = useMemo(() => [
    ['Connected signer', short(connectedSigner), connectedSigner ? 'Browser wallet connected in this tab.' : 'Browser wallet not connected in this tab.'],
    ['Selected wallet', short(effectiveSelectedWallet), effectiveSelectedWallet ? 'Active/project wallet used for matching.' : 'No selected wallet for this browser/page.'],
    ['Wallet Ops inventory', connectedInventoryLabel, connectedInventoryDetail],
    ['Selected inventory', selectedInventoryLabel, selectedInventoryDetail],
    ['Connected SOL balance', sol(rail?.solBalance), rail?.balanceStatus === 'provider-limited' ? 'Balance provider-limited; wallet may still have funds.' : rail?.balanceNote ?? 'Balance not loaded.'],
    ['Selected SOL balance', sol(rail?.selectedSolBalance), rail?.balanceStatus === 'provider-limited' ? 'Balance provider-limited; wallet may still have funds.' : effectiveSelectedWallet === connectedSigner ? 'Same as connected signer.' : 'Selected wallet read.'],
    ['Token balance', tokenAmount(connectedToken), activeMint ? `Connected signer token balance for ${short(activeMint)}.` : 'No active mint supplied.'],
    ['Selected token balance', tokenAmount(selectedToken), activeMint ? `Selected wallet token balance for ${short(activeMint)}.` : 'No active mint supplied.'],
    ['Balance status', rail?.balanceStatus ?? (loading ? 'loading' : 'not-connected'), rail?.balanceStatus === 'provider-limited' ? 'Balance provider-limited; wallet may still have funds.' : rail?.balanceSource ?? 'wallet-rail'],
    ['Last refreshed', rail?.lastUpdated ? new Date(rail.lastUpdated).toLocaleTimeString() : '—', rail?.lastUpdated ?? 'Not refreshed yet.'],
    ['Auth state', rail?.authState ?? 'checking', 'Operator auth state for A-profile.'],
    ['Wallet mode', rail?.walletMode ?? 'checking', connectedSigner ? 'A-profile primary mode is browser-wallet.' : 'No signer connected.'],
    ['Active wallet', short(effectiveSelectedWallet), effectiveSelectedWallet ? 'Used by this browser for Terminal/Deployment selection.' : 'Use connected wallet to set active wallet.']
  ], [activeMint, connectedInventoryLabel, connectedSigner, connectedToken, effectiveSelectedWallet, loading, rail, selectedInventoryDetail, selectedInventoryLabel, selectedToken]);

  return (
    <section className={`walletRailStatusCard ${compact ? 'compactWalletRail' : ''}`} aria-label={`${title} status`}>
      <div className="walletRailHeader">
        <div><span>{title}</span><strong>{badge}</strong><small>{message}</small></div>
        <div className="walletRailActions">
          <button className="button secondary" type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh balances'}</button>
          <button className="button secondary" type="button" onClick={() => void connect()} disabled={!providerReady}>{connectedSigner ? 'Reconnect wallet' : 'Connect wallet'}</button>
          <button className="button secondary" type="button" onClick={useConnectedAsActive} disabled={!connectedSigner}>Use connected wallet</button>
          <button className="button secondary" type="button" onClick={() => void disconnect()} disabled={!connectedSigner}>Disconnect</button>
        </div>
      </div>
      <div className="walletRailHelperCopy">
        <strong>Add connected signer as watch-only wallet</strong>
        <p>Watch-only adds the public address for matching and balance display. Browser wallet still signs; no private key, funding, fund movement, deployment, claims, or broadcast is created.</p>
      </div>
      <div className="walletRailGrid">
        {rows.map(([label, value, detail]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}
      </div>
      {connectedSigner && !rail?.inventoryMatch && <div className="walletRailWatchOnlyCta">
        <strong>Add connected signer as watch-only wallet</strong>
        <p>Watch-only adds the public address for matching and balance display. Browser wallet still signs; no private key, funding, fund movement, deployment, claims, or broadcast is created.</p>
        <button className="button secondary" type="button" onClick={() => void addConnectedSignerAsWatchOnly()} disabled={mutationLoading}>{mutationLoading ? 'Adding…' : 'Add connected signer as watch-only wallet'}</button>
      </div>}
      {(warnings.length > 0 || blockers.length > 0) && <div className="walletRailNotice">
        {blockers.map((item) => <p key={item}><strong>Blocked:</strong> {item}</p>)}
        {warnings.map((item) => <p key={item}><strong>Note:</strong> {item}</p>)}
      </div>}
      <p className="walletRailFooter">Broadcast disabled in A-profile. This rail reads balances and signer state only; it never requests private keys, server-signs, funds wallets, deploys, claims, or broadcasts.</p>
    </section>
  );
}
