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
          <p>Secure account access for Bond.Terminal operators. Use Turnkey identity, the protected operator session, and browser-wallet signing gates before transaction-building workflows.</p>
        </section>
        <LiveBetaStatus surface="profile" />
        <OperatorSessionLogin />
        <WalletRailStatus surface="profile" />
        <TurnkeyProfileLogin />
        <ProfileLogin />
      </div>
    </main>
  );
}
