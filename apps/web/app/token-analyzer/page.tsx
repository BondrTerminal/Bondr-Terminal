import { getProject } from '../../lib/meridian-store';
import { getMeridianWalletStore } from '../../lib/durable-wallet-store';
import { TokenIntelLookup } from '../sniper/components/TokenIntelLookup';

export const dynamic = 'force-dynamic';

const analyzerSignals = [
  ['Wallet type', 'Fresh / New / Old classification by first seen activity and funding pattern.'],
  ['Wallet balance', 'SOL balance and concentration view for notable holders and project wallets.'],
  ['Token balances', 'Token inventory per tracked wallet, top holder, and dev-wallet category.'],
  ['Average holding time', 'Estimated hold duration across buyers, sellers, insiders, and fresh wallets.'],
  ['Holder quality', 'Fresh-wallet cluster risk, top-holder concentration, recurring wallets, and churn.'],
  ['Liquidity route', 'Pool count, DEX routes, liquidity depth, 24h volume, FDV/market-cap context.'],
  ['Trading behavior', 'Buy/sell pressure, early exits, repeat traders, and suspicious timing clusters.'],
  ['Safety flags', 'Low liquidity, missing pool age, heavy concentration, unknown deployer, and dev-token exposure.']
];

const walletAgeRows = [
  ['Fresh wallets', 'Indexer route', 'Helius enhanced transaction feed is wired through /api/token-transactions when HELIUS_API_KEY or Helius RPC api-key is configured.'],
  ['New wallets', 'Indexer route', 'Launch-window wallet-age classification reads from the configured transaction indexer; unavailable rows now report source status instead of unsupported values.'],
  ['Old wallets', 'Indexer route', 'Historical wallet depth requires Helius/Birdeye credentials and returns explicit provider status when not configured.'],
  ['Average hold', 'Indexer route', 'Hold-time classification is derived from token transaction rows when the enhanced indexer returns usable trade history.']
];

const holderRows = [
  ['Top holder', 'Live in scan', 'Use the scan module above: RPC/RugCheck returns largest-holder concentration when available.'],
  ['Top 10 holders', 'Live in scan', 'Token stats endpoint reads largest accounts through configured RPC/Helius, with RugCheck fallback.'],
  ['Dev wallet', 'Project wallets only', 'Dev-holding calculation works when project/dev wallet addresses are passed to token-stats.'],
  ['Token balances', 'RPC live where configured', 'Wallet-level SPL token balances need selected wallets plus reliable RPC; unsupported rows are labeled explicitly.']
];

const actionRows = [
  ['Analyze token', 'Run DexScreener pair/liquidity scan and render projection graph.'],
  ['Send to Trading Terminal', 'Routes reviewed mint into the Trading Terminal; Jupiter preview and browser-wallet live path are gated there.'],
  ['Attach to project', 'Future flow: bind token mint to Project Cockpit / Deployment monitor.'],
  ['Export report', 'Future flow: export token due-diligence summary for partners/operators.']
];

type TokenAnalyzerProps = { searchParams?: Promise<{ mint?: string; project?: string }> };

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_ADDRESS_IN_TEXT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function extractMint(input: string | null | undefined) {
  const trimmed = (input ?? '').trim();
  if (SOLANA_ADDRESS_RE.test(trimmed)) return trimmed;
  const matches = trimmed.match(SOLANA_ADDRESS_IN_TEXT_RE) ?? [];
  return matches.find((candidate) => SOLANA_ADDRESS_RE.test(candidate)) ?? '';
}

export default async function TokenAnalyzerPage({ searchParams }: TokenAnalyzerProps) {
  const params = await searchParams;
  const store = await getMeridianWalletStore();
  const selectedProject = params?.project ? getProject(params.project, store) : undefined;
  const defaultMint = extractMint(params?.mint) || extractMint(selectedProject?.tokenMint) || '';

  return (
    <main>
      <div className="contentShell">
        <section className="documentHero oceanHero tokenAnalyzerHero">
          <div className="eyebrow">Token Analyzer</div>
          <h1>Scan and analyze tokens before action.</h1>
          <p>
            Dedicated token due-diligence module for contract scans, route/liquidity graphing,
            wallet freshness, holder quality, token balances, average holding time, and risk review.
          </p>
        </section>

        {selectedProject && (
          <section className="documentCard selectedProjectBanner">
            <span>Selected project</span>
            <strong>{selectedProject.name}</strong>
            <p>{selectedProject.tokenMint ? `Project mint loaded: ${selectedProject.tokenMint}` : 'No project mint exists yet. Paste a token mint manually.'}</p>
            <a href={`/projects/${selectedProject.id}`}>Open project cockpit</a>
          </section>
        )}

        <section className="analyzerLayoutGrid">
          <section className="analyzerScanColumn">
            <TokenIntelLookup defaultMint={defaultMint} />
          </section>

          <aside className="documentCard analyzerControlsPanel">
            <div className="sectionIntro compactIntro">
              <span>Actions</span>
              <h2>Analyzer controls</h2>
              <p>Clear next steps after scanning. Route preview and browser-wallet execution are handled inside the Trading Terminal with live-mode gates.</p>
            </div>
            <div className="taskQueueList">
              {actionRows.map(([label, detail]) => (
                <div className="taskQueueItem analyzerActionItem" key={label}>
                  <strong>{label}</strong>
                  <em>{detail}</em>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="moduleCapabilityGrid analyzerSignalGrid" aria-label="Token analyzer signals">
          {analyzerSignals.map(([title, body]) => (
            <article className="documentCard compactCapability" key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </section>

        <section className="analyzerDataGrid">
          <section className="documentCard">
            <div className="sectionIntro compactIntro"><span>Wallets</span><h2>Wallet type / holding-time model</h2></div>
            <div className="projectTable" role="table" aria-label="Wallet freshness and holding time">
              <div className="projectRow analyzerRow projectHead"><span>Signal</span><span>Value</span><span>Meaning</span></div>
              {walletAgeRows.map(([signal, value, meaning]) => <div className="projectRow analyzerRow" key={signal}><strong>{signal}</strong><span>{value}</span><em>{meaning}</em></div>)}
            </div>
          </section>

          <section className="documentCard">
            <div className="sectionIntro compactIntro"><span>Holders</span><h2>Holder / token balance review</h2></div>
            <div className="projectTable" role="table" aria-label="Holder token balance review">
              <div className="projectRow analyzerRow projectHead"><span>Signal</span><span>Value</span><span>Meaning</span></div>
              {holderRows.map(([signal, value, meaning]) => <div className="projectRow analyzerRow" key={signal}><strong>{signal}</strong><span>{value}</span><em>{meaning}</em></div>)}
            </div>
          </section>
        </section>

        <section className="documentCard analyzerBoundaryPanel">
          <div className="sectionIntro compactIntro"><span>Boundary</span><h2>What is live vs expected</h2></div>
          <p>
            Live now: DexScreener pair/liquidity/volume scan, RPC/Helius token supply and authority checks,
            RugCheck/RPC holder concentration where available, Jupiter route preview, Gecko/Birdeye/Helius transaction feeds,
            route-health projection graph, and explicit indexer source status. Next accuracy upgrade: deeper wallet-age classifier and average holding-time model on top of Helius/Birdeye history,
            deeper wallet graph clustering, and exportable token report.
          </p>
        </section>
      </div>
    </main>
  );
}
