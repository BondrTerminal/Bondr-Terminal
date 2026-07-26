const briefSections = [
  {
    title: 'Product state',
    body: 'Meridian is a backend-wired Solana project command center. Surfaces expose route state, live RPC/indexer reads, browser-wallet signing requirements, and server-side execution gates.'
  },
  {
    title: 'Liquidity engine',
    body: 'The Liquidity Engine indexes pools, scans LP lock/burn state, previews Jupiter routes, exposes terminal backend state, and gates unsigned transaction builders behind browser-wallet signing.'
  },
  {
    title: 'Trading terminal',
    body: 'The terminal connects token intelligence, market feed, transaction tape, wallet balances, terminal orders, bundle sequencer, Jupiter quote/build routes, and signed transaction broadcast gates.'
  },
  {
    title: 'Deployment',
    body: 'Deployment connects metadata, launch path, funding plan, wallet readiness, SPL mint builders, bundle sequencer status, and guarded transaction paths.'
  },
  {
    title: 'Wallet Ops',
    body: 'Wallet Ops tracks active wallets, archived wallets, wallet groups, live balance labels, group readiness, wallet events, and wallet-ops engine status. Private-key custody stays inside wallet providers.'
  },
  {
    title: 'Execution policy',
    body: 'Funded actions require explicit gates: browser-wallet signing, server live switch, size/slippage caps, route preflight, and audit-visible backend state.'
  }
];

const moduleMatrix = [
  ['Liquidity Engine', 'Index pools, scan LP lock/burn state, and expose route-gated builders.'],
  ['Trading Terminal', 'Store/evaluate/cancel/replace terminal orders and build gated Jupiter transactions.'],
  ['Wallet Ops', 'Read balances and build gated unsigned fund/collect transactions.'],
  ['Deployment', 'Build guarded SPL token mint transactions and expose launch preflight state.'],
  ['Projects', 'Persist project records locally and expose module links/readiness state.']
];

export default function TechnicalBriefPage() {
  return (
    <main>
      <div className="contentShell routeContextShell">
        <section className="documentHero oceanHero">
          <div className="eyebrow">Technical Brief</div>
          <h1>Meridian backend wiring doctrine.</h1>
          <p>Each module must connect visible UI state to a backend route, live data source, browser-wallet signer, or explicit execution gate.</p>
        </section>

        <section className="moduleGrid routeContextGrid">
          {briefSections.map((section) => (
            <article className="documentCard" key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>

        <section className="documentCard whitepaperMatrixPanel">
          <div className="sectionIntro compactIntro">
            <span>Module contract</span>
            <h2>Backend source-of-truth matrix</h2>
            <p>Each module exposes route-backed state instead of local filler copy.</p>
          </div>
          <div className="projectTable" role="table" aria-label="Backend source-of-truth matrix">
            <div className="projectRow whitepaperMatrixRow projectHead"><span>Module</span><span>Backend-wired capability</span></div>
            {moduleMatrix.map(([module, capability]) => (
              <div className="projectRow whitepaperMatrixRow" key={module}><strong>{module}</strong><em>{capability}</em></div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
