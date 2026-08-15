export const dynamic = 'force-dynamic';

const repoItems = [
  ['Status', 'Private/local development repo deployed through Vercel.'],
  ['Current focus', 'Wallet Ops, active-wallet consistency, Terminal quote/build/simulate/sign flow, Deployment configuration, and honest provider-limited data states.'],
  ['Execution gates', 'A-profile supports simulation-gated browser-wallet signing only. Broadcast, deployment execution, funding, claims, payouts, server custody, and hidden swaps remain disabled.'],
  ['Publishing limits', 'Public repo URL, issue tracker, release notes, and contributor guide are not configured.']
];

const localDocs = [
  ['Projects', '/projects'],
  ['Portfolio Wallets', '/portfolio?view=wallets'],
  ['Deployment', '/deployment'],
  ['Terminal', '/sniper'],
  ['Liquidity', '/liquidity']
];

export default function GitHubPage() {
  return (
    <main>
      <div className="contentShell cleanProductShell">
        <section className="documentHero">
          <div className="eyebrow">Repository</div>
          <h1>Code and deployment status.</h1>
          <p>Internal status surface for BONDR. This page links to active product areas and states the execution gates without showing non-final roadmap panels.</p>
        </section>

        <section className="documentCard repoPanel">
          <div className="repoHeader"><div><span className="mutedLabel">Project</span><strong>Bond.Terminal</strong></div><a className="button secondary" href="/api/health">Check health</a></div>
          <div className="infoGrid repoInfo">{repoItems.map(([label, value]) => <div className="sideRow" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        </section>

        <section className="documentCard repoPanel">
          <div className="sectionIntro compactIntro"><span>Product links</span><h2>Active surfaces</h2></div>
          <div className="linkStack">{localDocs.map(([label, href]) => <a href={href} key={href}><strong>{label}</strong><span>{href}</span></a>)}</div>
        </section>
      </div>
    </main>
  );
}
