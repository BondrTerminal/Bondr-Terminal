'use client';

import { useEffect, useMemo, useState } from 'react';
import { avatarInitials, type BondrStoredProfile } from '../../../lib/bondr-profile';
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

type ProfileForm = {
  userName: string;
  displayName: string;
  bio: string;
  preferredWalletLabel: string;
};

export function TurnkeyProfileLogin() {
  const account = useBondrTurnkeyAccount();
  const [busy, setBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [profile, setProfile] = useState<BondrStoredProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>({ userName: '', displayName: '', bio: '', preferredWalletLabel: '' });
  const browserWallet = detectBrowserWallet();

  const initials = useMemo(() => profile ? avatarInitials(profile) : 'B', [profile]);

  async function requestProfile(method: 'GET' | 'POST', payload?: Record<string, unknown>) {
    if (!account.sessionJwt) throw new Error('Turnkey session JWT not exposed by the client SDK yet. Login identity is active, but profile sync needs the JWT bearer token.');
    const response = await fetch('/api/account/profile', {
      method,
      headers: {
        authorization: `Bearer ${account.sessionJwt}`,
        ...(payload ? { 'content-type': 'application/json' } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message ?? body.error ?? `Profile request failed: HTTP ${response.status}`);
    return body.profile as BondrStoredProfile;
  }

  function applyProfile(next: BondrStoredProfile) {
    setProfile(next);
    setForm({
      userName: next.userName ?? '',
      displayName: next.displayName ?? '',
      bio: next.bio ?? '',
      preferredWalletLabel: next.preferredWalletLabel ?? ''
    });
  }

  async function loadProfile() {
    if (!account.authenticated) return;
    setBusy(true);
    setSyncStatus('Loading verified BONDR profile…');
    try {
      const next = await requestProfile('GET');
      applyProfile(next);
      setSyncStatus('Verified Turnkey identity and loaded BONDR profile.');
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : 'Profile load failed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setSyncStatus('Saving verified BONDR profile…');
    try {
      const next = await requestProfile('POST', {
        userId: account.userId ?? undefined,
        organizationId: account.organizationId ?? undefined,
        email: account.email ?? undefined,
        firstAccountAddress: account.firstAccountAddress ?? undefined,
        authMethod: account.authMethod ?? undefined,
        externalWalletAddress: account.externalWalletAddress ?? undefined,
        externalWalletProvider: account.externalWalletProvider ?? undefined,
        externalWalletChain: account.externalWalletChain ?? undefined,
        userName: form.userName,
        displayName: form.displayName,
        bio: form.bio,
        preferredWalletLabel: form.preferredWalletLabel
      });
      applyProfile(next);
      setSyncStatus('Profile saved after Turnkey JWT verification.');
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : 'Profile save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    try {
      await account.refresh();
      setSyncStatus('Turnkey client refreshed.');
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    setBusy(true);
    try {
      await account.login();
      setSyncStatus('Turnkey login opened. Choose wallet to authenticate with Phantom/Solflare, or email/passkey if needed.');
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : 'Turnkey login failed.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await account.logout();
      setProfile(null);
      setSyncStatus('');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (account.authenticated && account.sessionJwt && !profile && !busy) void loadProfile();
  }, [account.authenticated, account.sessionJwt]);

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
          <div className="profileActions"><button className="button" type="button" disabled>Turnkey unavailable</button></div>
        </div>
      </section>
    );
  }

  return (
    <section className="profileGrid accountProfileGrid">
      <div className="documentCard profileCard accountHeroCard bondrProfileHero">
        <div className="accountHeroTopline">
          <div className="profileAvatar bondrGeneratedAvatar" style={{ background: profile?.avatarGradient ?? undefined }}>{initials}</div>
          <span className="statusChip good">secured profile</span>
        </div>
        <div>
          <div className="eyebrow">BONDR operator profile</div>
          <h1>{profile?.displayName ?? account.userName ?? 'Operator profile'}</h1>
          <p>Your Turnkey identity unlocks the terminal. Your profile organizes the operator account. Browser-wallet signing remains separate from login.</p>
        </div>
        <div className="profileActions">
          <button className="button" type="button" onClick={() => void login()} disabled={!account.clientReady || account.authenticated || busy}>{account.authenticated ? 'Logged in' : 'Log in with Turnkey'}</button>
          <button className="button secondary" type="button" onClick={() => void refresh()} disabled={!account.clientReady || busy}>Refresh Turnkey</button>
          <button className="button secondary" type="button" onClick={() => void loadProfile()} disabled={!account.authenticated || busy}>Reload profile</button>
          <button className="button secondary" type="button" onClick={() => void logout()} disabled={!account.authenticated || busy}>Log out</button>
        </div>
        {syncStatus && <p className="qaMuted">{syncStatus}</p>}
      </div>

      <div className="documentCard accountGlassCard bondrProfileEditor">
        <h2>Edit profile</h2>
        <label>Username<input value={form.userName} onChange={(event) => setForm((current) => ({ ...current, userName: event.target.value }))} placeholder="scope-runner-1937" /></label>
        <label>Display name<input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="BONDR Operator" /></label>
        <label>Bio<textarea value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} placeholder="Liquidity operator, launch strategist, terminal builder…" /></label>
        <label>Preferred wallet label<input value={form.preferredWalletLabel} onChange={(event) => setForm((current) => ({ ...current, preferredWalletLabel: event.target.value }))} placeholder="Primary browser signer" /></label>
        <button className="button" type="button" onClick={() => void saveProfile()} disabled={!account.authenticated || busy}>Save verified profile</button>
        <p className="qaMuted">Storage is currently ephemeral process memory until a durable database is connected.</p>
      </div>

      <div className="documentCard accountGlassCard">
        <h2>Identity state</h2>
        <div className="infoGrid">
          <div className="sideRow"><span>Status</span><strong>{account.authenticated ? 'authenticated' : 'not authenticated'}</strong></div>
          <div className="sideRow"><span>Turnkey client</span><strong>{account.clientState}</strong></div>
          <div className="sideRow"><span>User</span><strong>{profile?.userName ?? account.userName ?? shortValue(account.userId)}</strong></div>
          <div className="sideRow"><span>Organization</span><strong>{shortValue(account.organizationId)}</strong></div>
          <div className="sideRow"><span>Embedded wallets</span><strong>{account.walletCount}</strong></div>
          <div className="sideRow"><span>First account</span><strong>{shortValue(account.firstAccountAddress)}</strong></div>
          <div className="sideRow"><span>Auth method</span><strong>{account.authMethod ?? '—'}</strong></div>
          <div className="sideRow"><span>External wallet</span><strong>{shortValue(profile?.externalWalletAddress ?? account.externalWalletAddress)}</strong></div>
          <div className="sideRow"><span>External provider</span><strong>{profile?.externalWalletProvider ?? account.externalWalletProvider ?? '—'}</strong></div>
          <div className="sideRow"><span>External chain</span><strong>{profile?.externalWalletChain ?? account.externalWalletChain ?? '—'}</strong></div>
          <div className="sideRow"><span>Browser wallet</span><strong>{browserWallet}</strong></div>
          <div className="sideRow"><span>Session JWT</span><strong>{account.sessionJwt ? 'available' : 'not exposed'}</strong></div>
          <div className="sideRow"><span>Profile storage</span><strong>verified / ephemeral</strong></div>
          <div className="sideRow"><span>Execution</span><strong>simulation + policy gated</strong></div>
        </div>
      </div>
    </section>
  );
}
