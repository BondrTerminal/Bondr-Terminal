import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

type Json = Record<string, unknown>;
type LpModel = 'nft-position' | 'bin-liquidity' | 'unknown';
type Confidence = 'low' | 'medium' | 'high';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TIMEOUT_MS = 12_000;
const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';
const ORCA_WHIRLPOOL = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
const METEORA_DLMM_PROGRAMS = new Set(['LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo']);

function objectValue(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function numberOrNull(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

async function readJson<T = Json>(origin: string, path: string, signal: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(`${origin}${path}`, { cache: 'no-store', signal });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

function classify(ownerProgram: string | null, dex?: string | null, kind?: string | null): { lpModel: LpModel; positionIndexStatus: string; lockStatus: string; limitations: string[]; confidence: Confidence } {
  const label = `${dex ?? ''} ${kind ?? ''}`.toLowerCase();
  if (ownerProgram === RAYDIUM_CLMM) return { lpModel: 'nft-position', positionIndexStatus: 'classified-position-model-indexer-required', lockStatus: 'unknown-indexer-required', confidence: 'low', limitations: ['Raydium CLMM pool detected, but owner concentration is not verified until CLMM position accounts/NFTs are indexed for this pool.', 'Fungible LP burn percentage is not applicable to this position model.'] };
  if (ownerProgram === ORCA_WHIRLPOOL) return { lpModel: 'nft-position', positionIndexStatus: 'classified-position-model-indexer-required', lockStatus: 'unknown-indexer-required', confidence: 'low', limitations: ['Orca Whirlpool pool detected, but owner concentration is not verified until Whirlpool position accounts/NFTs are indexed for this pool.', 'Fungible LP burn percentage is not applicable to this position model.'] };
  if ((ownerProgram && METEORA_DLMM_PROGRAMS.has(ownerProgram)) || label.includes('meteora')) return { lpModel: 'bin-liquidity', positionIndexStatus: 'classified-bin-liquidity-indexer-required', lockStatus: 'unknown-indexer-required', confidence: 'low', limitations: ['Meteora DLMM/bin pool detected or inferred, but owner concentration is not verified until a DLMM position/bin liquidity indexer is connected.', 'Fungible LP burn percentage is not applicable to this bin-liquidity model.'] };
  return { lpModel: 'unknown', positionIndexStatus: 'unsupported-layout', lockStatus: 'lock-index-unavailable', confidence: 'low', limitations: ['Pool is not a recognized position-based layout or the owner program was unavailable.', 'Protocol-specific position indexer is required before owner concentration can be estimated.'] };
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim() ?? '';
  const explicitPool = searchParams.get('pool')?.trim() ?? '';
  if (!ADDRESS_RE.test(mint)) return Response.json({ status: 'error', error: 'Missing or invalid mint.', execution: 'read-only-position-index-no-trading' }, { status: 400 });
  if (explicitPool && !ADDRESS_RE.test(explicitPool)) return Response.json({ status: 'error', error: 'Invalid pool address.', execution: 'read-only-position-index-no-trading' }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '12') || 12, 1), 30);
  try {
    const rpc = configuredSolanaRpc();
    const connection = new Connection(rpc.url, 'confirmed');
    const qMint = encodeURIComponent(mint);
    const [poolIndex, lpScan] = await Promise.all([
      readJson(origin, `/api/token-pool-index?mint=${qMint}`, controller.signal),
      readJson(origin, `/api/lp-lock-burn-scanner?mint=${qMint}`, controller.signal)
    ]);
    const pairs = Array.isArray(poolIndex?.pairs) ? poolIndex.pairs as Json[] : [];
    const lpScans = Array.isArray(lpScan?.scans) ? lpScan.scans as Json[] : [];
    const targets = (explicitPool ? pairs.filter((pair) => pair.pairAddress === explicitPool) : pairs).slice(0, limit);
    const pools = await Promise.all(targets.map(async (pair) => {
      const pairAddress = String(pair.pairAddress ?? '');
      const matchedScan = lpScans.find((scan) => scan.pairAddress === pairAddress);
      let ownerProgram = typeof matchedScan?.ownerProgram === 'string' ? matchedScan.ownerProgram : null;
      if (!ownerProgram && ADDRESS_RE.test(pairAddress)) {
        const info = await connection.getAccountInfo(new PublicKey(pairAddress), 'confirmed').catch(() => null);
        ownerProgram = info?.owner.toBase58() ?? null;
      }
      const classified = classify(ownerProgram, String(pair.dex ?? ''), String(pair.kind ?? ''));
      const positionLike = classified.lpModel !== 'unknown';
      return {
        dex: pair.dex ?? pair.kind ?? null,
        pairAddress: pairAddress || null,
        ownerProgram,
        lpModel: classified.lpModel,
        positionIndexStatus: positionLike ? classified.positionIndexStatus : String(matchedScan?.lpModel) === 'fungible-lp' ? 'not-position-based-fungible-lp' : classified.positionIndexStatus,
        positionCount: null,
        ownerCount: null,
        topOwners: [] as Array<{ owner: string; positionCount: number; liquiditySharePctEstimate: number | null; confidence: Confidence; evidence: string[] }>,
        lockStatus: classified.lockStatus,
        limitations: classified.lpModel === 'unknown' && String(matchedScan?.lpModel) === 'fungible-lp'
          ? ['Pool appears fungible-LP based; use /api/lp-lock-burn-scanner for LP mint burn/lock instead of position ownership.']
          : classified.limitations,
        confidence: classified.confidence,
        evidence: ownerProgram ? [`Pool owner program: ${ownerProgram}.`] : ['Pool owner program unavailable from RPC/LP scanner.']
      };
    }));
    const positionPools = pools.filter((pool) => pool.lpModel === 'nft-position' || pool.lpModel === 'bin-liquidity');
    const limitations = Array.from(new Set(pools.flatMap((pool) => pool.limitations))).slice(0, 12);
    const ownerConcentrationPctEstimate = null;
    const confidence: Confidence = positionPools.length ? 'medium' : 'low';
    return Response.json({
      status: positionPools.length ? 'classified' : pools.length ? 'partial' : 'empty',
      source: 'lp-position-ownership-index',
      observedAt: new Date().toISOString(),
      mint,
      pools,
      summary: { poolsScanned: pools.length, positionPoolsIndexed: 0, positionPoolsClassified: positionPools.length, ownerConcentrationPctEstimate, confidence, limitations },
      execution: 'read-only-position-index-no-trading'
    });
  } catch (error) {
    return Response.json({ status: 'partial', source: 'lp-position-ownership-index', observedAt: new Date().toISOString(), mint, pools: [], summary: { poolsScanned: 0, positionPoolsIndexed: 0, positionPoolsClassified: 0, ownerConcentrationPctEstimate: null, confidence: 'low', limitations: [error instanceof Error ? error.message : 'LP position index failed or timed out.'] }, execution: 'read-only-position-index-no-trading' }, { status: 200 });
  } finally {
    clearTimeout(timeout);
  }
}
