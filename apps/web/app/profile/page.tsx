import { ProfileLogin } from './components/ProfileLogin';
import { TurnkeyProfileLogin } from './components/TurnkeyProfileLogin';

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  return (
    <main>
      <div className="contentShell">
        <section className="documentHero compactHero">
          <div className="eyebrow">Profile</div>
          <h1>Operator account</h1>
          <p>Operator login for Meridian profiles. Turnkey is used when configured; browser-wallet read-only login works locally without secrets. Signing and live trading stay gated.</p>
        </section>
        <TurnkeyProfileLogin />
        <ProfileLogin />
      </div>
    </main>
  );
}
