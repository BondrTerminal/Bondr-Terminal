import { meridianObligationMatrix } from '../lib/obligation-matrix';

const modules = [
  {
    href: '/liquidity',
    label: 'Flagship module',
    title: 'Autonomous Liquidity Engine',
    body: 'Live-wired cockpit for observed capital, exposure, inventory drift, wallet flow, quote cadence, risk, and engine state.',
    state: 'Live operations'
  },
  {
    href: '/sniper',
    label: 'Trading module',
    title: 'Trading Terminal',
    body: 'Read-only terminal for token context, wallet selection, route previews, holdings context, and disabled action surfaces.',
    state: 'Obligation: analyze, not trade' 
  },
  {
    href: '/token-analyzer',
    label: 'Analysis module',
    title: 'Token Analyzer',
    body: 'Dedicated token scan workspace for pair/liquidity graphing, supply/authority checks, holder-risk labels, transaction feed, and parser-pending rows.',
    state: 'Obligation: label source truth' 
  },
  {
    href: '/deployment',
    label: 'Launch module',
    title: 'Token Deployment Hub',
    body: 'Read-only launch workspace that stores metadata, launch path, funding plan, wallet readiness, liquidity policy, and blocked execution gates.',
    state: 'Obligation: preflight only'
  },
  {
    href: '/projects',
    label: 'Management module',
    title: 'Project Management',
    body: 'Data-backed workspace for project objects, pending launches, deployed tokens, CTO states, readiness, next actions, and cockpit links.',
    state: 'Obligation: coordinate state'
  },
  {
    href: '/project-dashboard',
    label: 'Accounting module',
    title: 'Project Dashboard',
    body: 'Read-only accounting dashboard for today/30-day net SOL flow. Tracks sells minus buys and explicitly excludes tokens still held.',
    state: 'Obligation: account, not execute'
  },
  {
    href: '/wallets',
    label: 'Operator module',
    title: 'Wallet Operations',
    body: 'Live wallet dashboard with groups, live balance labels, readiness, funding/collection gates, and wallet-ops engine status.',
    state: 'Obligation: inspect wallets'
  }
];

const infoLinks = [
  { href: '/whitepaper', label: 'Whitepaper', detail: 'Product thesis, module roadmap, and safety doctrine.' },
  { href: '/github', label: 'GitHub', detail: 'Repository/status surface for code, issues, releases, and docs.' },
  { href: '/profile', label: 'Profile', detail: 'Turnkey identity and operator session surface with browser-wallet execution gates.' }
];

const socialLinks = [
  { label: 'X / Twitter', href: '#', detail: 'external link not configured' },
  { label: 'Discord', href: '#', detail: 'external link not configured' },
  { label: 'Telegram', href: '#', detail: 'external link not configured' },
  { label: 'Docs', href: '/whitepaper', detail: 'local' }
];


const disclosures = [
  'Bond.Terminal is now a Bond.Terminal Solana command hub. The product obligation is live data, explicit gates, and browser-wallet signed execution paths.',
  'Each section must show its backend route, live data source, and execution gate state.',
  'Broadcast, wallet funding, token deployment, LP actions, claims/payouts, private-key flows, and server signing remain gated.',
  'Funded execution stays behind operator auth, simulation, browser-wallet signatures, signed-intent review, risk caps, confirmation paths, and audit logs.'
];

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main>
      <div className="mainWebsiteShell">
        <section className="mainHero">
          <div className="heroCopy">
            <div className="eyebrow">Bond.Terminal</div>
            <h1>Solana command hub for liquidity, trading, and operator workflows.</h1>
            <p>
              Bond.Terminal is being built as a premium operating layer for developers and project operators:
              autonomous liquidity first, then coordinated project management, deployment prep, trading intelligence, accounting, and wallet operations.
            </p>
            <div className="heroActions">
              <a className="button" href="/liquidity">Open Liquidity Engine</a>
              <a className="button secondary" href="/whitepaper">Read Whitepaper</a>
              <a className="button secondary" href="/github">GitHub</a>
            </div>
          </div>
          <div className="heroSignalCard" aria-label="Bond.Terminal current product status">
            <span>Current focus</span>
            <strong>Autonomous Liquidity Engine</strong>
            <p>Live scalping / market-making cockpit with capital, exposure, inventory, risk, wallet flow, and engine state.</p>
            <div className="signalRows">
              <div><span>Status</span><strong>Live wired</strong></div>
              <div><span>Execution</span><strong>Live gated</strong></div>
              <div><span>Live funds</span><strong>Disabled</strong></div>
            </div>
          </div>
        </section>

        <section className="websiteSection">
          <div className="sectionIntro">
            <span>What Bond.Terminal is</span>
            <h2>A hub, not a single dashboard.</h2>
            <p>
              Bond.Terminal houses multiple Solana operator tools around a shared project object. The flagship product remains the automated
              market-maker/scalper, while Projects, Deployment, Wallet Ops, Sniper, and Project Dashboard now coordinate as supporting surfaces.
            </p>
          </div>
        </section>

        <section className="moduleGrid websiteModules" aria-label="Bond.Terminal modules">
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
            <span>Read-only obligation matrix</span>
            <h2>What each section is responsible for right now.</h2>
            <p>
              This is Bond.Terminal’s current contract: every module must be honest about whether it is reading live chain data,
              showing backend route state, live indexer data, wallet-signing requirements, or execution gates.
            </p>
          </div>
          <div className="projectTable" role="table" aria-label="Bond.Terminal read-only obligation matrix">
            <div className="projectRow bondrMatrixRow projectHead" role="row">
              <span>Section</span><span>Current obligation</span><span>Source of truth</span><span>Blocked / not implied</span>
            </div>
            {meridianObligationMatrix.map((row) => (
              <div className="projectRow bondrMatrixRow" role="row" key={row.section}>
                <strong>{row.section}</strong>
                <span>{row.obligation}</span>
                <em>{row.source}</em>
                <small>{row.blocked}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="websiteSplit">
          <div className="documentCard websiteInfoCard">
            <div className="sectionIntro compactIntro">
              <span>Information</span>
              <h2>Project links</h2>
            </div>
            <div className="linkStack">
              {infoLinks.map((link) => (
                <a href={link.href} key={link.href}>
                  <strong>{link.label}</strong>
                  <span>{link.detail}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="documentCard websiteInfoCard">
            <div className="sectionIntro compactIntro">
              <span>Community</span>
              <h2>Community links</h2>
            </div>
            <div className="socialGrid">
              {socialLinks.map((link) => (
                <a href={link.href} key={link.label} aria-disabled={link.href === '#'}>
                  <strong>{link.label}</strong>
                  <span>{link.detail}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="disclosurePanel" aria-label="Product disclosure">
          <div>
            <span>Disclosure</span>
            <h2>Development-stage product.</h2>
          </div>
          <ul>
            {disclosures.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>
    </main>
  );
}
