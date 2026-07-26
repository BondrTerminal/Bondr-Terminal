import { getMeridianStore } from '../../../lib/meridian-store';
import { hydrateWalletBalances } from '../../../lib/chain-hydration';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const group = searchParams.get('group')?.trim();
  const includeArchived = searchParams.get('includeArchived') === 'true';
  const store = getMeridianStore();
  const wallets = store.wallets.filter((wallet) => (!group || wallet.groupId === group) && (includeArchived || !wallet.archived));
  const hydrated = await hydrateWalletBalances(wallets);

  return Response.json({
    status: 'ok',
    provider: hydrated.provider,
    configured: hydrated.configured,
    observedAt: hydrated.observedAt,
    wallets: hydrated.wallets.map((wallet) => ({
      id: wallet.id,
      role: wallet.role,
      address: wallet.address,
      groupId: wallet.groupId,
      scope: wallet.scope,
      modeledBalanceSol: wallet.balanceSol,
      chainBalanceSol: wallet.chainBalanceSol,
      balanceSol: wallet.chainBalanceSol ?? wallet.balanceSol,
      balanceStatus: wallet.balanceStatus,
      balanceSource: wallet.balanceSource,
      balanceNote: wallet.balanceNote,
      archived: Boolean(wallet.archived)
    })),
    execution: 'read-only'
  });
}
