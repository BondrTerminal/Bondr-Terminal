'use client';

import type { ReactNode } from 'react';
import { useBondrTurnkeyAccount } from './TurnkeyAccountProvider';
import { BondrLandingPage } from './BondrLandingPage';
import { GlobalCreateProjectAction } from './GlobalCreateProjectAction';
import { HeaderWalletChip } from './HeaderWalletChip';
import { AccountNavButton } from './AccountNavButton';

const primaryNavItems = [
  { href: '/', label: 'Hub' },
  { href: '/liquidity', label: 'Liquidity Engine' },
  { href: '/sniper', label: 'Terminal' },
  { href: '/wallets', label: 'Wallets' },
  { href: '/projects', label: 'Projects' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/deployment', label: 'Deployment' }
];

const toolItems = [
  { href: '/liquidity', label: 'Market Maker / Scalper' },
  { href: '/token-analyzer', label: 'Token Analyzer' },
  { href: '/project-dashboard', label: 'Project Dashboard' }
];

function AppHeader() {
  return (
    <header className="bondrTopHeader" aria-label="Bond.Terminal application header">
      <a className="bondrWordmark" href="/" aria-label="Bond.Terminal home">
        <span className="bondrLogoText" aria-label="BONDR">
          <span>B</span><span className="bondrScopeO">O</span><span>N</span><span>D</span><span>R</span>
        </span>
      </a>
      <nav className="bondrHeaderNav" aria-label="Main navigation">
        {primaryNavItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        <details className="bondrToolsMenu">
          <summary>Tools</summary>
          <div className="bondrToolsMenuPanel">
            {toolItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </div>
        </details>
      </nav>
      <div className="bondrHeaderActions" aria-label="Account and watch controls">
        <HeaderWalletChip />
        <GlobalCreateProjectAction />
        <a className="bondrHeaderAction" href="/wallets">Wallet Ops</a>
        <AccountNavButton />
      </div>
    </header>
  );
}

export function BondrPlatformShell({ children }: { children: ReactNode }) {
  const account = useBondrTurnkeyAccount();

  if (!account.authenticated) {
    return <BondrLandingPage />;
  }

  return (
    <div className="bondrAppFrame bondrFinalShell">
      <AppHeader />
      <div className="bondrAppContent">
        {children}
      </div>
    </div>
  );
}
