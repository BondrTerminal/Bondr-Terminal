'use client';

import { useEffect, useState } from 'react';

type SessionPayload = {
  status?: string;
  auth?: {
    configured?: boolean;
    sessionSecretConfigured?: boolean;
    operatorKeyConfigured?: boolean;
    authenticated?: boolean;
    reason?: string | null;
    cookieName?: string;
    maxAgeSeconds?: number;
    requiredEnv?: string[];
  };
  error?: string;
};

export function OperatorSessionLogin() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [sessionKey, setSessionKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Checking operator session.');

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/meridian-session', { cache: 'no-store' });
      const payload = await response.json() as SessionPayload;
      setSession(payload);
      setMessage(payload.auth?.authenticated ? 'Operator session active.' : payload.auth?.configured ? 'Operator session required for build/simulate/sign QA.' : 'Operator auth is not configured.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Session status failed.');
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    if (!sessionKey.trim()) { setMessage('Enter the operator session key.'); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/meridian-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: sessionKey.trim() })
      });
      const payload = await response.json() as SessionPayload;
      setSession(payload);
      if (!response.ok) { setMessage(payload.error ?? 'Operator login failed.'); return; }
      setSessionKey('');
      setMessage('Operator session active. Return to Live Beta Test and refresh capabilities.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Operator login failed.');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      const response = await fetch('/api/meridian-session', { method: 'DELETE' });
      const payload = await response.json() as SessionPayload;
      setSession(payload);
      setMessage('Operator session cleared.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Logout failed.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const auth = session?.auth;
  const configured = Boolean(auth?.configured);
  const authenticated = Boolean(auth?.authenticated);

  return (
    <section className="documentCard operatorSessionPanel" aria-label="Operator session login">
      <div className="sectionIntro compactIntro">
        <span>Operator session</span>
        <h2>{authenticated ? 'Session active' : 'Login required for live-beta build/sign QA'}</h2>
        <p>{message}</p>
      </div>
      <div className="infoGrid">
        <div className="sideRow"><span>Configured</span><strong>{configured ? 'yes' : 'no'}</strong></div>
        <div className="sideRow"><span>Authenticated</span><strong>{authenticated ? 'yes' : 'no'}</strong></div>
        <div className="sideRow"><span>Reason</span><strong>{auth?.reason ?? 'checking'}</strong></div>
        <div className="sideRow"><span>Cookie</span><strong>{auth?.cookieName ?? 'meridian_session'}</strong></div>
      </div>
      {!configured && <p className="qaMuted">Server is missing MERIDIAN_SESSION_SECRET or MERIDIAN_OPERATOR_KEY. Production mutations stay blocked until configured.</p>}
      <div className="qaActionRow">
        <input
          aria-label="Operator session key"
          type="password"
          value={sessionKey}
          onChange={(event) => setSessionKey(event.target.value)}
          placeholder="Operator session key"
          disabled={!configured || loading || authenticated}
        />
        <button className="button" type="button" onClick={() => void login()} disabled={!configured || loading || authenticated}>{loading ? 'Working…' : authenticated ? 'Logged in' : 'Start operator session'}</button>
        <button className="button secondary" type="button" onClick={() => void refresh()} disabled={loading}>Refresh status</button>
        <button className="button secondary" type="button" onClick={() => void logout()} disabled={loading || !authenticated}>Clear session</button>
      </div>
      <p className="qaMuted">This only creates the protected operator session cookie. It does not request private keys, sign transactions, fund wallets, deploy tokens, or enable broadcast.</p>
    </section>
  );
}
