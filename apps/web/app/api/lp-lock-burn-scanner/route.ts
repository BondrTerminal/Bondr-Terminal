import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const RAYDIUM_AMM_V4 = '675kPX9MHTjS2zt1qfr1NYVAk7nhCN6gYNLtvi1Vhwz';
const LP_MINT_OFFSET_RAYDIUM_V4 = 464;
const BURN_ADDRESSES = new Set([
  '1nc1nerator11111111111111111111111111111111',
  '11111111111111111111111111111111'
]);

function configuredLockerAddresses() {
  return new Set((process.env.LP_LOCKER_ADDRESSES ?? '').split(',').map((x) => x.trim()).filter((x) => ADDRESS_RE.test(x)));
}

async function poolIndex(origin: string, mint: string) {
  const response = await fetch(`${origin}/api/token-pool-index?mint=${mint}`, { cache: 'no-store' });
  if (!response.ok) return [] as Array<{ dex?: string; kind?: string; pairAddress?: string; liquidityUsd?: number; url?: string }>;
  const payload = await response.json() as { pairs?: Array<{ dex?: string; kind?: string; pairAddress?: string; liquidityUsd?: number; url?: string }> };
  return payload.pairs ?? [];
}

function publicKeyFromData(data: Buffer, offset: number) {
  if (data.length < offset + 32) return null;
  const bytes = data.subarray(offset, offset + 32);
  if (bytes.every((byte) => byte === 0)) return null;
  try { return new PublicKey(bytes).toBase58(); } catch { return null; }
}

async function resolveLpMint(connection: Connection, poolAddress: string) {
  const info = await connection.getAccountInfo(new PublicKey(poolAddress), 'confirmed');
  if (!info) return { status: 'missing', ownerProgram: null, lpMint: null, note: 'Pool account not found on RPC.' };
  const ownerProgram = info.owner.toBase58();
  if (ownerProgram === RAYDIUM_AMM_V4) {
    const lpMint = publicKeyFromData(Buffer.from(info.data), LP_MINT_OFFSET_RAYDIUM_V4);
    return { status: lpMint ? 'resolved' : 'unresolved', ownerProgram, lpMint, note: lpMint ? 'Resolved LP mint from Raydium AMM v4 pool layout.' : 'Raydium v4 pool detected but LP mint offset was empty/unreadable.' };
  }
  return { status: 'unresolved', ownerProgram, lpMint: null, note: 'Pool owner program layout is unsupported layout yet for LP mint resolution.' };
}

async function scanLpMint(connection: Connection, lpMint: string) {
  const mintPk = new PublicKey(lpMint);
  const [supply, largest] = await Promise.all([
    connection.getTokenSupply(mintPk, 'confirmed'),
    connection.getTokenLargestAccounts(mintPk, 'confirmed')
  ]);
  const lockers = configuredLockerAddresses();
  const decimals = supply.value.decimals;
  const totalRaw = BigInt(supply.value.amount || '0');
  let burnedRaw = 0n;
  let lockedRaw = 0n;
  const holders = await Promise.all(largest.value.slice(0, 20).map(async (holder) => {
    const account = await connection.getParsedAccountInfo(holder.address, 'confirmed');
    const parsed = account.value?.data && 'parsed' in account.value.data ? account.value.data.parsed as { info?: { owner?: string } } : null;
    const owner = parsed?.info?.owner ?? null;
    const raw = BigInt(holder.amount || '0');
    const burn = owner ? BURN_ADDRESSES.has(owner) : false;
    const locked = owner ? lockers.has(owner) : false;
    if (burn) burnedRaw += raw;
    if (locked) lockedRaw += raw;
    return { tokenAccount: holder.address.toBase58(), owner, rawAmount: holder.amount, uiAmount: holder.uiAmount, pct: totalRaw > 0n ? Number((raw * 10_000n) / totalRaw) / 100 : null, burn, locked };
  }));
  const burnedPct = totalRaw > 0n ? Number((burnedRaw * 10_000n) / totalRaw) / 100 : null;
  const lockedPct = totalRaw > 0n ? Number((lockedRaw * 10_000n) / totalRaw) / 100 : null;
  return { supply: { amount: supply.value.amount, uiAmountString: supply.value.uiAmountString, decimals }, burnedPct, lockedPct, burnedRaw: burnedRaw.toString(), lockedRaw: lockedRaw.toString(), lockerAddressCount: lockers.size, topHolders: holders };
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim();
  const explicitLpMint = searchParams.get('lpMint')?.trim();
  if (!mint || !ADDRESS_RE.test(mint)) return Response.json({ error: 'Missing or invalid mint.' }, { status: 400 });
  if (explicitLpMint && !ADDRESS_RE.test(explicitLpMint)) return Response.json({ error: 'Invalid lpMint.' }, { status: 400 });

  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  const pairs = await poolIndex(origin, mint);
  const targets = explicitLpMint
    ? [{ dex: 'manual', kind: 'manual', pairAddress: null, lpMint: explicitLpMint, liquidityUsd: null, url: null }]
    : pairs.slice(0, 8).map((pair) => ({ ...pair, lpMint: null as string | null }));

  const scans = await Promise.all(targets.map(async (target) => {
    const resolution = target.lpMint
      ? { status: 'resolved', ownerProgram: null, lpMint: target.lpMint, note: 'LP mint passed explicitly.' }
      : target.pairAddress ? await resolveLpMint(connection, target.pairAddress).catch((error) => ({ status: 'unavailable', ownerProgram: null, lpMint: null, note: error instanceof Error ? error.message : 'LP mint resolution failed.' }))
      : { status: 'unresolved', ownerProgram: null, lpMint: null, note: 'No pool address.' };
    const lpScan = resolution.lpMint ? await scanLpMint(connection, resolution.lpMint).catch((error) => ({ error: error instanceof Error ? error.message : 'LP scan failed.' })) : null;
    return { dex: target.dex ?? target.kind ?? null, pairAddress: target.pairAddress ?? null, liquidityUsd: target.liquidityUsd ?? null, url: target.url ?? null, lpMintStatus: resolution.status, ownerProgram: resolution.ownerProgram, lpMint: resolution.lpMint, note: resolution.note, lpScan };
  }));

  return Response.json({ status: 'ok', observedAt: new Date().toISOString(), mint, source: 'dexscreener+solana-rpc', rpcProvider: rpc.provider, summary: { poolsScanned: scans.length, lpMintsResolved: scans.filter((scan) => scan.lpMint).length, unresolvedPools: scans.filter((scan) => !scan.lpMint).length }, scans, execution: 'live-index-read' });
}
