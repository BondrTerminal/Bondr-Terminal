import { hydrateWalletBalances, displayWalletSol } from '../../lib/chain-hydration';
import { buildMeridianHubContext } from '../../lib/meridian-context';
import { getMeridianWalletStore } from '../../lib/durable-wallet-store';
import { WalletRailStatus } from '../components/WalletRailStatus';

export const dynamic = 'force-dynamic';

function shortAddress(address: string) { return `${address.slice(0, 6)}…${address.slice(-5)}`; }

type WalletsPageProps = { searchParams?: Promise<{ project?: string }> };

export default async function WalletsPage({ searchParams }: WalletsPageProps) {
  const params = await searchParams;
  const store = await getMeridianWalletStore();
  const hubContext = buildMeridianHubContext(params?.project ?? null, store);
  const selectedContext = hubContext.activeProjectId ? hubContext.projects[0] : undefined;
  const selectedProject = selectedContext?.project;
  const hydration = await hydrateWalletBalances(store.wallets);
  const wallets = (selectedProject ? hydration.wallets.filter((wallet) => wallet.groupId === selectedProject.walletGroupId) : hydration.wallets).filter((wallet) => !wallet.archived);
  const selectedAddress = wallets[0]?.address ?? null;

  return (
    <main className="walletBoardPage">
      <div className="walletBoardPageShell cleanProductShell">
        <section className="launchStationHero documentHero oceanHero">
          <div>
            <div className="eyebrow">Wallet Ops</div>
            <h1>Connect and select a real wallet.</h1>
            <p>A-profile uses your browser wallet for signing. Wallet Ops stores public watch-only records only for matching, labels, and balance display.</p>
          </div>
          <div className="launchHeroStatus">
            <span>Saved wallets</span>
            <strong>{wallets.length}</strong>
            <em>{selectedProject?.name ?? 'Global wallet inventory'} · real saved records only</em>
          </div>
        </section>

        <WalletRailStatus surface="wallets" selectedWalletAddress={selectedAddress} activeMint={selectedContext?.terminal.mint ?? null} />

        <section className="documentCard realWalletInventoryPanel">
          <div className="sectionIntro compactIntro">
            <span>Saved Wallets</span>
            <h2>Public wallet records</h2>
            <p>Only real saved public addresses appear here. Empty state is intentional until you add your connected signer or a watch-only address.</p>
          </div>
          <div className="walletListWrap cleanWalletListWrap">
            <div className="walletList" role="table" aria-label="Saved wallet records">
              <div className="walletListRow walletListHead" role="row"><span>Wallet</span><span>Address</span><span>Type</span><span>Balance</span><span>Source</span><span>Status</span></div>
              {wallets.map((wallet) => (
                <div className="walletListRow" role="row" key={wallet.id}>
                  <strong>{wallet.role}</strong>
                  <code>{shortAddress(wallet.address)}</code>
                  <span>{wallet.custodyMode === 'managed-local' ? 'managed unavailable' : 'watch-only'}</span>
                  <span>{wallet.balanceStatus === 'live' ? `${displayWalletSol(wallet).toFixed(5)} SOL` : wallet.balanceStatus === 'provider-limited' ? 'provider-limited' : wallet.balanceStatus === 'modeled' ? 'modeled · SOL not live' : 'unavailable'}</span>
                  <small>{wallet.balanceSource} · {wallet.balanceStatus}</small>
                  <em>{wallet.status}</em>
                </div>
              ))}
            </div>
          </div>
          {wallets.length === 0 && <div className="emptyProductState"><strong>No saved wallets yet.</strong><p>Connect Phantom/Solflare above, then use “Add connected signer as watch-only wallet.” That stores only the public address. Your browser wallet still signs.</p></div>}
        </section>

        <section className="walletBoardSafetyFooter cleanActionFooter">
          <strong>A-profile wallet rules</strong>
          <span>Signable means the connected browser signer equals the selected/saved public address. No private keys, sends, funding, deployment, claims, payouts, or broadcast are available from Wallet Ops.</span>
          <a href={selectedProject ? `/deployment?project=${selectedProject.id}` : '/deployment'}>Open Deployment</a>
          <a href={selectedProject ? `/sniper?project=${selectedProject.id}` : '/sniper'}>Open Terminal</a>
          <a href="/live-beta-test">Open Live Beta Test</a>
        </section>
      </div>
    </main>
  );
}
