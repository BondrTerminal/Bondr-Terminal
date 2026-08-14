'use client';

import { useState } from 'react';

type WalletRow = {
  id?: string;
  role?: string;
  address?: string;
  status?: string;
  purpose?: string;
  custodyMode?: string;
  archived?: boolean;
  solBalance?: number;
  solValueUsd?: number | null;
  balanceStatus?: string;
  tokenCount?: number;
  tokenValueUsd?: number | null;
  tokenStatus?: string;
};

type Props = {
  wallets: WalletRow[];
  projectId: string | null;
};

function shortAddress(address = '') {
  if (!address) return 'No address';
  return `${address.slice(0, 6)}…${address.slice(-5)}`;
}

function custodyLabel(wallet: WalletRow) {
  const mode = String(wallet.custodyMode ?? 'watch-only');
  if (/browser/i.test(mode)) return 'Browser signer';
  if (/managed|generated|local/i.test(mode)) return 'Generated record';
  return 'Watch-only';
}

function solText(wallet: WalletRow) {
  const status = wallet.balanceStatus ?? 'unknown';
  if (typeof wallet.solBalance === 'number') return `${wallet.solBalance.toFixed(5)} SOL · ${status}`;
  return `SOL unavailable · ${status}`;
}

function usdText(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'price unavailable';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

export function PortfolioWalletGrid({ wallets, projectId }: Props) {
  const [message, setMessage] = useState('');

  function exportRecord(wallet: WalletRow) {
    const publicRecord = {
      exportedAt: new Date().toISOString(),
      id: wallet.id,
      role: wallet.role,
      address: wallet.address,
      status: wallet.status,
      purpose: wallet.purpose,
      custodyMode: wallet.custodyMode,
      archived: Boolean(wallet.archived),
      projectId
    };
    const blob = new Blob([JSON.stringify(publicRecord, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bondr-wallet-${wallet.id ?? 'record'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Exported public wallet record. No private key or seed was included.');
  }

  async function setArchived(wallet: WalletRow, archived: boolean) {
    if (!wallet.id) return;
    setMessage(archived ? 'Archiving public wallet record…' : 'Restoring public wallet record…');
    const response = await fetch('/api/wallets', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletId: wallet.id, archived, archiveReason: archived ? 'Archived from Portfolio wallet grid.' : undefined })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.status === 'error') {
      setMessage(payload?.error ?? 'Wallet record update failed.');
      return;
    }
    setMessage(archived ? 'Wallet record archived.' : 'Wallet record restored.');
    window.location.reload();
  }

  const active = wallets.filter((wallet) => !wallet.archived);
  const archived = wallets.filter((wallet) => wallet.archived);

  return (
    <div className="portfolioWalletGridShell">
      <div className="portfolioWalletSummaryBar">
        <div><span>Active records</span><strong>{active.length}</strong><small>Public wallet rows</small></div>
        <div><span>Archived</span><strong>{archived.length}</strong><small>Hidden from active flows</small></div>
        <div><span>Signer model</span><strong>Browser wallet</strong><small>No server signing</small></div>
        <div><span>Generate wallet</span><strong>Coming next</strong><small>Backup/export UX required first</small></div>
      </div>
      {message ? <div className="portfolioWalletNotice">{message}</div> : null}
      <div className="portfolioWalletGrid" aria-label="Portfolio wallet grid">
        {wallets.length ? wallets.map((wallet) => {
          const address = wallet.address ?? '';
          return (
            <article className={`portfolioWalletCard ${wallet.archived ? 'archived' : ''}`} key={wallet.id ?? address}>
              <div className="portfolioWalletCardHead">
                <div><span>{custodyLabel(wallet)}</span><strong>{wallet.role ?? 'Wallet'}</strong><small>{wallet.status ?? 'active'} · {wallet.tokenStatus ?? 'token status unavailable'}</small></div>
                {address ? <a href={`https://solscan.io/account/${address}`} target="_blank" rel="noreferrer">Solscan</a> : null}
              </div>
              <code>{shortAddress(address)}</code>
              <div className="portfolioWalletStats">
                <div><span>SOL balance</span><strong>{solText(wallet)}</strong></div>
                <div><span>SOL value</span><strong>{usdText(wallet.solValueUsd)}</strong></div>
                <div><span>Tokens</span><strong>{wallet.tokenCount ?? 0} tracked</strong></div>
                <div><span>Token value</span><strong>{usdText(wallet.tokenValueUsd)}</strong></div>
              </div>
              <p className="portfolioWalletPurpose">{wallet.purpose ?? 'Public wallet record. Signing remains inside the connected browser wallet.'}</p>
              <div className="portfolioWalletActions">
                {address ? <a href={`/sniper?wallet=${encodeURIComponent(address)}`}>Open Terminal</a> : null}
                <button type="button" onClick={() => exportRecord(wallet)}>Export public record</button>
                <button type="button" onClick={() => void setArchived(wallet, !wallet.archived)}>{wallet.archived ? 'Restore record' : 'Archive record'}</button>
              </div>
            </article>
          );
        }) : <div className="emptyPortfolioState">No wallet records yet. Connect a browser signer, then save the public address as a watch-only record.</div>}
      </div>
    </div>
  );
}
