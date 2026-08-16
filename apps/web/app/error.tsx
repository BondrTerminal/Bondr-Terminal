'use client';

import { useEffect } from 'react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const digest = error.digest ?? 'no-digest';

  useEffect(() => {
    const path = window.location.pathname + window.location.search;
    const report = {
      digest,
      name: error.name,
      message: error.message,
      path,
      userAgent: window.navigator.userAgent
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
