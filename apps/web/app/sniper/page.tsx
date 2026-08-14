import { buildMeridianHubContext } from '../../lib/meridian-context';
import { getMeridianWalletStore } from '../../lib/durable-wallet-store';
import Link from 'next/link';
import { meridianAuthConfig, meridianSessionStatus } from '../../lib/meridian-auth';
import { walletLiveReadiness } from '../../lib/meridian-live-readiness';
import { buildPreLiveChecklist } from '../../lib/pre-live-checklist';
import { getSolanaRpcHealth } from '../../lib/rpc-health';
import { ExecutionDock } from './components/ExecutionDock';
import { TradingTokenLoader } from './components/TradingTokenLoader';
import { TerminalInfoBooth } from './components/TerminalInfoBooth';
import { TokenCockpitHeader } from './components/TokenCockpitHeader';
import { WalletRailStatus } from '../components/WalletRailStatus';

export const dynamic = 'force-dynamic';

type SniperPageProps = { searchParams?: Promise<{ mint?: string; project?: string }> };

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_ADDRESS_IN_TEXT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const USDC_MAINNET_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function extractMint(input: string | null | undefined) {
  const trimmed = (input ?? '').trim();
  if (SOLANA_ADDRESS_RE.test(trimmed)) return trimmed;
  const matches = trimmed.match(SOLANA_ADDRESS_IN_TEXT_RE) ?? [];
  return matches.find((candidate) => SOLANA_ADDRESS_RE.test(candidate)) ?? '';
}

export default async function SniperPage({ searchParams }: SniperPageProps) {
  const params = await searchParams;
  const store = await getMeridianWalletStore();
  const hubContext = buildMeridianHubContext(params?.project ?? null, store);
  const selectedContext = hubContext.activeProjectId ? hubContext.projects[0] : undefined;
  const selectedProject = selectedContext?.project;
  const defaultMint = extractMint(params?.mint) || extractMint(selectedContext?.terminal.mint) || USDC_MAINNET_MINT;
  const tradingWallets = (selectedContext ? selectedContext.wallets : store.wallets).filter((wallet) => !wallet.archived).slice(0, 12);
  const selectedWallet = tradingWallets[0] ?? null;
  const flow = selectedContext?.portfolio.flow30d ?? null;
  const selectedWalletLabel = selectedWallet ? `${selectedWallet.role} · ${selectedWallet.address.slice(0, 4)}…${selectedWallet.address.slice(-4)}` : 'Connect browser wallet';
  const rpcHealth = await getSolanaRpcHealth();
  const authConfig = meridianAuthConfig();
  const session = await meridianSessionStatus();
  const liveReadiness = walletLiveReadiness({ rpc: rpcHealth, wallets: selectedContext?.wallets ?? store.wallets });
  const preLiveChecklist = buildPreLiveChecklist({ project: selectedProject ?? null, wallets: selectedContext?.wallets ?? store.wallets, rpc: rpcHealth, auth: session });
  const terminalWarning = selectedProject ? null : 'No project selected. Terminal can still inspect a token, but wallet selection comes from connected browser wallet or saved Wallet Ops records.';

  return (
    <main className="terminalMainSurface">
      <div className="axiomTerminalShell premiumTerminalShell cleanProductShell">
        <section className="terminalCompactProjectStrip" aria-label="Terminal context">
          <div><span>{selectedProject ? 'Project terminal' : 'Terminal'}</span><strong>{selectedProject?.name ?? 'Token trading terminal'}</strong><small>{terminalWarning ?? 'Quote, build unsigned transaction, simulate, then sign locally in browser wallet. Broadcast remains disabled.'}</small></div>
          <nav aria-label="Terminal links"><Link href={selectedProject ? `/deployment?project=${encodeURIComponent(selectedProject.id)}` : '/deployment'}>Deployment</Link><Link href={selectedProject ? `/portfolio?view=wallets&project=${encodeURIComponent(selectedProject.id)}` : '/portfolio?view=wallets'}>Wallets</Link><Link href="/live-beta-test">Live Beta Test</Link></nav>
        </section>

        <WalletRailStatus surface="terminal" selectedWalletAddress={selectedWallet?.address ?? null} activeMint={defaultMint || null} />
        <TokenCockpitHeader mint={defaultMint} />
        <section className="axiomTradeGrid premiumTradeGrid compactTradeGrid">
          <section className="terminalChartColumn premiumChartColumn">
            <TradingTokenLoader defaultMint={defaultMint} devWallets={tradingWallets.map((wallet) => wallet.address)} />
          </section>
          <ExecutionDock mint={defaultMint} selectedWalletLabel={selectedWalletLabel} wallets={tradingWallets} />
        </section>

        <TerminalInfoBooth
          wallets={tradingWallets}
          flow={flow}
          mint={defaultMint}
          projectId={selectedProject?.id}
          projectName={selectedProject?.name ?? null}
          terminalWarning={terminalWarning}
          liveReadinessStatus={liveReadiness.status}
          authConfigured={authConfig.configured}
          sessionAuthenticated={session.authenticated}
          rpcSummary={{ status: rpcHealth.status, providerLabel: rpcHealth.selectedProviderLabel, quotaLimited: rpcHealth.quotaLimited, configuredProviderCount: rpcHealth.configuredProviderCount, providerSummary: rpcHealth.providerSummary, currentSlot: rpcHealth.currentSlot ?? null, providers: rpcHealth.providers.map((provider) => ({ label: provider.providerLabel, status: provider.status, quotaLimited: Boolean(provider.quotaLimited), latencyMs: provider.latencyMs ?? null, currentSlot: provider.currentSlot ?? null })) }}
          checklist={{ state: preLiveChecklist.state, failed: preLiveChecklist.failed, warnings: preLiveChecklist.warnings, items: preLiveChecklist.items }}
        />
      </div>
    </main>
  );
}
