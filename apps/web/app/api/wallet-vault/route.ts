import { mutationMeta } from '../../../lib/mutation-safety';
import { vaultStatus } from '../../../lib/wallet-vault';

export const dynamic = 'force-dynamic';

function noStore(json: unknown, status = 200) {
  return Response.json(json, { status, headers: { 'cache-control': 'no-store, no-cache, must-revalidate, private' } });
}

export async function GET() {
  return noStore({
    status: 'ok',
    vault: vaultStatus(),
    managedWallets: [],
    ...mutationMeta('Vault status only; server-side private-key custody is disabled.'),
    execution: 'vault-status-no-secrets'
  });
}

export async function POST() {
  return noStore({
    status: 'blocked',
    error: 'Server-side wallet vault custody is disabled. Use Phantom/Solflare browser-wallet signing or track public addresses only.',
    ...mutationMeta('Wallet vault mutation rejected; no private keys are accepted, generated, decrypted, exported, signed, or broadcast.'),
    execution: 'wallet-vault-server-custody-disabled'
  }, 403);
}
