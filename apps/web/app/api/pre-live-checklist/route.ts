import { buildMeridianHubContext } from '../../../lib/meridian-context';
import { meridianRequestAuthenticated } from '../../../lib/meridian-auth';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { buildPreLiveChecklist } from '../../../lib/pre-live-checklist';
import { getSolanaRpcHealth } from '../../../lib/rpc-health';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const store = await getMeridianWalletStore();
  const hubContext = buildMeridianHubContext(url.searchParams.get('project'), store);
  const selectedContext = hubContext.projects[0] ?? null;
  const rpc = await getSolanaRpcHealth();
  const auth = await meridianRequestAuthenticated(request);
  const checklist = buildPreLiveChecklist({
    project: selectedContext?.project ?? null,
    wallets: selectedContext?.wallets ?? store.wallets.filter((wallet) => !wallet.archived),
    rpc,
    auth
  });
  return Response.json({ status: 'ok', checklist, execution: 'read-only-pre-live-checklist-no-signing-no-swaps-no-broadcasts' }, { headers: { 'cache-control': 'no-store' } });
}
