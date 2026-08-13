import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const RAYDIUM_AMM_V4 = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';
const ORCA_WHIRLPOOL = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
const ORCA_SWAP_V2 = '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP';
const PUMPSWAP_AMM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const METEORA_DLMM_PROGRAMS = new Set(['LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo']);
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

type LpModel = 'fungible-lp' | 'nft-position' | 'bin-liquidity' | 'unknown';
type LockBurnApplicability = 'applicable' | 'not-applicable-position-model' | 'unsupported-layout' | 'unresolved' | 'manual-lp-mint';
type LpResolution = { status: string; ownerProgram: string | null; lpMint: string | null; lpModel: LpModel; lockBurnApplicability: LockBurnApplicability; reason: string; nextCredentialNeeded: string | null };

function publicKeyFromData(data: Buffer, offset: number) {
  if (data.length < offset + 32) return null;
  const bytes = data.subarray(offset, offset + 32);
  if (bytes.every((byte) => byte === 0)) return null;
  try { return new PublicKey(bytes).toBase58(); } catch { return null; }
}

async function resolveLpMint(connection: Connection, poolAddress: string, dex?: string | null, kind?: string | null): Promise<LpResolution> {
  const info = await connection.getAccountInfo(new PublicKey(poolAddress), 'confirmed');
  const lowerDex = `${dex ?? ''} ${kind ?? ''}`.toLowerCase();
  if (!info) return { status: 'missing', ownerProgram: null, lpMint: null, lpModel: lowerDex.includes('meteora') ? 'bin-liquidity' : 'unknown', lockBurnApplicability: 'unresolved', reason: 'Pool account not found on RPC.', nextCredentialNeeded: 'A reachable RPC/indexer that can read the pool account.' };
  const ownerProgram = info.owner.toBase58();
  if (ownerProgram === RAYDIUM_AMM_V4) {
    const lpMint = publicKeyFromData(Buffer.from(info.data), LP_MINT_OFFSET_RAYDIUM_V4);
    return { status: lpMint ? 'resolved' : 'unresolved', ownerProgram, lpMint, lpModel: 'fungible-lp', lockBurnApplicability: lpMint ? 'applicable' : 'unresolved', reason: lpMint ? 'Resolved fungible LP mint from Raydium AMM v4 layout.' : 'Raydium AMM v4 pool detected but LP mint offset was empty/unreadable.', nextCredentialNeeded: lpMint ? null : 'Raydium AMM v4 layout verification for this pool account.' };
  }
  if (ownerProgram === RAYDIUM_CLMM) return { status: 'position-model', ownerProgram, lpMint: null, lpModel: 'nft-position', lockBurnApplicability: 'not-applicable-position-model', reason: 'Raydium CLMM uses position accounts/NFT-style liquidity, so fungible LP burned percentage is not applicable.', nextCredentialNeeded: 'Raydium CLMM position indexer to inspect position ownership/lock status.' };
  if (ownerProgram === ORCA_WHIRLPOOL) return { status: 'position-model', ownerProgram, lpMint: null, lpModel: 'nft-position', lockBurnApplicability: 'not-applicable-position-model', reason: 'Orca Whirlpool uses position accounts/NFT-style liquidity, so fungible LP burned percentage is not applicable.', nextCredentialNeeded: 'Orca Whirlpool position indexer to inspect position ownership/lock status.' };
  if (METEORA_DLMM_PROGRAMS.has(ownerProgram) || lowerDex.includes('meteora')) return { status: 'position-model', ownerProgram, lpMint: null, lpModel: 'bin-liquidity', lockBurnApplicability: 'not-applicable-position-model', reason: 'Meteora DLMM liquidity is bin/position based; fungible LP burned percentage is not the correct safety metric.', nextCredentialNeeded: 'Meteora DLMM position/bin liquidity indexer to inspect owner distribution and locks.' };
  if (ownerProgram === ORCA_SWAP_V2) return { status: 'unsupported-layout', ownerProgram, lpMint: null, lpModel: 'fungible-lp', lockBurnApplicability: 'unsupported-layout', reason: 'Legacy Orca swap pool appears fungible-LP based, but LP mint decoding is not implemented yet.', nextCredentialNeeded: 'Legacy Orca swap pool layout decoder.' };
  if (ownerProgram === PUMPSWAP_AMM || lowerDex.includes('pumpswap')) return { status: 'unsupported-layout', ownerProgram, lpMint: null, lpModel: 'fungible-lp', lockBurnApplicability: 'unsupported-layout', reason: 'PumpSwap pool appears AMM/fungible-liquidity based, but LP mint/position decoding is not implemented yet.', nextCredentialNeeded: 'PumpSwap pool layout decoder or provider endpoint exposing LP/lock state.' };
  return { status: 'unsupported-layout', ownerProgram, lpMint: null, lpModel: 'unknown', lockBurnApplicability: 'unsupported-layout', reason: 'Pool owner program layout is unsupported for LP mint resolution.', nextCredentialNeeded: 'Protocol-specific pool layout decoder or indexer.' };
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
      ? { status: 'resolved', ownerProgram: null, lpMint: target.lpMint, lpModel: 'fungible-lp' as LpModel, lockBurnApplicability: 'manual-lp-mint' as LockBurnApplicability, reason: 'LP mint passed explicitly.', nextCredentialNeeded: null }
      : target.pairAddress ? await resolveLpMint(connection, target.pairAddress, target.dex, target.kind).catch((error) => ({ status: 'unavailable', ownerProgram: null, lpMint: null, lpModel: 'unknown' as LpModel, lockBurnApplicability: 'unresolved' as LockBurnApplicability, reason: error instanceof Error ? error.message : 'LP mint resolution failed.', nextCredentialNeeded: 'RPC/indexer access and protocol-specific decoder.' }))
      : { status: 'unresolved', ownerProgram: null, lpMint: null, lpModel: 'unknown' as LpModel, lockBurnApplicability: 'unresolved' as LockBurnApplicability, reason: 'No pool address.', nextCredentialNeeded: 'Pool address from DexScreener/provider.' };
    const lpScan = resolution.lpMint ? await scanLpMint(connection, resolution.lpMint).catch((error) => ({ error: error instanceof Error ? error.message : 'LP scan failed.' })) : null;
    return { dex: target.dex ?? target.kind ?? null, kind: target.kind ?? null, pairAddress: target.pairAddress ?? null, liquidityUsd: target.liquidityUsd ?? null, url: target.url ?? null, lpModel: resolution.lpModel, lpMintStatus: resolution.status, lockBurnApplicability: resolution.lockBurnApplicability, reason: resolution.reason, nextCredentialNeeded: resolution.nextCredentialNeeded, ownerProgram: resolution.ownerProgram, lpMint: resolution.lpMint, note: resolution.reason, lpScan };
  }));

  const models = Array.from(new Set(scans.map((scan) => scan.lpModel)));
  const lockBurnApplicability = scans.some((scan) => scan.lockBurnApplicability === 'applicable' || scan.lockBurnApplicability === 'manual-lp-mint') ? 'applicable' : scans.some((scan) => scan.lockBurnApplicability === 'not-applicable-position-model') ? 'not-applicable-position-model' : scans.some((scan) => scan.lockBurnApplicability === 'unsupported-layout') ? 'unsupported-layout' : 'unresolved';
  const resolvedLpMints = scans.filter((scan) => scan.lpMint).length;
  return Response.json({ status: resolvedLpMints ? 'partial' : scans.some((scan) => scan.lockBurnApplicability === 'not-applicable-position-model') ? 'classified-partial' : 'partial', observedAt: new Date().toISOString(), mint, source: 'dexscreener+solana-rpc', rpcProvider: rpc.provider, verificationScope: resolvedLpMints ? 'lp-mint-holder-scan-only' : 'pool-classification-only', confidence: resolvedLpMints && configuredLockerAddresses().size > 0 ? 'partial-provider-backed' : 'partial', summary: { poolsScanned: scans.length, lpMintsResolved: resolvedLpMints, unresolvedPools: scans.filter((scan) => !scan.lpMint).length, lpModels: models, lockBurnApplicability, unsupportedLayouts: scans.filter((scan) => scan.lockBurnApplicability === 'unsupported-layout').length, positionModelPools: scans.filter((scan) => scan.lockBurnApplicability === 'not-applicable-position-model').length, note: 'LP lock/burn scanner reports only what it can verify from RPC plus configured locker addresses; unsupported or position-model pools remain unknown until a protocol indexer is connected.' }, scans, execution: 'live-index-read' });
}
