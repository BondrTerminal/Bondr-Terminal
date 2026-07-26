import { MockWalletConnect } from '../components/MockWalletConnect';
import { LiquidityBackendStatus } from './components/LiquidityBackendStatus';
import { LiquidityEngineProbe } from './components/LiquidityEngineProbe';

export const dynamic = 'force-dynamic';

const engineCapabilities = [
  ['Pool index', 'Reads live Solana pool venues, liquidity, volume, pair count, and best route context.'],
  ['LP scanner', 'Inspects pool accounts on-chain, resolves supported LP mints, and checks burn/locker ownership.'],
  ['Route preview', 'Uses Jupiter quote previews before any swap transaction is built.'],
  ['Browser signing', 'Live actions require browser-wallet approval; server custody is intentionally blocked.'],
  ['Risk gates', 'Server caps max SOL/USDC, slippage, and live-mode availability before building transactions.'],
  ['Backend status', 'Shows route readiness, wallet balance reads, execution gates, and engine status from /api/terminal-backend.']
];

const engineWorkflow = [
  ['01', 'Index pools', 'Read live pair, venue, liquidity, and volume state.'],
  ['02', 'Inspect LP', 'Resolve supported LP mints and scan lock/burn distribution.'],
  ['03', 'Preview route', 'Use Jupiter quotes for route, impact, and amount checks.'],
  ['04', 'Build unsigned tx', 'Only when live gate is enabled and wallet signing is required.'],
  ['05', 'Broadcast signed tx', 'Only after the browser wallet signs and the server broadcaster accepts it.']
];

export default async function LiquidityPage() {
  return (
    <main>
      <div className="contentShell liquidityCommandShell">
        <section className="documentHero oceanHero liquidityHero">
          <div className="eyebrow">Flagship Module</div>
          <h1>Liquidity Engine.</h1>
          <p>
            Live-read liquidity cockpit for pool discovery, LP lock/burn inspection, Jupiter route preview,
            browser-wallet signing gates, and backend engine readiness before any funded action goes live.
          </p>
        </section>

        <section className="moduleCapabilityGrid" aria-label="Liquidity Engine capabilities">
          {engineCapabilities.map(([title, body]) => (
            <article className="documentCard compactCapability" key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </section>

        <LiquidityEngineProbe />

        <section className="documentCard engineWorkflowPanel">
          <div className="sectionIntro compactIntro">
            <span>Structure</span>
            <h2>Engine operating loop</h2>
            <p>The module now surfaces live index/scanner routes first, then transaction builders only behind explicit gates.</p>
          </div>
          <div className="workflowGrid engineWorkflowGrid">
            {engineWorkflow.map(([index, title, body]) => (
              <article className="workflowStep" key={index}>
                <span>{index}</span>
                <strong>{title}</strong>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="terminalShell focusedTerminal embeddedTerminalShell">
          <MockWalletConnect />
          <LiquidityBackendStatus />
        </section>
      </div>
    </main>
  );
}
