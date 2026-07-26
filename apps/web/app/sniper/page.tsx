import { displayWalletSol, hydrateWalletBalances } from '../../lib/chain-hydration';
import { getMeridianStore, getProject, projectFlow, walletsForGroup } from '../../lib/meridian-store';
import { ExecutionDock } from './components/ExecutionDock';
import { TradingTokenLoader } from './components/TradingTokenLoader';
import { TerminalInfoBooth } from './components/TerminalInfoBooth';
import { TerminalTopBar } from './components/TerminalTopBar';

export const dynamic = 'force-dynamic';

type SniperPageProps = {
  searchParams?: Promise<{ mint?: string; project?: string }>;
};

export default async function SniperPage({ searchParams }: SniperPageProps) {
  const params = await searchParams;
  const store = getMeridianStore();
  const selectedProject = params?.project ? getProject(params.project, store) : undefined;
  const defaultMint = params?.mint ?? selectedProject?.tokenMint ?? '';
  const projectWallets = selectedProject ? walletsForGroup(selectedProject.walletGroupId, store).filter((wallet) => !wallet.archived) : [];
  const globalWallets = store.wallets.filter((wallet) => wallet.scope === 'global' && !wallet.archived);
  const tradingLabWallets = store.wallets.filter((wallet) => wallet.groupId === 'trading-lab' && !wallet.archived);
  const walletMap = new Map([...projectWallets, ...tradingLabWallets, ...globalWallets].map((wallet) => [wallet.id, wallet]));
  const hydrated = await hydrateWalletBalances([...walletMap.values()].slice(0, 12));
  const tradingWallets = hydrated.wallets.map((wallet) => ({ ...wallet, balanceSol: displayWalletSol(wallet) }));
  const selectedWallet = tradingWallets[0];
  const flow = selectedProject ? projectFlow(selectedProject.id, store) : null;
  const activeProjectName = selectedProject ? `${selectedProject.name} / ${selectedProject.ticker}` : 'No project attached';
  const selectedWalletLabel = selectedWallet ? `${selectedWallet.role} · ${selectedWallet.address.slice(0, 4)}…${selectedWallet.address.slice(-4)}` : 'Default wallet';

  return (
    <main className="terminalMainSurface">
      <div className="axiomTerminalShell premiumTerminalShell">
        <TerminalTopBar
          projectName={activeProjectName}
          defaultMint={defaultMint}
          selectedWallet={selectedWallet ? `${selectedWallet.address.slice(0, 4)}…${selectedWallet.address.slice(-4)}` : 'Default'}
          walletCount={tradingWallets.length}
        />

        <section className="axiomTradeGrid premiumTradeGrid">
          <section className="terminalChartColumn premiumChartColumn">
            <TradingTokenLoader defaultMint={defaultMint} devWallets={tradingWallets.map((wallet) => wallet.address)} />
          </section>

          <ExecutionDock mint={defaultMint} selectedWalletLabel={selectedWalletLabel} wallets={tradingWallets} />
        </section>

        <TerminalInfoBooth wallets={tradingWallets} flow={flow} mint={defaultMint} projectId={selectedProject?.id} />
      </div>
    </main>
  );
}
