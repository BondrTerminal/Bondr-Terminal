'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useBondrTurnkeyAccount } from './TurnkeyAccountProvider';
import { BondrLandingPage } from './BondrLandingPage';
import { GlobalCreateProjectAction } from './GlobalCreateProjectAction';
import { HeaderWalletChip } from './HeaderWalletChip';
import { AccountNavButton } from './AccountNavButton';

const NEXT_KEY = 'bondr_next_path';
const AUTH_SUCCESS_EVENT = 'bondr-turnkey-auth-success';
const VERIFIED_AUTH_KEY = 'bondr_verified_auth';
const PUBLIC_PATHS = new Set(['/whitepaper']);

const primaryNavItems = [
  { href: '/', label: 'Hub' },
  { href: '/sniper', label: 'Terminal' },
  { href: '/deployment', label: 'Bond' },
  { href: '/projects', label: 'Projects' },
  { href: '/portfolio?view=wallets', label: 'Portfolio' }
];

const toolItems = [
  { href: '/liquidity', label: 'Liquidity' },
  { href: '/token-analyzer', label: 'Analyzer' },
  { href: '/project-dashboard', label: 'Project Dashboard' },
  { href: '/whitepaper', label: 'Whitepaper' }
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


function resolveStoredNextPath() {
  if (typeof window === 'undefined') return '/';
  const next = safeNextPath(sessionStorage.getItem(NEXT_KEY));
  sessionStorage.removeItem(NEXT_KEY);
  return next;
}

function AppHeader() {
  return (
    <header className="bondrTopHeader" aria-label="Bond.Terminal application header">
      <Link className="bondrWordmark" href="/" aria-label="Bond.Terminal home">
        <span className="bondrLogoText" aria-label="BONDR">
          <span>B</span><span className="bondrScopeO">O</span><span>N</span><span>D</span><span>R</span>
        </span>
      </Link>
      <nav className="bondrHeaderNav" aria-label="Main navigation">
        {primaryNavItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        <details className="bondrToolsMenu">
          <summary>Tools</summary>
          <div className="bondrToolsMenuPanel">
            {toolItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          </div>
        </details>
      </nav>
      <div className="bondrHeaderActions" aria-label="Account and watch controls">
        <HeaderWalletChip />
        <GlobalCreateProjectAction />
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
  const [debugAuth, setDebugAuth] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDebugAuth(new URLSearchParams(window.location.search).get('debugAuth') === '1');
  }, [pathname]);


  useEffect(() => {
    if (typeof window === 'undefined') return;

    function completeTurnkeyAuthRedirect() {
      const next = resolveStoredNextPath();
      redirectedRef.current = true;
      router.replace(next);
      window.setTimeout(() => {
        if (sessionStorage.getItem(VERIFIED_AUTH_KEY) === 'true' && !document.querySelector('.bondrTopHeader')) {
          window.location.href = next;
        }
      }, 250);
    }

    window.addEventListener(AUTH_SUCCESS_EVENT, completeTurnkeyAuthRedirect);
    return () => window.removeEventListener(AUTH_SUCCESS_EVENT, completeTurnkeyAuthRedirect);
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = currentPath(pathname, window.location.search.replace(/^\?/, ''));

    if (!account.authenticated) {
      if (account.authResolved && !account.authHydrating) {
        sessionStorage.setItem(NEXT_KEY, '/');
        redirectedRef.current = false;
      }
      return;
    }

    if (redirectedRef.current) return;
    const next = resolveStoredNextPath();
    redirectedRef.current = true;

    if (next !== path) {
      router.replace(next);
    }
  }, [account.authHydrating, account.authResolved, account.authenticated, pathname, router]);

  if (!account.authenticated && !account.authResolved && !PUBLIC_PATHS.has(pathname)) {
    return <div className="bondrAuthResolving" aria-live="polite">Restoring Bond.Terminal session…</div>;
  }

  if (!account.authenticated && account.authResolved && !PUBLIC_PATHS.has(pathname)) {
    return (
      <>
        <BondrLandingPage />
        {debugAuth ? (
          <div className="bondrAuthDebug" aria-label="BONDR auth debug">
            <strong>Auth debug</strong>
            <span>authState: {account.authState}</span>
            <span>clientState: {account.clientState}</span>
            <span>authenticated: {String(account.authenticated)}</span>
            <span>hasUser: {String(Boolean(account.userId))}</span>
            <span>hasOrg: {String(Boolean(account.organizationId))}</span>
            <span>hasSessionJwt: {String(Boolean(account.sessionJwt))}</span>
            <span>walletCount: {account.walletCount}</span>
            <span>walletProvidersCount: {account.walletProvidersCount}</span>
            <span>walletProviders: {account.walletProviderNames.join(', ') || 'none'}</span>
            <span>walletNamespaces: {account.walletProviderNamespaces.join(', ') || 'none'}</span>
            <span>lastEvent: {account.debug.lastEvent}</span>
            <span>callbackFired: {String(account.debug.callbackFired)}</span>
            <span>callbackMethod: {account.debug.callbackMethod ?? 'none'}</span>
            <span>callbackAction: {account.debug.callbackAction ?? 'none'}</span>
            <span>callbackHadSession: {String(account.debug.callbackHadSession)}</span>
            <span>callbackHadUserOrg: {String(account.debug.callbackHadUserOrg)}</span>
            <span>hasTurnkeySession: {String(account.debug.hasTurnkeySession)}</span>
            <span>hasSessionUserOrg: {String(account.debug.hasSessionUserOrg)}</span>
            <span>lastErrorCode: {account.debug.lastErrorCode ?? 'none'}</span>
            <span>lastErrorMessage: {account.debug.lastErrorMessage ?? 'none'}</span>
            <span>timeline:</span>
            {account.debug.timeline.length ? account.debug.timeline.map((item) => <span key={item}>• {item}</span>) : <span>• none</span>}
          </div>
        ) : null}
      </>
    );
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
