import { createHash } from 'node:crypto';
import { PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
type TerminalIntent = {
  id: string;
  expectedSigner: string;
  expectedMint: string;
  status: string;
  expiresAt: string;
  allowedPrograms: string[];
  requiredAccounts: string[];
  transactionMessageHash: string | null;
};

export const DEFAULT_ALLOWED_SWAP_PROGRAMS = [
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  '11111111111111111111111111111111',
  'ComputeBudget111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EP1rH4D9Lr6VY7UG6w',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
];

export type DecodedSolTransfer = {
  from: string;
  to: string;
  lamports: number;
};

export type DecodedTransactionPolicy = {
  kind: 'versioned' | 'legacy';
  signerKeys: string[];
  accountKeys: string[];
  programs: string[];
  messageHash: string;
  usesAddressLookupTables?: boolean;
  systemTransfers: DecodedSolTransfer[];
};

function parseSystemTransfer(data: Buffer | Uint8Array) {
  const buffer = Buffer.from(data);
  if (buffer.length < 12) return null;
  const instruction = buffer.readUInt32LE(0);
  if (instruction !== 2) return null;
  const lamports = Number(buffer.readBigUInt64LE(4));
  return Number.isSafeInteger(lamports) && lamports > 0 ? lamports : null;
}

export function decodeTransactionPolicy(raw: Buffer): DecodedTransactionPolicy {
  try {
    const tx = VersionedTransaction.deserialize(raw);
    const accountKeys = tx.message.staticAccountKeys.map((key) => key.toBase58());
    const programs = Array.from(new Set(tx.message.compiledInstructions.map((ix) => accountKeys[ix.programIdIndex]).filter(Boolean)));
    const systemTransfers = tx.message.compiledInstructions.flatMap((ix) => {
      const program = accountKeys[ix.programIdIndex];
      const lamports = program === SystemProgram.programId.toBase58() ? parseSystemTransfer(ix.data) : null;
      if (!lamports || ix.accountKeyIndexes.length < 2) return [];
      const from = accountKeys[ix.accountKeyIndexes[0]];
      const to = accountKeys[ix.accountKeyIndexes[1]];
      return from && to ? [{ from, to, lamports }] : [];
    });
    return {
      kind: 'versioned',
      signerKeys: tx.message.staticAccountKeys.slice(0, tx.signatures.length).map((key) => key.toBase58()),
      accountKeys,
      programs,
      messageHash: createHash('sha256').update(Buffer.from(tx.message.serialize())).digest('hex'),
      usesAddressLookupTables: 'addressTableLookups' in tx.message && Array.isArray(tx.message.addressTableLookups) && tx.message.addressTableLookups.length > 0,
      systemTransfers
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
    const systemTransfers = tx.instructions.flatMap((ix) => {
      const lamports = ix.programId.equals(SystemProgram.programId) ? parseSystemTransfer(ix.data) : null;
      if (!lamports || ix.keys.length < 2) return [];
      return [{ from: ix.keys[0].pubkey.toBase58(), to: ix.keys[1].pubkey.toBase58(), lamports }];
    });
    return {
      kind: 'legacy',
      signerKeys: tx.signatures.map((sig) => sig.publicKey.toBase58()),
      accountKeys: Array.from(accountSet),
      programs: Array.from(programs),
      messageHash: createHash('sha256').update(tx.serializeMessage()).digest('hex'),
      systemTransfers
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
  const intent = params.intent ?? null;
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
  if (params.decoded.usesAddressLookupTables) blockers.push('Address lookup table resolution required before broadcast policy can pass.');

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


export function fundingPolicyCheck(params: {
  decoded: DecodedTransactionPolicy;
  expectedSigner: string;
  allowedSource: string;
  allowedDestination: string;
  maxLamports: number;
}) {
  const blockers: string[] = [];
  if (params.expectedSigner !== params.allowedSource) blockers.push('expectedSigner must equal the approved funding source.');
  if (!params.decoded.signerKeys.includes(params.allowedSource)) blockers.push('Signed transaction does not include approved source as signer.');
  const allowedPrograms = [SystemProgram.programId.toBase58()];
  for (const program of params.decoded.programs) if (!allowedPrograms.includes(program)) blockers.push(`Program not allowed for funding broadcast: ${program}`);
  if (params.decoded.systemTransfers.length !== 1) blockers.push('Funding broadcast requires exactly one SystemProgram.transfer instruction.');
  const transfer = params.decoded.systemTransfers[0] ?? null;
  if (transfer) {
    if (transfer.from !== params.allowedSource) blockers.push('Funding source does not match approved sender.');
    if (transfer.to !== params.allowedDestination) blockers.push('Funding destination does not match approved receiver.');
    if (transfer.lamports > params.maxLamports) blockers.push(`Funding amount exceeds cap: ${transfer.lamports} lamports > ${params.maxLamports}.`);
    if (transfer.lamports <= 0) blockers.push('Funding amount must be positive.');
  }
  if (params.decoded.usesAddressLookupTables) blockers.push('Address lookup tables are not allowed for funding broadcast.');
  return {
    safeToBroadcastFunding: blockers.length === 0,
    blockers,
    transfer,
    allowedPrograms,
    maxLamports: params.maxLamports
  };
}
