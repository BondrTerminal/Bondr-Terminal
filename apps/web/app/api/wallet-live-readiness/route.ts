import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { getSolanaRpcHealth } from '../../../lib/rpc-health';
import { walletLiveReadiness } from '../../../lib/meridian-live-readiness';
import { meridianAuthConfig, meridianRequestAuthenticated } from '../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const store = await getMeridianWalletStore();
  const rpc = await getSolanaRpcHealth();
  const session = await meridianRequestAuthenticated(request);
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    rpc,
    auth: { ...meridianAuthConfig(), authenticated: session.authenticated, reason: session.reason },
    readiness: walletLiveReadiness({ rpc, wallets: store.wallets }),
    execution: 'read-only-live-readiness-no-signing'
  }, { headers: { 'cache-control': 'no-store' } });
}
