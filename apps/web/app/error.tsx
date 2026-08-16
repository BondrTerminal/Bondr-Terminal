'use client';

import { useEffect } from 'react';

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
    const relevantKeys = keys.filter((key) => /^bondr_|^turnkey|turnkey|meridian|wallet|profile/i.test(key)).slice(0, 40);
    return {
      available: true,
      relevantKeys,
      hasVerifiedAuth: storage.getItem('bondr_verified_auth') === 'true',
      hasVerifiedAuthSession: Boolean(storage.getItem('bondr_verified_auth_session')),
      hasVerifiedAuthMethod: Boolean(storage.getItem('bondr_verified_auth_method')),
      hasPendingLogin: Boolean(storage.getItem('bondr_pending_login')),
      nextPath: storage.getItem('bondr_next_path') ?? null,
      activeProfileSubjectPresent: relevantKeys.some((key) => key.includes('active_profile_subject')),
      clientMintKeyCount: relevantKeys.filter((key) => key.includes('client_mint')).length,
      activeWalletKeyCount: relevantKeys.filter((key) => key.includes('active_wallet')).length
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

  useEffect(() => {
    const path = window.location.pathname + window.location.search;
    const report = {
      digest,
      name: error.name,
      message: error.message,
      path,
      userAgent: window.navigator.userAgent,
      diagnostics: collectDiagnostics()
    };
    console.error('BONDR route error', report);
    void fetch('/api/client-error-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report)
    }).catch(() => undefined);
  }, [digest, error.message]);

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
