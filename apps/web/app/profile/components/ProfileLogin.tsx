'use client';

import { useEffect, useMemo, useState } from 'react';

type BrowserSolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect?(): Promise<void>;
};

type ProfileState = {
  connected: boolean;
  displayName: string;
  walletAddress: string | null;
  providerName: string | null;
};

const STORAGE_KEY = 'meridian.profile.v1';
const LEGACY_STORAGE_KEYS = ['lattice.profile.v1'];

function shortAddress(address: string | null): string {
  if (!address) return '—';
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function detectProvider(): { provider: BrowserSolanaProvider | null; name: string | null } {
  if (typeof window === 'undefined') return { provider: null, name: null };
  const provider = (window as Window & { solana?: BrowserSolanaProvider }).solana ?? null;
  if (!provider) return { provider: null, name: null };
  return { provider, name: provider.isPhantom ? 'Phantom' : 'Solana wallet' };
}

export function ProfileLogin() {
  const [profile, setProfile] = useState<ProfileState>({ connected: false, displayName: 'Operator', walletAddress: null, providerName: null });
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [message, setMessage] = useState<string>('Wallet profile is read-only. Signing is disabled.');
  const shortWallet = useMemo(() => shortAddress(profile.walletAddress), [profile.walletAddress]);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
      ?? LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
    if (saved) {
      try {
        setProfile(JSON.parse(saved) as ProfileState);
        LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
        LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
      }
    }
    const { provider } = detectProvider();
    setWalletAvailable(Boolean(provider));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  async function connectWallet() {
    const { provider, name } = detectProvider();
    if (!provider) {
      setWalletAvailable(false);
      setMessage('No Solana browser wallet detected. Install Phantom or another Solana wallet to connect a read-only profile.');
      return;
    }

    try {
      const response = await provider.connect();
      const address = response.publicKey.toString();
      setProfile({ connected: true, displayName: 'Operator', walletAddress: address, providerName: name });
      setWalletAvailable(true);
      setMessage('Wallet profile connected. No message signing, transactions, swaps, or live trading were enabled.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wallet connection cancelled.');
    }
  }

  async function disconnectWallet() {
    const { provider } = detectProvider();
    try { await provider?.disconnect?.(); } catch { /* browser wallet disconnect is best-effort */ }
    setProfile({ connected: false, displayName: 'Operator', walletAddress: null, providerName: null });
    setMessage('Profile disconnected locally.');
  }

  return (
    <section className="profileGrid">
      <div className="documentCard profileCard">
        <div className="profileAvatar">{profile.connected ? 'OP' : 'B'}</div>
        <div>
          <div className="eyebrow">User profile</div>
          <h1>{profile.connected ? profile.displayName : 'Connect wallet'}</h1>
          <p>{message}</p>
        </div>
        <div className="profileActions">
          <button className="button" type="button" onClick={() => void connectWallet()} disabled={profile.connected}>
            {profile.connected ? 'Wallet connected' : 'Connect read-only wallet'}
          </button>
          <button className="button secondary" type="button" onClick={() => void disconnectWallet()} disabled={!profile.connected}>
            Disconnect
          </button>
        </div>
      </div>

      <div className="documentCard">
        <h2>Account state</h2>
        <div className="infoGrid">
          <div className="sideRow"><span>Status</span><strong>{profile.connected ? 'connected' : 'not connected'}</strong></div>
          <div className="sideRow"><span>Provider</span><strong>{profile.providerName ?? (walletAvailable ? 'detected' : 'not detected')}</strong></div>
          <div className="sideRow"><span>Wallet</span><strong>{shortWallet}</strong></div>
          <div className="sideRow"><span>Signing</span><strong>disabled</strong></div>
          <div className="sideRow"><span>Live trading</span><strong>disabled</strong></div>
        </div>
      </div>

      <div className="documentCard">
        <h2>Auth roadmap</h2>
        <ol className="roadmapList">
          <li>Read-only wallet identity.</li>
          <li>Optional message signing for session auth.</li>
          <li>Server-side profile/session persistence.</li>
          <li>Explicit risk approvals before any live controls.</li>
        </ol>
      </div>
    </section>
  );
}
