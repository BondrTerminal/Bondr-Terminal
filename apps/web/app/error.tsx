'use client';

import { useEffect } from 'react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const digest = error.digest ?? 'no-digest';

  useEffect(() => {
    console.error('BONDR route error', { digest, message: error.message });
  }, [digest, error.message]);

  return (
    <main className="bondrErrorShell" aria-label="BONDR route error">
      <section className="documentCard bondrErrorCard">
        <div className="eyebrow">Route guard</div>
        <h1>This view failed closed.</h1>
        <p>BONDR blocked this route from continuing after a client or server render error. Your identity and wallet state were not changed by this screen.</p>
        <div className="infoGrid">
          <div className="sideRow"><span>Error digest</span><strong>{digest}</strong></div>
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
