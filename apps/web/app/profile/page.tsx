import { TurnkeyProfileLogin } from './components/TurnkeyProfileLogin';
import { OperatorSessionLogin } from './components/OperatorSessionLogin';
import { WalletRailStatus } from '../components/WalletRailStatus';

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  return (
    <main>
      <div className="contentShell">
        <section className="documentHero compactHero">
          <div className="eyebrow">Profile</div>
          <h1>Operator account</h1>
          <p>Secure account access for Bond.Terminal operators. Use Turnkey identity and the protected operator session before accessing gated transaction-building flows.</p>
        </section>
        <OperatorSessionLogin />
        <WalletRailStatus surface="profile" />
        <TurnkeyProfileLogin />
      </div>
    </main>
  );
}
