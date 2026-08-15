import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

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
    transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    safety: {
      noSigning: true,
      noBroadcast: true,
      requiresVerifiedLpAccount: true,
      requiresSimulationBeforeSigning: true
    }
  };
}
