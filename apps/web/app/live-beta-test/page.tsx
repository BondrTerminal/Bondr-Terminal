import { WalletRailStatus } from '../components/WalletRailStatus';
import { AProfileManualQaPanel } from './components/AProfileManualQaPanel';

export const dynamic = 'force-dynamic';

export default function LiveBetaTestPage() {
  return (
    <main>
      <div className="contentShell liveBetaTestShell">
        <section className="documentHero compactHero">
          <div className="eyebrow">A-profile QA</div>
          <h1>Manual live-beta signing test harness.</h1>
          <p>Phase-by-phase operator test for quote, unsigned build, simulation, and browser-wallet signing. Broadcast, deployment, funding, claims, and payouts remain disabled. Provider-limited: simulation may fail until RPC plan is upgraded/reset.</p>
        </section>
        <WalletRailStatus surface="live-beta-test" />
        <AProfileManualQaPanel />
      </div>
    </main>
  );
}
