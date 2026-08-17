import { createHash } from 'node:crypto';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import type { RaydiumLpTokenAccountProof } from './raydium-lp-proof';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export type LpBurnBuildInput = {
  owner: string;
  lpMint: string;
  lpTokenAccount: string;
  amount: number;
  decimals: number;
  recentBlockhash: string;
};

export type LpBurnSimulationProof = {
  status?: string | null;
  transactionMessageHash?: string | null;
  err?: unknown;
  provider?: string | null;
  unitsConsumed?: number | null;
};

function parsePk(value: string, label: string) {
  if (!ADDRESS_RE.test(value)) throw new Error(`Missing or invalid ${label}.`);
  return new PublicKey(value);
}

function u8(value: number) {
  return Buffer.from([value]);
}

function u64LE(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function checkedAmount(uiAmount: number, decimals: number) {
  if (!Number.isFinite(uiAmount) || uiAmount <= 0) throw new Error('amount must be a positive number.');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) throw new Error('decimals must be an integer from 0 to 9.');
  return BigInt(Math.round(uiAmount * 10 ** decimals));
}

function createBurnCheckedInstruction(account: PublicKey, mint: PublicKey, owner: PublicKey, amount: bigint, decimals: number) {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false }
    ],
    data: Buffer.concat([u8(15), u64LE(amount), u8(decimals)])
  });
}

export function buildLpBurnTransaction(input: LpBurnBuildInput) {
  const owner = parsePk(input.owner, 'owner');
  const lpMint = parsePk(input.lpMint, 'lpMint');
  const lpTokenAccount = parsePk(input.lpTokenAccount, 'lpTokenAccount');
  const amount = checkedAmount(input.amount, input.decimals);
  if (!input.recentBlockhash || input.recentBlockhash.length < 32) throw new Error('recentBlockhash is required.');

  const tx = new Transaction();
  tx.feePayer = owner;
  tx.recentBlockhash = input.recentBlockhash;
  tx.add(createBurnCheckedInstruction(lpTokenAccount, lpMint, owner, amount, input.decimals));
  const transactionMessageHash = createHash('sha256').update(tx.serializeMessage()).digest('hex');

  return {
    contract: 'bondr-lp-burn-transaction-v1' as const,
    status: 'built' as const,
    execution: 'unsigned-lp-burn-transaction-built-no-signing-no-broadcast' as const,
    owner: owner.toBase58(),
    lpMint: lpMint.toBase58(),
    lpTokenAccount: lpTokenAccount.toBase58(),
    tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    requiredSigners: [owner.toBase58()],
    amountRaw: amount.toString(),
    transactionMessageHash,
    transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    safety: {
      noSigning: true,
      noBroadcast: true,
      requiresVerifiedLpAccount: true,
      requiresSimulationBeforeSigning: true
    }
  };
}

export function buildVerifiedLpBurnTransaction(input: LpBurnBuildInput & { proof: RaydiumLpTokenAccountProof }) {
  if (input.proof.status !== 'verified') throw new Error('verified LP token account proof is required.');
  if (input.proof.owner !== input.owner) throw new Error('LP proof owner does not match burn owner.');
  if (input.proof.lpMint !== input.lpMint) throw new Error('LP proof mint does not match burn mint.');
  if (input.proof.lpTokenAccount !== input.lpTokenAccount) throw new Error('LP proof token account does not match burn source.');
  const transaction = buildLpBurnTransaction(input);
  return {
    ...transaction,
    proofContract: input.proof.contract,
    proofStatus: input.proof.status,
    execution: 'unsigned-verified-lp-burn-transaction-built-no-signing-no-broadcast' as const,
    safety: {
      ...transaction.safety,
      requiresVerifiedLpAccount: true,
      proofBoundBeforeBuild: true as const
    }
  };
}

export function buildSimulationVerifiedLpBurnSignatureHandoff(input: LpBurnBuildInput & { proof: RaydiumLpTokenAccountProof; simulationProof?: LpBurnSimulationProof | null }) {
  const transaction = buildVerifiedLpBurnTransaction(input);
  const proof = input.simulationProof ?? null;
  const blockers = [
    proof ? null : 'lp-burn-simulation-proof-required',
    proof && proof.status !== 'ok' ? 'lp-burn-simulation-status-not-ok' : null,
    proof && proof.err != null ? 'lp-burn-simulation-failed' : null,
    proof && proof.transactionMessageHash !== transaction.transactionMessageHash ? 'lp-burn-simulation-hash-mismatch' : null
  ].filter((item): item is string => Boolean(item));

  return {
    ...transaction,
    contract: 'bondr-lp-burn-signature-handoff-v1' as const,
    status: blockers.length ? 'blocked' as const : 'ready' as const,
    execution: 'unsigned-verified-lp-burn-simulation-bound-no-signing-no-broadcast' as const,
    simulationProof: {
      required: true as const,
      provided: Boolean(proof),
      status: proof?.status ?? null,
      transactionMessageHash: proof?.transactionMessageHash ?? null,
      err: proof?.err ?? null,
      provider: proof?.provider ?? null,
      unitsConsumed: proof?.unitsConsumed ?? null
    },
    safeToRequestSignature: blockers.length === 0,
    blockers,
    safety: {
      ...transaction.safety,
      requiresVerifiedLpAccount: true as const,
      requiresSimulationBeforeSigning: true as const,
      proofBoundBeforeBuild: true as const,
      simulationProofBoundBeforeSignature: true as const,
      noSigning: true as const,
      noBroadcast: true as const
    }
  };
}
