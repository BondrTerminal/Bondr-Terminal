'use client';

import { useState } from 'react';
import { useBondrTurnkeyAccount } from './TurnkeyAccountProvider';

const modules = [
  ['Terminal', 'Quote, build, simulate, and prepare browser-wallet execution from one focused trading surface.'],
  ['Liquidity Engine', 'Market maker and scalper workflows for operators managing Solana liquidity with discipline.'],
  ['Wallet Ops', 'Track signer readiness, wallet groups, balances, and operational routing without server key custody.'],
  ['Projects', 'Create launch records, connect wallets, and move from idea to configured command center.'],
  ['Portfolio', 'Read positions, fills, balances, and performance without mixing identity with custody.'],
  ['Token Analyzer', 'Inspect tokens, pools, holders, and market structure before committing attention or capital.'],
  ['Deployment Command Center', 'Plan launch configuration and preflight checks while deployment remains explicitly gated.']
] as const;

const safety = ['Turnkey identity', 'Browser-wallet signing', 'Simulation-gated execution', 'No server key custody', 'Broadcast disabled until approved'];

export function BondrLandingPage() {
  const account = useBondrTurnkeyAccount();
  const [loginOpen, setLoginOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function login() {
    if (!account.configured || !account.clientReady) return;
    setBusy(true);
    setMessage('Opening Turnkey secure login…');
    try {
      await account.login();
      setLoginOpen(false);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Turnkey login did not complete.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bondrLandingShell">
      <section className="bondrLandingHero">
        <div className="bondrLandingAura" />
        <div className="bondrLandingMark" aria-label="BONDR">
          <span>B</span><span className="bondrLandingO">O</span><span>N</span><span>D</span><span>R</span>
        </div>
        <div className="bondrLandingEyebrow">Solana command platform</div>
        <h1>The command layer for Solana launches.</h1>
        <p className="bondrLandingLead">BONDR unifies launch planning, wallet ops, liquidity tooling, token intelligence, portfolio reads, and browser-wallet execution gates into one operator-grade terminal.</p>
        <div className="bondrLandingActions">
          <button type="button" onClick={() => setLoginOpen(true)}>Enter BONDR</button>
          <a href="#platform">Explore platform</a>
        </div>
        <div className="bondrLandingChips">{safety.map((item) => <span key={item}>{item}</span>)}</div>
      </section>

      <section id="platform" className="bondrLandingModules" aria-label="BONDR platform modules">
        <div className="bondrLandingSectionHead"><span>Platform</span><h2>One operating surface for launch, liquidity, and intelligence.</h2></div>
        <div className="bondrLandingModuleGrid">
          {modules.map(([title, copy]) => <article key={title}><span>{title}</span><p>{copy}</p></article>)}
        </div>
      </section>

      <section className="bondrLandingSafety">
        <div><span>Execution safety</span><h2>Identity is not custody. Login is not execution.</h2></div>
        <p>Turnkey secures operator identity. Browser wallets remain the signing authority. Simulation is required before signing, signer mismatch blocks signing, and broadcast/deployment/funding stay disabled unless explicitly enabled in a separate approval phase.</p>
      </section>

      <section className="bondrLandingWhy">
        <span>Why BONDR</span>
        <h2>Built for operators, not tourists.</h2>
        <p>One command hub for Solana speed: launch records, liquidity workflows, wallet readiness, token intelligence, and execution policy in a single professional surface.</p>
      </section>

      {loginOpen && (
        <div className="landingLoginBackdrop" role="dialog" aria-modal="true" aria-label="Log in to BONDR">
          <div className="landingLoginModal">
            <div className="landingLoginGlow" />
            <div className="landingLoginLogo">B</div>
            <div className="eyebrow">Turnkey identity</div>
            <h2>Log in to BONDR</h2>
            <p>Turnkey secures your operator identity. Browser wallets remain the signing authority.</p>
            <div className="landingLoginMicrocopy">No seed phrases. No server-side private key custody. Execution remains policy and simulation gated.</div>
            {message && <p className="qaMuted">{message}</p>}
            <div className="landingLoginActions">
              <button type="button" onClick={() => void login()} disabled={!account.configured || !account.clientReady || busy}>{busy ? 'Opening…' : account.configured ? 'Continue with Turnkey' : 'Turnkey unavailable'}</button>
              <button type="button" onClick={() => setLoginOpen(false)}>Not now</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
