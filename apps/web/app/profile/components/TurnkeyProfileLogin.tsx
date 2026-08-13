'use client';

import { useState } from 'react';
import { useBondrTurnkeyAccount } from '../../components/TurnkeyAccountProvider';

function shortValue(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
}

function detectBrowserWallet(): string {
  if (typeof window === 'undefined') return 'checking';
  const solana = (window as Window & { solana?: { isPhantom?: boolean } }).solana;
  if (!solana) return 'not detected';
  return solana.isPhantom ? 'Phantom detected' : 'Solana wallet detected';
}

export function TurnkeyProfileLogin() {
  const account = useBondrTurnkeyAccount();
  const [busy, setBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const browserWallet = detectBrowserWallet();

  async function login() {
    setBusy(true);
    try { await account.login(); } finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true);
    try { await account.refresh(); } finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try { await account.logout(); setSyncStatus(''); } finally { setBusy(false); }
  }

  async function syncProfile() {
    if (!account.sessionJwt) {
      setSyncStatus('Turnkey session JWT not exposed by the client SDK yet. Login identity is active, but server profile sync needs the JWT bearer token.');
      return;
    }
    setBusy(true);
    setSyncStatus('Verifying Turnkey JWT and syncing profile…');
    try {
      const response = await fetch('/api/account/profile', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${account.sessionJwt}`
        },
        body: JSON.stringify({
          userId: account.userId ?? undefined,
          userName: account.userName ?? undefined,
          email: account.email ?? undefined,
          organizationId: account.organizationId ?? undefined,
          firstAccountAddress: account.firstAccountAddress ?? undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Profile sync failed: HTTP ${response.status}`);
      setSyncStatus('Verified Turnkey JWT and synced ephemeral server profile.');
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : 'Profile sync failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!account.configured) {
    return (
      <section className="profileGrid accountProfileGrid">
        <div className="documentCard profileCard accountHeroCard">
          <div className="profileAvatar">TK</div>
          <div>
            <div className="eyebrow">Turnkey profile</div>
            <h1>Turnkey login needs configuration</h1>
            <p>Add the public Turnkey organization ID and Auth Proxy config ID in production to enable operator login.</p>
          </div>
          <div className="profileActions">
            <button className="button" type="button" disabled>Turnkey unavailable</button>
          </div>
        </div>

        <div className="documentCard accountGlassCard">
          <h2>Required public env</h2>
          <div className="infoGrid">
            <div className="sideRow"><span>NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID</span><strong>missing</strong></div>
            <div className="sideRow"><span>NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID</span><strong>missing</strong></div>
            <div className="sideRow"><span>Secrets required here</span><strong>none</strong></div>
          </div>
        </div>

        <div className="documentCard accountGlassCard">
          <h2>Configuration rules</h2>
          <ol className="roadmapList">
            <li>Only public Turnkey IDs belong in NEXT_PUBLIC vars.</li>
            <li>No sensitive credentials, provider credentials, or Turnkey secret material should be committed.</li>
            <li>Wallet signing and execution remain gated outside this identity panel.</li>
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section className="profileGrid accountProfileGrid">
      <div className="documentCard profileCard accountHeroCard">
        <div className="accountHeroTopline">
          <div className="profileAvatar">{account.authenticated ? 'TK' : 'B'}</div>
          <span className={account.authenticated ? 'statusChip good' : 'statusChip warn'}>{account.authenticated ? 'connected' : 'identity required'}</span>
        </div>
        <div>
          <div className="eyebrow">Turnkey profile</div>
          <h1>{account.authenticated ? 'Turnkey identity connected' : 'Log in with Turnkey'}</h1>
          <p>Turnkey gives Bond.Terminal a polished operator identity layer. It does not custody server keys, enable managed wallet export, or bypass browser-wallet signing gates.</p>
        </div>
        <div className="profileActions">
          <button className="button" type="button" onClick={() => void login()} disabled={!account.clientReady || account.authenticated || busy}>
            {account.authenticated ? 'Logged in' : account.clientReady ? 'Log in with Turnkey' : 'Loading Turnkey'}
          </button>
          <button className="button secondary" type="button" onClick={() => void refresh()} disabled={!account.clientReady || !account.authenticated || busy}>Refresh profile</button>
          <button className="button secondary" type="button" onClick={() => void syncProfile()} disabled={!account.authenticated || busy}>Verify server profile</button>
          <button className="button secondary" type="button" onClick={() => void logout()} disabled={!account.authenticated || busy}>Log out</button>
        </div>
        {syncStatus && <p className="qaMuted">{syncStatus}</p>}
      </div>

      <div className="documentCard accountGlassCard">
        <h2>Account state</h2>
        <div className="infoGrid">
          <div className="sideRow"><span>Status</span><strong>{account.authenticated ? 'authenticated' : 'not authenticated'}</strong></div>
          <div className="sideRow"><span>Turnkey client</span><strong>{account.clientState}</strong></div>
          <div className="sideRow"><span>User</span><strong>{account.userName ?? shortValue(account.userId)}</strong></div>
          <div className="sideRow"><span>Organization</span><strong>{shortValue(account.organizationId)}</strong></div>
          <div className="sideRow"><span>Embedded wallets</span><strong>{account.walletCount}</strong></div>
          <div className="sideRow"><span>First wallet</span><strong>{shortValue(account.firstWalletId)}</strong></div>
          <div className="sideRow"><span>First account</span><strong>{shortValue(account.firstAccountAddress)}</strong></div>
          <div className="sideRow"><span>Browser wallet</span><strong>{browserWallet}</strong></div>
          <div className="sideRow"><span>Session JWT</span><strong>{account.sessionJwt ? 'available' : 'not exposed'}</strong></div>
          <div className="sideRow"><span>Execution</span><strong>simulation + policy gated</strong></div>
        </div>
        {syncStatus && <p className="qaMuted">{syncStatus}</p>}
      </div>

      <div className="documentCard accountGlassCard">
        <h2>Access model</h2>
        <ol className="roadmapList accountFlowList">
          <li>Turnkey authenticates account identity through Auth Proxy.</li>
          <li>Global nav exposes Axiom-style login without forcing a page-load popup.</li>
          <li>Browser wallets remain the only transaction signing authority.</li>
          <li>Broadcast, funding, deployment, claim, and payout actions remain disabled until a separate approval phase.</li>
        </ol>
      </div>
    </section>
  );
}
