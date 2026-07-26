import { createHash } from 'node:crypto';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { getIntent, type TerminalIntent } from './live-store';

export const DEFAULT_ALLOWED_SWAP_PROGRAMS = [
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  '11111111111111111111111111111111',
  'ComputeBudget111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbLqPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EP1rH4D9Lr6VY7UG6w',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
];

export type DecodedTransactionPolicy = {
  kind: 'versioned' | 'legacy';
  signerKeys: string[];
  accountKeys: string[];
  programs: string[];
  messageHash: string;
};

export function decodeTransactionPolicy(raw: Buffer): DecodedTransactionPolicy {
  try {
    const tx = VersionedTransaction.deserialize(raw);
    const accountKeys = tx.message.staticAccountKeys.map((key) => key.toBase58());
    const programs = Array.from(new Set(tx.message.compiledInstructions.map((ix) => accountKeys[ix.programIdIndex]).filter(Boolean)));
    return {
      kind: 'versioned',
      signerKeys: tx.message.staticAccountKeys.slice(0, tx.signatures.length).map((key) => key.toBase58()),
      accountKeys,
      programs,
      messageHash: createHash('sha256').update(Buffer.from(tx.message.serialize())).digest('hex')
    };
  } catch {
    const tx = Transaction.from(raw);
    const accountSet = new Set<string>();
    const programs = new Set<string>();
    for (const ix of tx.instructions) {
      programs.add(ix.programId.toBase58());
      accountSet.add(ix.programId.toBase58());
      for (const key of ix.keys) accountSet.add(key.pubkey.toBase58());
    }
    return {
      kind: 'legacy',
      signerKeys: tx.signatures.map((sig) => sig.publicKey.toBase58()),
      accountKeys: Array.from(accountSet),
      programs: Array.from(programs),
      messageHash: createHash('sha256').update(tx.serializeMessage()).digest('hex')
    };
  }
}

export function policyCheck(params: {
  decoded: DecodedTransactionPolicy;
  intent?: TerminalIntent | null;
  intentId?: string | null;
  expectedSigner?: string | null;
  expectedMint?: string | null;
  allowedPrograms?: string[] | null;
  requiredAccounts?: string[] | null;
  transactionMessageHash?: string | null;
}) {
  const intent = params.intentId && !params.intent ? getIntent(params.intentId) : params.intent ?? null;
  const expectedSigner = params.expectedSigner ?? intent?.expectedSigner ?? null;
  const expectedMint = params.expectedMint ?? intent?.expectedMint ?? null;
  const allowedPrograms = params.allowedPrograms ?? intent?.allowedPrograms ?? DEFAULT_ALLOWED_SWAP_PROGRAMS;
  const requiredAccounts = Array.from(new Set([...(params.requiredAccounts ?? intent?.requiredAccounts ?? []), expectedMint].filter((item): item is string => Boolean(item))));
  const messageHash = params.transactionMessageHash ?? intent?.transactionMessageHash ?? null;
  const blockers: string[] = [];

  if (params.intentId && !intent) blockers.push('Intent not found.');
  if (intent && Date.parse(intent.expiresAt) <= Date.now()) blockers.push('Intent expired.');
  if (intent && !['transaction_built', 'signed_client_side', 'broadcast_requested'].includes(intent.status)) blockers.push(`Intent status ${intent.status} does not allow broadcast.`);
  if (!expectedSigner) blockers.push('expectedSigner is required.');
  if (expectedSigner) {
    try { new PublicKey(expectedSigner); } catch { blockers.push('expectedSigner is not a valid Solana public key.'); }
    if (!params.decoded.signerKeys.includes(expectedSigner)) blockers.push('Signed transaction does not include expectedSigner as signer.');
  }
  if (expectedMint) {
    try { new PublicKey(expectedMint); } catch { blockers.push('expectedMint is not a valid Solana public key.'); }
    if (!params.decoded.accountKeys.includes(expectedMint)) blockers.push('Signed transaction does not reference expectedMint.');
  }
  for (const account of requiredAccounts) if (!params.decoded.accountKeys.includes(account)) blockers.push(`Required account missing: ${account}`);
  for (const program of params.decoded.programs) if (!allowedPrograms.includes(program)) blockers.push(`Program not allowed by intent policy: ${program}`);
  if (messageHash && params.decoded.messageHash !== messageHash) blockers.push('Transaction message hash does not match intent.');

  return {
    intent,
    signerMatched: Boolean(expectedSigner && params.decoded.signerKeys.includes(expectedSigner)),
    expectedMintReferenced: Boolean(expectedMint && params.decoded.accountKeys.includes(expectedMint)),
    requiredAccountsMatched: requiredAccounts.every((account) => params.decoded.accountKeys.includes(account)),
    programsAllowed: params.decoded.programs.every((program) => allowedPrograms.includes(program)),
    transactionMessageHash: params.decoded.messageHash,
    allowedPrograms,
    requiredAccounts,
    blockers,
    intentRequired: Boolean(params.intentId),
    safeToBroadcastIfLiveEnabled: blockers.length === 0
  };
}
