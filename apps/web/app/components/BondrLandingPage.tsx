'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useBondrTurnkeyAccount } from './TurnkeyAccountProvider';

const commandModules = [
  ['01', 'Terminal', 'Quote → build → simulate → browser-sign readiness, with intent review before any broadcast path.'],
  ['02', 'Liquidity Engine', 'Market-maker and scalper operations with capital, exposure, inventory, risk, and engine state.'],
  ['03', 'Wallet Ops', 'Signer readiness, wallet groups, balances, funding gates, and operational routing without server key custody.'],
  ['04', 'Projects', 'Launch records, project state, metadata, wallet policy, readiness, and next-action coordination.'],
  ['05', 'Portfolio', 'Positions, fills, flow, and performance reads across the operator surface.'],
  ['06', 'Deployment', 'Launch command center for preflight planning while deployment execution remains explicitly locked.']
] as const;

const safety = ['Turnkey identity', 'Browser-wallet signer', 'Simulation required', 'Intent review', 'Broadcast locked'];
const metrics = [
  ['Signer', 'Browser wallet'],
  ['Execution', 'Policy gated'],
  ['Broadcast', 'Disabled'],
  ['Deployment', 'Disabled']
] as const;

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
      <section className="bondrLandingHero" aria-label="BONDR command landing">
        <div className="bondrHeroNoise" />
        <div className="bondrHeroOrb one" />
        <div className="bondrHeroOrb two" />

        <div className="bondrLandingTopline">
          <div className="bondrLandingWordmark">
            <Image src="/brand/bondr-wordmark.svg" alt="BONDR" width={720} height={180} priority />
          </div>
          <div className="bondrAccessPill"><span /> Private operator terminal</div>
        </div>

        <div className="bondrHeroGrid">
          <div className="bondrHeroCopy">
            <div className="bondrLandingEyebrow">Solana launch command layer</div>
            <h1>Launch, route, and operate from one terminal.</h1>
            <p className="bondrLandingLead">
              BONDR is the command room for Solana operators: liquidity tooling, trading intelligence, project state, wallet operations,
              portfolio reads, and deployment planning — tied together with Turnkey identity and browser-wallet execution gates.
            </p>
            <div className="bondrLandingActions">
              <button type="button" onClick={() => setLoginOpen(true)}>Enter BONDR</button>
              <a href="#command-grid">View command stack</a>
            </div>
            <div className="bondrLandingChips">{safety.map((item) => <span key={item}>{item}</span>)}</div>
          </div>

          <aside className="bondrCommandPanel" aria-label="BONDR status terminal">
            <div className="bondrPanelHeader"><span /> BONDR / COMMAND STATUS</div>
            <div className="bondrScope">
              <div className="bondrScopeRing" />
              <div className="bondrScopeCross h" />
              <div className="bondrScopeCross v" />
              <strong>READY</strong>
            </div>
            <div className="bondrMetricGrid">
              {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
            <div className="bondrTerminalLines" aria-label="Execution policy">
              <p><span>$</span> identity.turnkey: configured</p>
              <p><span>$</span> signer.mode: browser-wallet</p>
              <p><span>$</span> simulation.required: true</p>
              <p><span>$</span> broadcast.enabled: false</p>
            </div>
          </aside>
        </div>
      </section>

      <section id="command-grid" className="bondrCommandStack" aria-label="BONDR platform modules">
        <div className="bondrLandingSectionHead">
          <span>Command stack</span>
          <h2>Every surface has a job. Every action has a gate.</h2>
          <p>The platform is designed around operator flow: discover, prepare, simulate, sign, review, and only then consider enabled execution.</p>
        </div>
        <div className="bondrCommandGrid">
          {commandModules.map(([index, title, copy]) => (
            <article key={title}>
              <em>{index}</em>
              <strong>{title}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bondrDoctrineBand">
        <div>
          <span>Operator doctrine</span>
          <h2>Speed without sloppy custody.</h2>
        </div>
        <p>
          Login identifies the operator. It does not move funds. Browser wallets remain the signer, simulation stays mandatory,
          signer mismatch blocks signing, and broadcast/deployment/funding remain locked until a separate hardening phase explicitly enables them.
        </p>
      </section>

      <section className="bondrFinalStatement">
        <span>Built for operators, not spectators.</span>
        <h2>One premium command hub for the people actually launching.</h2>
      </section>

      {loginOpen && (
        <div className="landingLoginBackdrop" role="dialog" aria-modal="true" aria-label="Log in to BONDR">
          <div className="landingLoginModal">
            <div className="landingLoginGlow" />
            <Image className="landingLoginWordmark" src="/brand/bondr-wordmark.svg" alt="BONDR" width={360} height={90} />
            <div className="eyebrow">Turnkey identity</div>
            <h2>Enter the terminal.</h2>
            <p>Turnkey secures your operator identity. Browser wallets remain the signing authority.</p>
            <div className="landingLoginMicrocopy">No seed phrases. No server-side private key custody. Execution remains policy, simulation, and intent-review gated.</div>
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
