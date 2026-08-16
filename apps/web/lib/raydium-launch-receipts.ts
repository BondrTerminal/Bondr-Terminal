import { PublicKey } from '@solana/web3.js';
import type { RaydiumLpTokenAccountProof } from './raydium-lp-proof';

const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,120}$/;

export type RaydiumLaunchReceiptInput = {
  signature: string;
  tokenMint: string;
  poolId: string;
  lpMint: string;
  lpTokenAccount: string;
  lpAmountRaw: string | number | bigint;
  deployer: string;
  observedAt?: string | null;
  confirmedAt?: string | null;
  transactionMessageHash?: string | null;
  lpTokenAccountProof?: RaydiumLpTokenAccountProof | null;
};

export type RaydiumLaunchReceipt = {
  contract: 'bondr-raydium-launch-receipt-v1';
  status: 'confirmed' | 'sent' | 'blocked';
  route: 'raydium';
  signature: string | null;
  explorerUrl: string | null;
  tokenMint: string | null;
  poolId: string | null;
  lpMint: string | null;
  lpTokenAccount: string | null;
  lpAmountRaw: string | null;
  deployer: string | null;
  observedAt: string;
  confirmedAt: string | null;
  transactionMessageHash: string | null;
  proofStatus: 'verified' | 'missing' | 'blocked';
  blockers: string[];
  safety: {
    noPumpFunDependency: true;
    noFakePoolState: true;
    requiresVerifiedLpAccount: true;
    noSigning: true;
    noBroadcast: true;
  };
};

function validPublicKey(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    return null;
  }
}

function amountRaw(value: unknown) {
  if (typeof value === 'bigint') return value > 0n ? value.toString() : null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value).toString();
  if (typeof value === 'string' && /^\d+$/.test(value.trim()) && BigInt(value.trim()) > 0n) return value.trim();
  return null;
}

function iso(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function normalizeRaydiumLaunchReceipt(input: RaydiumLaunchReceiptInput): RaydiumLaunchReceipt {
  const signature = typeof input.signature === 'string' && SIGNATURE_RE.test(input.signature.trim()) ? input.signature.trim() : null;
  const tokenMint = validPublicKey(input.tokenMint);
  const poolId = validPublicKey(input.poolId);
  const lpMint = validPublicKey(input.lpMint);
  const lpTokenAccount = validPublicKey(input.lpTokenAccount);
  const deployer = validPublicKey(input.deployer);
  const lpAmount = amountRaw(input.lpAmountRaw);
  const proof = input.lpTokenAccountProof ?? null;
  const proofBlockers = proof
    ? [
      proof.status === 'verified' ? null : 'lp-token-account-proof-not-verified',
      proof.owner === deployer ? null : 'lp-token-account-proof-owner-mismatch',
      proof.lpMint === lpMint ? null : 'lp-token-account-proof-mint-mismatch',
      proof.lpTokenAccount === lpTokenAccount ? null : 'lp-token-account-proof-account-mismatch',
      proof.amountRaw === lpAmount ? null : 'lp-token-account-proof-amount-mismatch'
    ].filter((item): item is string => Boolean(item))
    : ['lp-token-account-proof-required'];
  const blockers = [
    signature ? null : 'valid-raydium-lp-signature-required',
    tokenMint ? null : 'valid-token-mint-required',
    poolId ? null : 'valid-raydium-pool-id-required',
    lpMint ? null : 'valid-lp-mint-required',
    lpTokenAccount ? null : 'valid-lp-token-account-required',
    lpAmount ? null : 'positive-lp-amount-required',
    deployer ? null : 'valid-deployer-required',
    ...proofBlockers
  ].filter((item): item is string => Boolean(item));
  const confirmedAt = iso(input.confirmedAt);

  return {
    contract: 'bondr-raydium-launch-receipt-v1',
    status: blockers.length ? 'blocked' : confirmedAt ? 'confirmed' : 'sent',
    route: 'raydium',
    signature,
    explorerUrl: signature ? `https://solscan.io/tx/${signature}` : null,
    tokenMint,
    poolId,
    lpMint,
    lpTokenAccount,
    lpAmountRaw: lpAmount,
    deployer,
    observedAt: iso(input.observedAt) ?? new Date().toISOString(),
    confirmedAt,
    transactionMessageHash: typeof input.transactionMessageHash === 'string' && input.transactionMessageHash.trim() ? input.transactionMessageHash.trim() : null,
    proofStatus: proof?.status === 'verified' && proofBlockers.length === 0 ? 'verified' : proof ? 'blocked' : 'missing',
    blockers: Array.from(new Set(blockers)),
    safety: {
      noPumpFunDependency: true,
      noFakePoolState: true,
      requiresVerifiedLpAccount: true,
      noSigning: true,
      noBroadcast: true
    }
  };
}
