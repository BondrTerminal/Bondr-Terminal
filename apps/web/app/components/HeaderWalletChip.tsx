'use client';

import { useCallback, useEffect, useState } from 'react';

type SolanaProvider = {
  publicKey?: { toBase58?(): string; toString(): string };
  connect?: () => Promise<{ publicKey: { toBase58?(): string; toString(): string } }>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type WindowWithSolana = Window & { solana?: SolanaProvider };
type Rail = { connectedSigner: string | null; selectedWallet: string | null; inventoryMatch: boolean; selectedInventoryMatch: boolean; solBalance: number | null; selectedSolBalance: number | null; balanceStatus: string; provider: string; warnings?: string[] };

function short(address?: string | null) { return address ? `${address.slice(0, 4)}…${address.slice(-4)}` : 'Wallet'; }
function sol(value: number | null | undefined) { return typeof value === 'number' ? `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL` : '—'; }

export function HeaderWalletChip() {
  const [signer, setSigner] = useState('');
  const [activeWallet, setActiveWallet] = useState('');
  const [rail, setRail] = useState<Rail | null>(null);

  const refresh = useCallback(async (nextSigner = signer, selectedOverride?: string) => {
    const selected = selectedOverride ?? activeWallet ?? '';
    const params = new URLSearchParams();
    if (nextSigner) params.set('connectedSigner', nextSigner);
    if (selected || nextSigner) params.set('selectedWallet', selected || nextSigner);
    try {
      const response = await fetch(`/api/wallet-rail?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) return;
      setRail(await response.json() as Rail);
    } catch {
      setRail(null);
    }
  }, [activeWallet, signer]);

  useEffect(() => {
    const stored = window.localStorage.getItem('bondr.activeWallet') ?? '';
    setActiveWallet(stored);
    const provider = (window as WindowWithSolana).solana;
    const existing = provider?.publicKey?.toBase58?.() ?? provider?.publicKey?.toString?.() ?? '';
    if (existing) setSigner(existing);
    void refresh(existing, stored || existing);
    const onAccount = (pubkey?: unknown) => {
      const next = typeof pubkey === 'object' && pubkey && 'toBase58' in pubkey && typeof pubkey.toBase58 === 'function' ? pubkey.toBase58() : (window as WindowWithSolana).solana?.publicKey?.toBase58?.() ?? '';
      setSigner(next);
      void refresh(next, window.localStorage.getItem('bondr.activeWallet') ?? next);
    };
    const onActiveWalletChanged = (event: Event) => {
      const next = (event as CustomEvent<{ address?: string }>).detail?.address ?? window.localStorage.getItem('bondr.activeWallet') ?? '';
      setActiveWallet(next);
      void refresh(signer || existing, next);
    };
    provider?.on?.('accountChanged', onAccount);
    window.addEventListener('bondr-active-wallet-changed', onActiveWalletChanged);
    window.addEventListener('bondr-watch-only-wallet-added', onActiveWalletChanged);
    return () => {
      provider?.off?.('accountChanged', onAccount);
      window.removeEventListener('bondr-active-wallet-changed', onActiveWalletChanged);
      window.removeEventListener('bondr-watch-only-wallet-added', onActiveWalletChanged);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = rail?.selectedWallet || activeWallet || signer || null;
  const signerMatchesSelected = Boolean(signer && selected && signer === selected);
  const selectedSaved = Boolean(rail?.selectedInventoryMatch);
  const signerSaved = Boolean(rail?.inventoryMatch);
  const fullyMatched = Boolean(signerMatchesSelected && signerSaved && selectedSaved);
  const balance = rail?.selectedSolBalance ?? rail?.solBalance ?? null;
  const status = fullyMatched
    ? 'matched'
    : selectedSaved && !signer
      ? 'saved wallet'
      : selectedSaved && signer && !signerMatchesSelected
        ? 'signer mismatch'
        : rail?.balanceStatus ?? (signer ? 'checking' : 'not connected');

  return <a className={`bondrHeaderWalletChip ${fullyMatched ? 'matched' : selectedSaved ? 'savedWallet' : ''}`} href="/portfolio?view=wallets" title={rail?.warnings?.join(' · ') ?? 'Portfolio wallets'}>
    <span>{short(selected)}</span>
    <strong>{sol(balance)}</strong>
    <em>{status}</em>
  </a>;
}
