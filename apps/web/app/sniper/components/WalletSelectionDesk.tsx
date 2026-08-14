'use client';

import { useEffect, useMemo, useState } from 'react';

type TerminalWallet = {
  id: string;
  address: string;
  role: string;
  scope: string;
  balanceSol: number;
  purpose: string;
  balanceStatus?: string;
};

type TerminalBackend = {
  execution?: { liveTradingEnabled?: boolean; orderEngine?: Record<string, string> };
  wallets?: { totalSol?: number; liveBalanceCount?: number; count?: number; rows?: Array<{ id: string; address: string; role: string; solBalance: number; purpose: string; balanceStatus: string }> };
  bundle?: { selectedWalletCount?: number; solAvailable?: number; engineStatus?: string };
};

function walletSolDisplay(wallet?: TerminalWallet | null) {
  if (!wallet) return '—';
  if (wallet.balanceStatus && wallet.balanceStatus !== 'live') return wallet.balanceStatus === 'unavailable' ? 'provider-limited' : wallet.balanceStatus;
  return `${wallet.balanceSol.toFixed(4)} SOL`;
}

export function WalletSelectionDesk({ wallets }: { wallets: TerminalWallet[] }) {
  const [selectedWalletId, setSelectedWalletId] = useState(wallets[0]?.id ?? '');
  const [bundleWalletIds, setBundleWalletIds] = useState(() => wallets.slice(0, Math.min(4, wallets.length)).map((wallet) => wallet.id));
  const [backend, setBackend] = useState<TerminalBackend | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/terminal-backend', { signal: controller.signal, cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setBackend(payload as TerminalBackend | null))
      .catch(() => setBackend(null));
    return () => controller.abort();
  }, []);

  const renderedWallets = backend?.wallets?.rows?.length
    ? backend.wallets.rows.map((wallet) => ({ id: wallet.id, address: wallet.address, role: wallet.role, scope: 'global', balanceSol: wallet.solBalance, purpose: wallet.purpose, balanceStatus: wallet.balanceStatus })) as TerminalWallet[]
    : wallets;
  const selectedWallet = renderedWallets.find((wallet) => wallet.id === selectedWalletId) ?? renderedWallets[0];

  useEffect(() => {
    const stored = window.localStorage.getItem('bondr.activeWallet') ?? '';
    const saved = renderedWallets.find((wallet) => wallet.address === stored);
    if (saved) setSelectedWalletId(saved.id);
    const onActiveWalletChanged = (event: Event) => {
      const address = (event as CustomEvent<{ address?: string }>).detail?.address ?? window.localStorage.getItem('bondr.activeWallet') ?? '';
      const wallet = renderedWallets.find((item) => item.address === address);
      if (wallet) setSelectedWalletId(wallet.id);
    };
    window.addEventListener('bondr-active-wallet-changed', onActiveWalletChanged);
    window.addEventListener('bondr-watch-only-wallet-added', onActiveWalletChanged);
    return () => {
      window.removeEventListener('bondr-active-wallet-changed', onActiveWalletChanged);
      window.removeEventListener('bondr-watch-only-wallet-added', onActiveWalletChanged);
    };
  }, [renderedWallets]);
  const bundleWallets = useMemo(() => renderedWallets.filter((wallet) => bundleWalletIds.includes(wallet.id)), [renderedWallets, bundleWalletIds]);
  const bundleSolAvailable = backend?.bundle?.solAvailable ?? bundleWallets.reduce((sum, wallet) => sum + wallet.balanceSol, 0);
  const bundleEngineStatus = backend?.execution?.orderEngine?.multiWalletBundle ?? backend?.bundle?.engineStatus ?? 'checking';

  function toggleBundleWallet(walletId: string) {
    setBundleWalletIds((current) => current.includes(walletId) ? current.filter((id) => id !== walletId) : [...current, walletId]);
  }

  return (
    <>
      <section className="premiumControlStrip walletSelectionStrip interactiveWalletStrip">
        <div><span>Active wallet</span><strong>{selectedWallet ? selectedWallet.role : 'Not selected'}</strong><small>{selectedWallet ? `${selectedWallet.address.slice(0, 8)}…${selectedWallet.address.slice(-6)} · ${walletSolDisplay(selectedWallet)}` : 'Use connected wallet or pick a saved Wallet Ops public record.'}</small></div>
        <div><span>Multi-select bundle</span><strong>{backend?.bundle?.selectedWalletCount ?? bundleWallets.length} wallet{(backend?.bundle?.selectedWalletCount ?? bundleWallets.length) === 1 ? '' : 's'}</strong><small>{bundleSolAvailable.toFixed(4)} SOL available across selected wallets.</small></div>
        <div><span>Bundle mode</span><strong>{bundleEngineStatus}</strong><small>Multi-wallet readiness.</small></div>
        <div><span>Execution guard</span><strong>{backend?.execution?.liveTradingEnabled ? 'Live enabled' : 'Live gated'}</strong><small>Route builder + browser-wallet signer required.</small></div>
      </section>

      <section className="terminalTablePanel bundlePreviewPanel">
        <div className="tablePanelHeader"><span>Multi-select</span><strong>Selected execution wallets</strong></div>
        <div className="bundlePreviewGrid">
          {bundleWallets.map((wallet, index) => (
            <div className="bundleWalletCard" key={wallet.id}>
              <label><input type="checkbox" checked readOnly /> Wallet {index + 1}</label>
              <strong>{wallet.address.slice(0, 7)}…{wallet.address.slice(-6)}</strong>
              <span>{wallet.role} · {walletSolDisplay(wallet)}</span>
              <small>{bundleEngineStatus}</small>
            </div>
          ))}
          {bundleWallets.length === 0 && <div className="bundleWalletCard emptyBundleCard"><strong>No wallets selected</strong><span>Select wallets below for multi-wallet execution.</span></div>}
        </div>
      </section>

      <section className="terminalTablePanel walletTerminalPanel premiumWalletPanel">
        <div className="tablePanelHeader"><span>Wallet desk</span><strong>Select wallets / balances / actions</strong></div>
        <div className="terminalDataTable walletOpsTable selectableWalletTable" role="table" aria-label="Trading wallets">
          <div className="terminalDataRow terminalDataHead" role="row"><span>Bundle</span><span>Wallet</span><span>Role</span><span>SOL</span><span>Balance source</span><span>Project use</span><span>Actions</span></div>
          {renderedWallets.map((wallet) => {
            const isSelected = selectedWallet?.id === wallet.id;
            const inBundle = bundleWalletIds.includes(wallet.id);
            const backendRow = backend?.wallets?.rows?.find((row) => row.id === wallet.id);
            return (
              <div className={`terminalDataRow ${isSelected ? 'selectedWalletRow' : ''}`} role="row" key={wallet.id}>
                <span><input type="checkbox" checked={inBundle} onChange={() => toggleBundleWallet(wallet.id)} aria-label={`Add ${wallet.role} to bundle`} /></span>
                <strong>{wallet.address.slice(0, 7)}…{wallet.address.slice(-6)}</strong>
                <span>{wallet.role}</span>
                <span>{walletSolDisplay({ ...wallet, balanceStatus: backendRow?.balanceStatus ?? wallet.balanceStatus })}</span>
                <span>{(backendRow?.balanceStatus ?? wallet.balanceStatus ?? 'checking').replace('unavailable', 'provider-limited')}</span>
                <span>{wallet.purpose}</span>
                <div className="terminalRowActions"><button type="button" onClick={() => { setSelectedWalletId(wallet.id); window.localStorage.setItem('bondr.activeWallet', wallet.address); window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address: wallet.address } })); }}>{isSelected ? 'Active' : 'Use active'}</button><button type="button" onClick={() => toggleBundleWallet(wallet.id)}>{inBundle ? 'Remove' : 'Multi'}</button><a href="/portfolio?view=wallets">Wallets</a><a href="/sniper">Open Terminal</a></div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
