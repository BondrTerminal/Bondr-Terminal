const modules = [
  { href: '/projects', label: 'Projects', title: 'Project Dashboard', body: 'Create real project records, inspect stored launch state, and route into Deployment, Terminal, Wallets, and Portfolio.', state: 'Real records only' },
  { href: '/deployment', label: 'Deployment', title: 'Launch Configuration', body: 'Configure metadata, launch path, and wallet roles. Deployment execution, funding, signing, and broadcast are disabled.', state: 'Configure only' },
  { href: '/sniper', label: 'Terminal', title: 'Trading Terminal', body: 'Token context, active wallet, quote, unsigned transaction build, simulation, and browser-wallet signing eligibility.', state: 'Simulation first' },
  { href: '/wallets', label: 'Wallets', title: 'Wallet Ops', body: 'Connect a browser wallet, set the active wallet, and save public watch-only addresses for matching and balance reads.', state: 'Browser wallet signs' },
  { href: '/portfolio', label: 'Portfolio', title: 'Portfolio', body: 'Read provider-backed wallet balances, holdings, stored flow events, and PnL when data is available.', state: 'Read-only accounting' },
  { href: '/liquidity', label: 'Liquidity', title: 'Liquidity Probe', body: 'Inspect token pool, route, liquidity, price, and quote context. LP actions remain disabled.', state: 'Read-only probe' }
];

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main>
      <div className="mainWebsiteShell cleanProductShell">
        <section className="mainHero">
          <div className="heroCopy">
            <div className="eyebrow">BONDR</div>
            <h1>Solana launch operating system.</h1>
            <p>One active-wallet model across Projects, Wallet Ops, Terminal, Deployment, Portfolio, and Liquidity. Browser-wallet signing is gated by simulation, signer matching, and execution policy.</p>
            <div className="heroActions">
              <a className="button" href="/wallets">Connect Wallet</a>
              <a className="button secondary" href="/sniper">Open Terminal</a>
              <a className="button secondary" href="/deployment">Configure Deployment</a>
            </div>
          </div>
          <div className="heroSignalCard" aria-label="BONDR current product status">
            <span>Execution policy</span>
            <strong>Simulation-gated signing</strong>
            <p>Browser wallet signs only after quote, unsigned build, and simulation. Broadcast and deployment execution are separate gates and are off.</p>
            <div className="signalRows">
              <div><span>Wallet</span><strong>Browser signer</strong></div>
              <div><span>Terminal</span><strong>Quote/build/simulate</strong></div>
              <div><span>Broadcast</span><strong>Disabled</strong></div>
            </div>
          </div>
        </section>

        <section className="moduleGrid websiteModules" aria-label="BONDR modules">
          {modules.map((module) => (
            <a className="moduleCard" href={module.href} key={module.href}>
              <span>{module.label}</span>
              <h2>{module.title}</h2>
              <p>{module.body}</p>
              <strong>{module.state}</strong>
            </a>
          ))}
        </section>

        <section className="websiteSection">
          <div className="sectionIntro">
            <span>Safety contract</span>
            <h2>Real data only. No hidden execution.</h2>
            <p>Empty project and wallet states are intentional. If a provider is limited, BONDR says provider-limited instead of showing invented balances or seeded rows.</p>
          </div>
          <div className="disclosureList">
            {['No server custody or private-key requests.', 'No hidden custody, surprise broadcasts, or unsigned execution paths.', 'Signing eligibility requires a connected browser signer that matches the selected wallet and a successful simulation first.'].map((item) => <p key={item}>{item}</p>)}
          </div>
        </section>
      </div>
    </main>
  );
}
