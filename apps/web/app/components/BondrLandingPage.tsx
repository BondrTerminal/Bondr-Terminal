'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useBondrTurnkeyAccount } from './TurnkeyAccountProvider';

const safety = ['Turnkey identity', 'Browser-wallet signer', 'No server key custody'];

export function BondrLandingPage() {
  const account = useBondrTurnkeyAccount();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function login() {
    if (!account.configured || !account.clientReady) {
      setMessage('Turnkey login is not fully configured yet.');
      return;
    }

    setBusy(true);
    setMessage('Opening Turnkey secure login…');
    try {
      await account.login();
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Turnkey login did not complete.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bondrLoginShell" aria-label="BONDR login">
      <div className="bondrLoginBackdropGlow" />
      <section className="bondrLoginCard">
        <div className="bondrLoginWordmarkWrap">
          <Image src="/brand/bondr-wordmark.svg" alt="BONDR" width={720} height={180} priority />
        </div>

        <div className="bondrLoginContent">
          <div className="bondrLoginEyebrow">Turnkey secured access</div>
          <h1>Log in to BONDR.</h1>
          <p>
            Authenticate your operator profile with Turnkey. Execution remains separate:
            browser-wallet signing, simulation, and policy gates still control any transaction flow.
          </p>
        </div>

        <button
          type="button"
          className="bondrLoginButton"
          onClick={() => void login()}
          disabled={!account.configured || !account.clientReady || busy}
        >
          {busy ? 'Opening Turnkey…' : account.configured ? 'Continue with Turnkey' : 'Turnkey unavailable'}
        </button>

        {message && <p className="bondrLoginMessage">{message}</p>}

        <div className="bondrLoginSafety" aria-label="Login safety notes">
          {safety.map((item) => <span key={item}>{item}</span>)}
        </div>
      </section>
    </main>
  );
}
