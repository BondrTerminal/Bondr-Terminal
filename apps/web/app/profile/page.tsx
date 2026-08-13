import { ProfileLogin } from './components/ProfileLogin';
import { TurnkeyProfileLogin } from './components/TurnkeyProfileLogin';
import { OperatorSessionLogin } from './components/OperatorSessionLogin';
import { LiveBetaStatus } from '../components/LiveBetaStatus';
import { WalletRailStatus } from '../components/WalletRailStatus';

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  return (
    <main>
      <div className="contentShell">
        <section className="documentHero compactHero">
          <div className="eyebrow">Profile</div>
          <h1>Operator account</h1>
          <p>Operator login for Bond.Terminal profiles. A-profile live beta allows browser-wallet signing tests after simulation; broadcast, deployment, funding, and server custody stay gated off.</p>
        </section>
        <LiveBetaStatus surface="profile" />
        <OperatorSessionLogin />
        <WalletRailStatus surface="profile" />
        <section className="documentCard"><div className="sectionIntro compactIntro"><span>Manual QA</span><h2>A-profile signing test harness</h2><p>Use the harness to test quote, unsigned build, simulation, and browser-wallet signing as separate phases. Broadcast remains disabled.</p></div><a className="button secondary" href="/live-beta-test">Open Live Beta Test</a></section>
        <TurnkeyProfileLogin />
        <ProfileLogin />
      </div>
    </main>
  );
}
