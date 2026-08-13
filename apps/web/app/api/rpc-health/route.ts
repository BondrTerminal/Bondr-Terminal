import { getSolanaRpcHealth } from '../../../lib/rpc-health';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({ status: 'ok', rpc: await getSolanaRpcHealth(), execution: 'read-only-rpc-health' }, { headers: { 'cache-control': 'no-store' } });
}
