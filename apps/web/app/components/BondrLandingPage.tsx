'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useBondrTurnkeyAccount } from './TurnkeyAccountProvider';

type LoginIntent = 'deploy' | 'signup' | 'login';

const intentCopy: Record<LoginIntent, { title: string; body: string }> = {
  deploy: {
    title: 'Start deploying with BONDR',
    body: 'Your BONDR profile unlocks the terminal. Your browser wallet remains the signer.'
  },
  signup: {
    title: 'Create your BONDR account',
    body: 'Turnkey secures your identity. BONDR never asks for seed phrases.'
  },
  login: {
    title: 'Log in to BONDR',
    body: 'Continue to your secured operator terminal.'
  }
};

const productCards = [
  ['Deployment prep', 'Configure launch metadata, readiness, and execution gates before anything goes live.'],
  ['Wallet operations', 'Organize operator wallets and signer readiness without exposing the terminal before auth.'],
  ['Liquidity planning', 'Prepare liquidity and market-making workflows behind the secured command layer.'],
  ['Terminal intelligence', 'Analyze tokens, routes, portfolios, and policy state from the private operator surface.']
] as const;

const safetyCards = ['Turnkey identity', 'Browser-wallet signing', 'Simulation required', 'Broadcast/deployment gated'];

function waitForModalUnmount() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

export function BondrLandingPage() {
  const account = useBondrTurnkeyAccount();
  const [intent, setIntent] = useState<LoginIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function openLogin(nextIntent: LoginIntent) {
    setIntent(nextIntent);
    setMessage('');
  }

  async function continueWithTurnkey() {
    if (!account.configured || !account.clientReady) {
      setMessage('Turnkey login is not fully configured yet.');
      return;
    }

    setBusy(true);
    setMessage('Opening Turnkey secure login…');
    setIntent(null);
    await waitForModalUnmount();
    try {
      await account.login();
      await account.refresh();
      setMessage('Complete Turnkey verification to unlock BONDR terminal…');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Turnkey login did not complete.');
    } finally {
      setBusy(false);
    }
  }

  async function continueWithWallet(chain: 'solana' | 'ethereum') {
    if (!account.configured || !account.clientReady) {
      setMessage('Turnkey login is not fully configured yet.');
      return;
    }

    setBusy(true);
    setMessage(`Opening ${chain === 'solana' ? 'Solana' : 'EVM'} wallet login...`);
    try {
      await account.loginWithExternalWallet(chain);
      await account.refresh();
      setMessage('Wallet signature verified. Unlocking BONDR terminal...');
      setIntent(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wallet login did not complete.');
    } finally {
      setBusy(false);
    }
  }

  const modalCopy = intent ? intentCopy[intent] : null;

  return (
    <main className="bondrPublicShell" aria-label="BONDR public entry">
      <header className="bondrPublicHeader">
        <a className="bondrPublicBrand" href="/" aria-label="BONDR home">
          <Image src="/brand/bondr-wordmark.svg" alt="BONDR" width={720} height={180} priority />
        </a>
        <div className="bondrPublicActions">
          <button type="button" onClick={() => openLogin('login')}>Log In</button>
          <button type="button" onClick={() => openLogin('signup')}>Sign Up</button>
        </div>
      </header>

      <section className="bondrPublicHero">
        <div className="bondrPublicEyebrow">Solana operator terminal</div>
        <div className="bondrPublicSlogan">Scope. Snipe. Deploy.</div>
        <h1>Deploy and operate Solana launches from one secured terminal.</h1>
        <p>BONDR brings deployment prep, wallet operations, liquidity planning, token intelligence, and browser-wallet execution gates into one private command layer.</p>
        <div className="bondrHeroActions">
          <button type="button" onClick={() => openLogin('deploy')}>Start Deploying</button>
          <span>Already have an account? <button type="button" onClick={() => openLogin('login')}>Log in</button></span>
        </div>
        <div className="bondrHeroSafety">Turnkey-secured identity. Browser-wallet signing. No server-side seed phrase custody.</div>
      </section>

      <section className="bondrPublicInfo" aria-label="What BONDR does">
        <div className="bondrPublicSectionHead">
          <span>What BONDR does</span>
          <h2>Launch operations, organized before the first transaction.</h2>
        </div>
        <div className="bondrPublicCardGrid">
          {productCards.map(([title, body]) => <article key={title}><strong>{title}</strong><p>{body}</p></article>)}
        </div>
      </section>

      <section className="bondrPublicSecurity" aria-label="Secured by design">
        <div><span>Secured by design</span><h2>Authenticate first. Sign separately.</h2></div>
        <div className="bondrSecurityPills">{safetyCards.map((item) => <span key={item}>{item}</span>)}</div>
      </section>

      <section className="bondrPublicDocs">
        <span>Docs</span>
        <h2>Read the BONDR operating doctrine.</h2>
        <a href="/whitepaper">Open whitepaper</a>
      </section>

      {modalCopy && (
        <div className="bondrAuthBackdrop" role="dialog" aria-modal="true" aria-label={modalCopy.title}>
          <section className="bondrAuthModal">
            <button className="bondrAuthClose" type="button" onClick={() => setIntent(null)} aria-label="Close login">×</button>
            <Image className="bondrAuthWordmark" src="/brand/bondr-wordmark.svg" alt="BONDR" width={360} height={90} />
            <div className="bondrPublicEyebrow">Turnkey secured access</div>
            <h2>{modalCopy.title}</h2>
            <p>{modalCopy.body}</p>
            <button className="bondrAuthPrimary" type="button" onClick={() => void continueWithTurnkey()} disabled={!account.configured || !account.clientReady || busy}>
              {busy ? 'Opening Turnkey…' : account.configured ? 'Continue with Turnkey' : 'Turnkey unavailable'}
            </button>
            <div className="bondrWalletAuthButtons" aria-label="Wallet login options">
              <button type="button" onClick={() => void continueWithWallet('solana')} disabled={!account.configured || !account.clientReady || busy}>Solana wallet</button>
              <button type="button" onClick={() => void continueWithWallet('ethereum')} disabled={!account.configured || !account.clientReady || busy}>EVM wallet</button>
            </div>
            <small>Your BONDR profile unlocks the terminal. Your browser wallet remains the signer.</small>
            {message && <p className="bondrLoginMessage">{message}</p>}
            {account.debug.lastErrorMessage && (
              <p className="bondrLoginMessage">
                {account.debug.lastEvent}: {account.debug.lastErrorCode ? `${account.debug.lastErrorCode} - ` : ''}{account.debug.lastErrorMessage}
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
