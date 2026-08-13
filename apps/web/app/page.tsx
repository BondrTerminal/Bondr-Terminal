import { AuthenticatedHub } from './AuthenticatedHub';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <AuthenticatedHub />;
}
