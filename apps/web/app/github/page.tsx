export const dynamic = 'force-dynamic';

const repoItems = [
  ['Status', 'Private/local development repo currently deployed to a Vercel preview.'],
  ['Current focus', 'Meridian hub, Project Cockpit, Wallet Ops, Deployment engine, Sniper token intelligence, and Liquidity Engine.'],
  ['Engine foundation', 'Backend-wired market-maker/scalper runtime with risk model, observed market data, order lifecycle, reports, and tests.'],
  ['Preview limits', 'Public repo URL, issue tracker, release notes, and contributor guide are not configured yet.'],
  ['Safety', 'No private keys, funded-wallet actions, live trading, token deployment, pool creation, or signing in this UI stage.']
];

const localDocs = [
  ['Technical Brief', '/whitebackend-wired'],
  ['Project Cockpit', '/projects/meridian-demo'],
  ['Wallet Ops', '/wallets'],
  ['Deployment', '/deployment'],
  ['Liquidity Engine', '/liquidity']
];

export default function GitHubPage() {
  return (
    <main>
      <div className="contentShell">
        <section className="documentHero">
          <div className="eyebrow">Repository</div>
          <h1>Code and status hub</h1>
          <p>Internal project status surface for the Meridian preview. Add the public GitHub URL only when the repository is ready to expose.</p>
        </section>

        <section className="documentCard repoPanel">
          <div className="repoHeader">
            <div>
              <span className="mutedLabel">Project</span>
              <strong>Meridian Solana command hub</strong>
            </div>
            <a className="button secondary" href="/api/health">Check health</a>
          </div>
          <div className="infoGrid repoInfo">
            {repoItems.map(([label, value]) => (
              <div className="sideRow" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="documentCard repoPanel">
          <div className="sectionIntro compactIntro"><span>Local docs</span><h2>Preview documentation links</h2></div>
          <div className="linkStack">
            {localDocs.map(([label, href]) => <a href={href} key={href}><strong>{label}</strong><span>{href}</span></a>)}
          </div>
        </section>
      </div>
    </main>
  );
}
