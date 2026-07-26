'use client';

import { useEffect, useState } from 'react';

type LoadedToken = {
  mint: string;
  name?: string;
  symbol?: string;
};

export function TerminalTopBar({ projectName, defaultMint, selectedWallet, walletCount }: { projectName: string; defaultMint: string; selectedWallet: string; walletCount: number }) {
  const [loadedToken, setLoadedToken] = useState<LoadedToken | null>(null);

  useEffect(() => {
    function onTokenLoaded(event: Event) {
      const custom = event as CustomEvent<LoadedToken>;
      setLoadedToken(custom.detail);
    }
    window.addEventListener('meridian-token-loaded', onTokenLoaded);
    return () => window.removeEventListener('meridian-token-loaded', onTokenLoaded);
  }, []);

  const tokenTitle = loadedToken?.symbol || loadedToken?.name || (defaultMint ? `${defaultMint.slice(0, 5)}…${defaultMint.slice(-5)}` : 'Load mint');
  const tokenSubtitle = loadedToken?.name && loadedToken?.symbol ? loadedToken.name : projectName;

  return (
    <section className="axiomTopBar premiumTopBar">
      <div className="terminalBrandLockup"><span>Meridian</span><strong>Project Trading Terminal</strong></div>
      <div className="terminalContextPill liveTokenProjectPill"><span>Project / token</span><strong>{tokenTitle}</strong><small>{tokenSubtitle}</small></div>
      <div className="terminalContextPill"><span>Active token</span><strong>{loadedToken?.mint ? `${loadedToken.mint.slice(0, 5)}…${loadedToken.mint.slice(-5)}` : defaultMint ? `${defaultMint.slice(0, 5)}…${defaultMint.slice(-5)}` : 'Load mint'}</strong></div>
      <div className="terminalContextPill compactContextPill"><span>Wallets</span><strong>{selectedWallet} · {walletCount} total</strong></div>
      <div className="terminalModePill">Safe preview</div>
    </section>
  );
}
