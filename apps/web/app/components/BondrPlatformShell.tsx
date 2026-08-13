'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useBondrTurnkeyAccount } from './TurnkeyAccountProvider';
import { BondrLandingPage } from './BondrLandingPage';
import { GlobalCreateProjectAction } from './GlobalCreateProjectAction';
import { HeaderWalletChip } from './HeaderWalletChip';
import { AccountNavButton } from './AccountNavButton';

const NEXT_KEY = 'bondr_next_path';
const PUBLIC_PATHS = new Set(['/whitepaper']);

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

function currentPath(pathname: string, search: string) {
  return `${pathname}${search ? `?${search}` : ''}`;
}

function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (value.startsWith('/api/')) return '/';
  try {
    const parsed = new URL(value, 'https://bondr.local');
    if (parsed.origin !== 'https://bondr.local') return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

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
  const pathname = usePathname();
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = currentPath(pathname, window.location.search.replace(/^\?/, ''));

    if (!account.authenticated) {
      sessionStorage.setItem(NEXT_KEY, safeNextPath(path));
      redirectedRef.current = false;
      return;
    }

    if (redirectedRef.current) return;
    const next = safeNextPath(sessionStorage.getItem(NEXT_KEY));
    sessionStorage.removeItem(NEXT_KEY);
    redirectedRef.current = true;

    if (next !== path) router.replace(next);
  }, [account.authenticated, pathname, router]);

  if (!account.authenticated && !PUBLIC_PATHS.has(pathname)) {
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
