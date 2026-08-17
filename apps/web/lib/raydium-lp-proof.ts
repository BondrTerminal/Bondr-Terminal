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

export type RaydiumPostBroadcastLpAccountProof = {
  contract: 'bondr-raydium-post-broadcast-lp-account-proof-v1';
  status: 'verified' | 'blocked';
  signature: string | null;
  poolId: string | null;
  owner: string | null;
  lpMint: string | null;
  lpTokenAccount: string | null;
  amountRaw: string | null;
  transactionMessageHash: string | null;
  simulationTransactionMessageHash: string | null;
  confirmedAt: string | null;
  mintProofStatus: RaydiumLpMintProof['status'];
  tokenAccountProofStatus: RaydiumLpTokenAccountProof['status'];
  tokenAccountProof: RaydiumLpTokenAccountProof;
  blockers: string[];
  evidence: string[];
  safety: {
    readOnlyPostBroadcastProof: true;
    noSigning: true;
    noBroadcast: true;
    proofRequiredBeforeBurn: true;
  };
};

export type RaydiumPostBroadcastChainObservation = {
  signature: string | null;
  slot: number | null;
  err: unknown;
  accountKeys: string[];
  blockTime: number | null;
};

export type RaydiumPoolAccountObservation = {
  poolId: string | null;
  ownerProgram: string | null;
  accountData: Buffer | Uint8Array | null;
};

export type RaydiumTokenAccountObservation = {
  lpTokenAccount: string | null;
  owner: string | null;
  mint: string | null;
  amountRaw: string | number | bigint | null;
};

export type RaydiumPostBroadcastLpAccountObservationProof = RaydiumPostBroadcastLpAccountProof & {
  observationSource: 'solana-rpc' | 'indexer';
  chainObservation: {
    slot: number | null;
    transactionStatus: 'confirmed' | 'missing' | 'failed';
    accountKeyMatched: boolean;
  };
};

const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,120}$/;
const HASH_RE = /^[a-f0-9]{64}$/i;

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

function validSignature(value: string | null | undefined) {
  const signature = value?.trim();
  return signature && SIGNATURE_RE.test(signature) ? signature : null;
}

function validHash(value: string | null | undefined) {
  const hash = value?.trim();
  return hash && HASH_RE.test(hash) ? hash.toLowerCase() : null;
}

