'use client';

import { useEffect, useMemo, useState } from 'react';

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string };
  connect?: () => Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?: () => Promise<void>;
};

declare global { interface Window { solana?: SolanaProvider } }

function shortAddress(address: string): string { return `${address.slice(0, 4)}…${address.slice(-4)}`; }

export function MockWalletConnect() {
  const [address, setAddress] = useState('');
  const [providerReady, setProviderReady] = useState(false);
  const [message, setMessage] = useState('Checking browser wallet provider.');

  useEffect(() => {
    const provider = window.solana;
    setProviderReady(Boolean(provider?.connect));
    const existing = provider?.publicKey?.toBase58();
    if (existing) setAddress(existing);
    setMessage(provider?.connect ? 'Browser wallet provider detected.' : 'No browser wallet provider detected in this browser.');
  }, []);

  const status = useMemo(() => address ? 'connected' : providerReady ? 'provider ready' : 'provider missing', [address, providerReady]);

  async function connect() {
    try {
      const result = await window.solana?.connect?.();
      const next = result?.publicKey?.toBase58() ?? window.solana?.publicKey?.toBase58() ?? '';
      setAddress(next);
      setMessage(next ? 'Browser wallet connected for signing prompts.' : 'Wallet provider did not return a public key.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wallet connection rejected.');
    }
  }

  async function disconnect() {
    await window.solana?.disconnect?.().catch(() => undefined);
    setAddress('');
    setMessage('Browser wallet disconnected.');
  }

  return (
    <section className="walletWalletPanel" aria-label="Browser wallet connection">
      <div>
        <div className="eyebrow">Operator access</div>
        <h2>{address ? 'Wallet linked' : 'Connect browser wallet'}</h2>
        <p>Live execution uses browser-wallet signing only. The server does not receive private keys.</p>
      </div>
      <div className="walletWalletState">
        <span>{status}</span>
        <strong>{address ? shortAddress(address) : 'No wallet'}</strong>
        <small>{message}</small>
      </div>
      <div className="profileActions">
        <button className="button" type="button" onClick={() => void connect()} disabled={!providerReady || Boolean(address)}>Connect</button>
        <button className="button secondary" type="button" onClick={() => void disconnect()} disabled={!address}>Disconnect</button>
      </div>
    </section>
  );
}
