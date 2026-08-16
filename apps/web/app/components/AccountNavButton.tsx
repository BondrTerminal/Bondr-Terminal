'use client';

import { useState } from 'react';
import { useBondrTurnkeyAccount } from './TurnkeyAccountProvider';

function shortValue(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
}

export function AccountNavButton() {
  const account = useBondrTurnkeyAccount();
  const [busy, setBusy] = useState(false);
  const label = !account.configured
    ? 'Account setup'
    : account.authenticated
      ? (account.userName || shortValue(account.userId) || 'Account')
      : 'Log in';
  const status = !account.configured ? 'Turnkey missing' : account.authenticated ? 'Turnkey connected' : account.clientReady ? 'Identity required' : 'Loading Turnkey';

  async function login() {
    if (!account.configured || !account.clientReady || account.authenticated) return;
    setBusy(true);
    try { await account.login(); } finally { setBusy(false); }
  }

  async function logout() {
    if (!account.authenticated) return;
    setBusy(true);
    try { await account.logout(); } finally { setBusy(false); }
  }

  return (
    <details className="accountNavMenu">
      <summary className={account.authenticated ? 'accountNavSummary authenticated' : ''}>
        <span className="accountNavOrb">{account.authenticated ? 'TK' : 'B'}</span>
        <span><strong>{label}</strong><em>{status}</em></span>
      </summary>
      <div className="accountNavPanel">
        <div className="accountNavPanelHead">
          <span>{account.authenticated ? 'Operator identity' : 'Bondr.terminal account'}</span>
          <strong>{account.authenticated ? 'Connected' : account.configured ? 'Ready to log in' : 'Configuration needed'}</strong>
        </div>
        <div className="accountNavMeta">
          <div><span>User</span><strong>{account.userName ?? shortValue(account.userId)}</strong></div>
          <div><span>Embedded wallets</span><strong>{account.walletCount}</strong></div>
          <div><span>First account</span><strong>{shortValue(account.firstAccountAddress)}</strong></div>
        </div>
        <p>{account.authenticated ? 'Identity is active. Execution still requires browser-wallet signing, simulation, and policy checks.' : 'BONDR is gated. Log in with Turnkey to unlock the operator terminal.'}</p>
        <div className="accountNavActions">
          <button type="button" onClick={() => void login()} disabled={!account.configured || !account.clientReady || account.authenticated || busy}>{account.authenticated ? 'Logged in' : 'Log in with Turnkey'}</button>
          <a href="/profile">Profile</a>
          <button type="button" onClick={() => void logout()} disabled={!account.authenticated || busy}>Log out</button>
        </div>
      </div>
    </details>
  );
}
