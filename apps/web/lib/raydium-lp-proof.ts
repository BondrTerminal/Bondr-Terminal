import { PublicKey } from '@solana/web3.js';

export const RAYDIUM_AMM_V4_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
export const RAYDIUM_AMM_V4_LP_MINT_OFFSET = 464;

export type RaydiumLpMintProof = {
  contract: 'bondr-raydium-lp-mint-proof-v1';
  status: 'resolved' | 'blocked';
  ownerProgram: string | null;
  lpMint: string | null;
  layout: 'raydium-amm-v4' | 'unsupported';
  offset: number | null;
  blockers: string[];
  evidence: string[];
};

export type RaydiumLpTokenAccountProof = {
  contract: 'bondr-raydium-lp-token-account-proof-v1';
  status: 'verified' | 'blocked';
  lpMint: string | null;
  lpTokenAccount: string | null;
  owner: string | null;
  amountRaw: string | null;
  blockers: string[];
  evidence: string[];
  safety: {
    noSigning: true;
    noBroadcast: true;
    proofRequiredBeforeBurn: true;
  };
};

function validPublicKey(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

function publicKeyFromData(data: Buffer, offset: number) {
  if (data.length < offset + 32) return null;
  const bytes = data.subarray(offset, offset + 32);
  if (bytes.every((byte) => byte === 0)) return null;
  try {
    return new PublicKey(bytes).toBase58();
  } catch {
    return null;
  }
}

export function resolveRaydiumAmmV4LpMintProof(ownerProgram: string | null, accountData: Buffer): RaydiumLpMintProof {
  const blockers = [
    ownerProgram === RAYDIUM_AMM_V4_PROGRAM_ID ? null : 'raydium-amm-v4-owner-required',
    accountData.length >= RAYDIUM_AMM_V4_LP_MINT_OFFSET + 32 ? null : 'raydium-pool-account-data-too-short'
  ].filter((item): item is string => Boolean(item));
  const lpMint = blockers.length ? null : publicKeyFromData(accountData, RAYDIUM_AMM_V4_LP_MINT_OFFSET);
  if (!lpMint) blockers.push('raydium-lp-mint-unresolved');
  return {
    contract: 'bondr-raydium-lp-mint-proof-v1',
    status: blockers.length ? 'blocked' : 'resolved',
    ownerProgram,
    lpMint,
    layout: ownerProgram === RAYDIUM_AMM_V4_PROGRAM_ID ? 'raydium-amm-v4' : 'unsupported',
    offset: ownerProgram === RAYDIUM_AMM_V4_PROGRAM_ID ? RAYDIUM_AMM_V4_LP_MINT_OFFSET : null,
    blockers: Array.from(new Set(blockers)),
    evidence: lpMint
      ? [`Raydium AMM v4 owner matched ${RAYDIUM_AMM_V4_PROGRAM_ID}.`, `LP mint decoded from liquidityStateV4 lpMint offset ${RAYDIUM_AMM_V4_LP_MINT_OFFSET}.`]
      : []
  };
}

export function buildRaydiumLpTokenAccountProof(input: {
  expectedOwner: string;
  lpTokenAccount: string;
  lpTokenOwner: string | null;
  lpTokenMint: string | null;
  amountRaw: string | number | bigint | null;
  mintProof: RaydiumLpMintProof;
}): RaydiumLpTokenAccountProof {
  const expectedOwner = validPublicKey(input.expectedOwner);
  const lpTokenAccount = validPublicKey(input.lpTokenAccount);
  const lpTokenOwner = validPublicKey(input.lpTokenOwner ?? null);
  const lpTokenMint = validPublicKey(input.lpTokenMint ?? null);
  const amountRaw = input.amountRaw === null ? null : String(input.amountRaw);
  const amount = amountRaw && /^\d+$/.test(amountRaw) ? BigInt(amountRaw) : 0n;
  const blockers = [
    input.mintProof.status === 'resolved' ? null : 'raydium-lp-mint-proof-required',
    expectedOwner ? null : 'expected-owner-invalid',
    lpTokenAccount ? null : 'lp-token-account-invalid',
    lpTokenOwner && expectedOwner && lpTokenOwner === expectedOwner ? null : 'lp-token-account-owner-mismatch',
    lpTokenMint && input.mintProof.lpMint && lpTokenMint === input.mintProof.lpMint ? null : 'lp-token-account-mint-mismatch',
    amount > 0n ? null : 'lp-token-balance-required'
  ].filter((item): item is string => Boolean(item));
  return {
    contract: 'bondr-raydium-lp-token-account-proof-v1',
    status: blockers.length ? 'blocked' : 'verified',
    lpMint: lpTokenMint,
    lpTokenAccount,
    owner: lpTokenOwner,
    amountRaw,
    blockers: Array.from(new Set(blockers)),
    evidence: blockers.length ? [] : [
      'LP token account owner matches deployer.',
      'LP token account mint matches decoded Raydium pool LP mint.',
      'LP token balance is positive.'
    ],
    safety: {
      noSigning: true,
      noBroadcast: true,
      proofRequiredBeforeBurn: true
    }
  };
}