function validIso(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function buildRaydiumPostBroadcastLpAccountProof(input: {
  signature: string;
  expectedPoolId: string;
  observedPoolId?: string | null;
  expectedOwner: string;
  lpTokenAccount: string;
  lpTokenOwner: string | null;
  lpTokenMint: string | null;
  amountRaw: string | number | bigint | null;
  mintProof: RaydiumLpMintProof;
  transactionMessageHash?: string | null;
  simulationTransactionMessageHash?: string | null;
  confirmedAt?: string | null;
}): RaydiumPostBroadcastLpAccountProof {
  const signature = validSignature(input.signature);
  const expectedPoolId = validPublicKey(input.expectedPoolId);
  const observedPoolId = input.observedPoolId ? validPublicKey(input.observedPoolId) : expectedPoolId;
  const transactionMessageHash = validHash(input.transactionMessageHash ?? null);
  const simulationTransactionMessageHash = validHash(input.simulationTransactionMessageHash ?? null);
  const confirmedAt = validIso(input.confirmedAt ?? null);
  const tokenAccountProof = buildRaydiumLpTokenAccountProof({
    expectedOwner: input.expectedOwner,
    lpTokenAccount: input.lpTokenAccount,
    lpTokenOwner: input.lpTokenOwner,
    lpTokenMint: input.lpTokenMint,
    amountRaw: input.amountRaw,
    mintProof: input.mintProof
  });
  const hashBlockers = [
    input.transactionMessageHash && !transactionMessageHash ? 'transaction-message-hash-invalid' : null,
    input.simulationTransactionMessageHash && !simulationTransactionMessageHash ? 'simulation-transaction-message-hash-invalid' : null,
    transactionMessageHash && simulationTransactionMessageHash && transactionMessageHash !== simulationTransactionMessageHash ? 'simulation-transaction-message-hash-mismatch' : null
  ].filter((item): item is string => Boolean(item));
  const blockers = [
    signature ? null : 'valid-raydium-lp-signature-required',
    expectedPoolId ? null : 'expected-raydium-pool-id-invalid',
    observedPoolId ? null : 'observed-raydium-pool-id-invalid',
    expectedPoolId && observedPoolId && expectedPoolId === observedPoolId ? null : 'raydium-pool-id-mismatch',
    confirmedAt ? null : 'raydium-lp-broadcast-confirmation-required',
    tokenAccountProof.status === 'verified' ? null : 'verified-lp-token-account-required',
    ...tokenAccountProof.blockers,
    ...hashBlockers
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-raydium-post-broadcast-lp-account-proof-v1',
    status: blockers.length ? 'blocked' : 'verified',
    signature,
    poolId: observedPoolId,
    owner: tokenAccountProof.owner,
    lpMint: tokenAccountProof.lpMint,
    lpTokenAccount: tokenAccountProof.lpTokenAccount,
    amountRaw: tokenAccountProof.amountRaw,
    transactionMessageHash,
    simulationTransactionMessageHash,
    confirmedAt,
    mintProofStatus: input.mintProof.status,
    tokenAccountProofStatus: tokenAccountProof.status,
    tokenAccountProof,
    blockers: Array.from(new Set(blockers)),
    evidence: blockers.length ? [] : [
      'Confirmed Raydium LP transaction signature is present.',
      'Observed pool id matches expected Raydium pool id.',
      ...input.mintProof.evidence,
      ...tokenAccountProof.evidence
    ],
    safety: {
      readOnlyPostBroadcastProof: true,
      noSigning: true,
      noBroadcast: true,
      proofRequiredBeforeBurn: true
    }
  };
}

export function buildRaydiumPostBroadcastLpAccountProofFromObservation(input: {
  source?: 'solana-rpc' | 'indexer';
  expectedPoolId: string;
  expectedOwner: string;
  transaction: RaydiumPostBroadcastChainObservation | null;
  poolAccount: RaydiumPoolAccountObservation | null;
  lpTokenAccount: RaydiumTokenAccountObservation | null;
  transactionMessageHash?: string | null;
  simulationTransactionMessageHash?: string | null;
}): RaydiumPostBroadcastLpAccountObservationProof {
  const expectedPoolId = validPublicKey(input.expectedPoolId);
  const observedPoolId = validPublicKey(input.poolAccount?.poolId ?? null);
  const accountKeys = input.transaction?.accountKeys.map((key) => validPublicKey(key)).filter((key): key is string => Boolean(key)) ?? [];
  const accountKeyMatched = Boolean(expectedPoolId && accountKeys.includes(expectedPoolId));
  const transactionStatus = input.transaction ? input.transaction.err === null ? 'confirmed' : 'failed' : 'missing';
  const accountData = input.poolAccount?.accountData ? Buffer.from(input.poolAccount.accountData) : Buffer.alloc(0);
  const mintProof = resolveRaydiumAmmV4LpMintProof(input.poolAccount?.ownerProgram ?? null, accountData);
  const confirmedAt = transactionStatus === 'confirmed'
    ? input.transaction?.blockTime ? new Date(input.transaction.blockTime * 1000).toISOString() : new Date().toISOString()
    : null;
  const proof = buildRaydiumPostBroadcastLpAccountProof({
    signature: input.transaction?.signature ?? '',
    expectedPoolId: input.expectedPoolId,
    observedPoolId: accountKeyMatched ? observedPoolId : 'missing-transaction-pool-account',
    expectedOwner: input.expectedOwner,
    lpTokenAccount: input.lpTokenAccount?.lpTokenAccount ?? '',
    lpTokenOwner: input.lpTokenAccount?.owner ?? null,
    lpTokenMint: input.lpTokenAccount?.mint ?? null,
    amountRaw: input.lpTokenAccount?.amountRaw ?? null,
    mintProof,
    transactionMessageHash: input.transactionMessageHash,
    simulationTransactionMessageHash: input.simulationTransactionMessageHash,
    confirmedAt
  });
  const observationBlockers = [
    input.transaction ? null : 'raydium-lp-transaction-not-found',
    transactionStatus === 'failed' ? 'raydium-lp-transaction-failed' : null,
    accountKeyMatched ? null : 'raydium-lp-transaction-missing-expected-pool-account',
    input.poolAccount ? null : 'raydium-pool-account-not-found',
    input.lpTokenAccount ? null : 'raydium-owner-lp-token-account-not-found'
  ].filter((item): item is string => Boolean(item));

  return {
    ...proof,
    status: proof.status === 'verified' && observationBlockers.length === 0 ? 'verified' : 'blocked',
    blockers: Array.from(new Set([...proof.blockers, ...observationBlockers])),
    evidence: proof.status === 'verified' && observationBlockers.length === 0
      ? [
        ...proof.evidence,
        `Transaction slot ${input.transaction?.slot ?? 'unknown'} observed from ${input.source ?? 'solana-rpc'}.`,
        'Confirmed transaction account keys include the expected Raydium pool id.'
      ]
      : [],
    observationSource: input.source ?? 'solana-rpc',
    chainObservation: {
      slot: input.transaction?.slot ?? null,
      transactionStatus,
      accountKeyMatched
    }
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
