import { AuthenticatedHub } from './AuthenticatedHub';
import { HomeGate } from './components/HomeGate';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <HomeGate authenticated={<AuthenticatedHub />} />;
}
