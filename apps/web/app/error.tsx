'use client';

import { useEffect, useMemo } from 'react';

const DIAGNOSTICS_BUILD = 'route-diagnostics-v2';

function safeJsonParse(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function storageSnapshot(storage: Storage) {
  try {
    const keys = Array.from({ length: storage.length }, (_item, index) => storage.key(index)).filter((key): key is string => Boolean(key));
    const relevantKeys = keys.filter((key) => /^bondr[._]|^turnkey|turnkey|meridian|wallet|profile/i.test(key)).slice(0, 40);
    return {
      available: true,
      relevantKeys,
      hasVerifiedAuth: storage.getItem('bondr_verified_auth') === 'true',
      hasVerifiedAuthSession: Boolean(storage.getItem('bondr_verified_auth_session')),
      hasVerifiedAuthMethod: Boolean(storage.getItem('bondr_verified_auth_method')),
      hasPendingLogin: Boolean(storage.getItem('bondr_pending_login')),
      nextPath: storage.getItem('bondr_next_path') ?? null,
      activeProfileSubjectPresent: Boolean(storage.getItem('bondr.activeSubject')) || relevantKeys.some((key) => key.includes('active_profile_subject') || key.includes('activeSubject')),
      clientMintKeyCount: relevantKeys.filter((key) => key.includes('client_mint') || key.includes('clientMintPublicKey')).length,
      activeWalletKeyCount: relevantKeys.filter((key) => key.includes('active_wallet') || key.includes('activeWallet')).length
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.name : 'StorageAccessError'
    };
  }
}

function sessionSummary() {
  try {
    const parsed = safeJsonParse(window.sessionStorage.getItem('bondr_verified_auth_session'));
    const expiry = typeof parsed?.expiry === 'number' ? parsed.expiry : null;
    return {
      available: true,
      parseable: Boolean(parsed),
      hasUserId: typeof parsed?.userId === 'string',
      hasOrganizationId: typeof parsed?.organizationId === 'string',
      hasToken: typeof parsed?.token === 'string',
      hasPublicKey: typeof parsed?.publicKey === 'string',
      expiry,
      expired: typeof expiry === 'number' ? expiry * 1000 <= Date.now() : null
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.name : 'SessionAccessError'
    };
  }
}

function safeCookieNames() {
  try {
    return document.cookie
      .split(';')
      .map((item) => item.trim().split('=')[0])
      .filter(Boolean)
      .filter((name) => /^meridian|turnkey|bondr|__Secure|__Host/i.test(name))
      .slice(0, 24);
  } catch {
    return ['cookie-read-failed'];
  }
}

function collectDiagnostics() {
  try {
    const scripts = Array.from(document.scripts)
      .map((script) => script.src)
      .filter((src) => src.includes('/_next/static/'))
      .map((src) => src.split('/_next/static/')[1]?.slice(0, 160) ?? '')
      .filter(Boolean)
      .slice(0, 24);
    return {
      location: {
        pathname: window.location.pathname,
        search: window.location.search,
        hashPresent: Boolean(window.location.hash)
      },
      visibilityState: document.visibilityState,
      navigationType: performance.getEntriesByType('navigation')[0]?.entryType ?? 'unknown',
      localStorage: storageSnapshot(window.localStorage),
      sessionStorage: storageSnapshot(window.sessionStorage),
      verifiedSession: sessionSummary(),
      cookieNames: safeCookieNames(),
      nextStaticScripts: scripts
    };
  } catch (err) {
    return {
      diagnosticCollectionFailed: true,
      error: err instanceof Error ? err.name : 'DiagnosticsError'
    };
  }
}

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const digest = error.digest ?? 'no-digest';
  const diagnostics = useMemo(() => (typeof window === 'undefined' ? null : collectDiagnostics()), []);

  useEffect(() => {
    const path = window.location.pathname + window.location.search;
    const report = {
      digest,
      name: error.name,
      message: error.message,
      path,
      userAgent: window.navigator.userAgent,
      diagnostics: {
        build: DIAGNOSTICS_BUILD,
        ...diagnostics
      }
    };
    console.error('BONDR route error', report);
    try {
      const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
      window.navigator.sendBeacon?.('/api/client-error-report', blob);
    } catch {
      // Keep the error boundary fail-closed even if diagnostic transport is unavailable.
    }
    void fetch('/api/client-error-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(report)
    }).catch(() => undefined);
  }, [diagnostics, digest, error.message, error.name]);

  const sessionStorageDiagnostics = diagnostics?.sessionStorage;
  const verifiedSessionDiagnostics = diagnostics?.verifiedSession;
  const sessionStorageSummary = typeof sessionStorageDiagnostics === 'object' && sessionStorageDiagnostics && 'available' in sessionStorageDiagnostics
    ? sessionStorageDiagnostics
    : null;
  const verifiedSessionSummary = typeof verifiedSessionDiagnostics === 'object' && verifiedSessionDiagnostics && 'available' in verifiedSessionDiagnostics
    ? verifiedSessionDiagnostics
    : null;

  return (
    <main className="bondrErrorShell" aria-label="BONDR route error">
      <section className="documentCard bondrErrorCard">
        <div className="eyebrow">Route guard</div>
        <h1>This view failed closed.</h1>
        <p>BONDR blocked this route from continuing after a client or server render error. Your identity and wallet state were not changed by this screen.</p>
        <div className="infoGrid">
          <div className="sideRow"><span>Route</span><strong>{typeof window === 'undefined' ? 'unknown' : window.location.pathname}</strong></div>
          <div className="sideRow"><span>Error digest</span><strong>{digest}</strong></div>
          <div className="sideRow"><span>Error type</span><strong>{error.name || 'Error'}</strong></div>
          <div className="sideRow"><span>Recovery</span><strong>reload or return to Hub</strong></div>
          <div className="sideRow"><span>Diagnostics build</span><strong>{DIAGNOSTICS_BUILD}</strong></div>
          <div className="sideRow"><span>Verified auth</span><strong>{sessionStorageSummary && 'hasVerifiedAuth' in sessionStorageSummary ? String(sessionStorageSummary.hasVerifiedAuth) : 'unknown'}</strong></div>
          <div className="sideRow"><span>Session auth</span><strong>{sessionStorageSummary && 'hasVerifiedAuthSession' in sessionStorageSummary ? String(sessionStorageSummary.hasVerifiedAuthSession) : 'unknown'}</strong></div>
          <div className="sideRow"><span>Session expired</span><strong>{verifiedSessionSummary && 'expired' in verifiedSessionSummary ? String(verifiedSessionSummary.expired) : 'unknown'}</strong></div>
          <div className="sideRow"><span>Profile subject</span><strong>{sessionStorageSummary && 'activeProfileSubjectPresent' in sessionStorageSummary ? String(sessionStorageSummary.activeProfileSubjectPresent) : 'unknown'}</strong></div>
        </div>
        <div className="profileActions">
          <button className="button" type="button" onClick={() => reset()}>Retry view</button>
          <a className="button secondary" href="/">Return to Hub</a>
          <a className="button secondary" href="/profile">Open Profile Audit</a>
        </div>
      </section>
    </main>
  );
}
