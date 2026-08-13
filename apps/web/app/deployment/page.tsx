import { buildMeridianHubContext } from '../../lib/meridian-context';
import { getMeridianWalletStore } from '../../lib/durable-wallet-store';
import { getSolanaRpcHealth } from '../../lib/rpc-health';
import { LaunchConfigEditor } from './components/LaunchConfigEditor';
import { CreateProjectLauncher } from '../components/CreateProjectLauncher';
import { WalletRailStatus } from '../components/WalletRailStatus';

export const dynamic = 'force-dynamic';

type DeploymentPageProps = { searchParams?: Promise<{ project?: string; launchPathPreview?: string; controlledWallet?: string }> };

export default async function DeploymentPage({ searchParams }: DeploymentPageProps) {
  const params = await searchParams;
  const rpc = await getSolanaRpcHealth();
  const store = await getMeridianWalletStore();
  const hubContext = buildMeridianHubContext(params?.project ?? null, store);
  const activeContext = hubContext.activeProjectId ? hubContext.projects[0] : hubContext.projects[0];

  return (
    <main className="launchStationMain">
      <div className="contentShell launchStationShell cleanProductShell">
        <section className="launchStationHero documentHero oceanHero deploymentHero">
          <div>
            <div className="eyebrow">Deployment</div>
            <h1>Configure launch. Deployment disabled.</h1>
            <p>Use this page for real project configuration and launch-wallet selection. Token deployment, funding, and broadcast are disabled in A-profile.</p>
          </div>
          <div className="launchHeroStatus">
            <span>Active project</span>
            <strong>{activeContext?.project.name ?? 'No project selected'}</strong>
            <em>{activeContext ? `${activeContext.project.ticker} · ${activeContext.project.launchPath}` : `Create a project · ${rpc.selectedProviderLabel}`}</em>
          </div>
        </section>

        <WalletRailStatus surface="deployment" selectedWalletAddress={activeContext?.wallets[0]?.address ?? null} activeMint={activeContext?.terminal.mint ?? null} />

        <section className="deploymentAdapterReadiness" aria-label="Deployment adapter status">
          <strong>Deployment disabled in A-profile. Configure only.</strong>
          <p>Pump.fun, Raydium, Meteora, and Bonk launch paths require unsigned deployment builders, simulation, and separate B/C-profile approval before any wallet signature or broadcast path is exposed.</p>
          <div className="deploymentAdapterGrid">
            {['Pump.fun', 'Raydium', 'Meteora', 'Bonk'].map((adapter) => <div key={adapter}><span>{adapter}</span><strong>Disabled</strong><small>Unsigned builder not enabled · no broadcast</small></div>)}
          </div>
        </section>

        {activeContext ? <LaunchConfigEditor project={activeContext.project} wallets={activeContext.wallets} /> : <CreateProjectLauncher mode="compact" title="Create Project" label="Create Project" copy="Create a real project before configuring deployment. No token is deployed and no wallet is funded." className="bottomQuickDeployPanel" />}
      </div>
    </main>
  );
}
