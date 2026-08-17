import { createHash } from 'node:crypto';
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction
} from '@solana/web3.js';
import { decodeTransactionPolicy, DEFAULT_ALLOWED_SWAP_PROGRAMS, policyCheck } from './transaction-policy';

const MAX_SERIALIZED_TRANSACTION_BYTES = 1232;
const DEFAULT_MAX_WALLETS_PER_PACKED_TRANSACTION = 4;
const HARD_MAX_WALLETS_PER_PACKED_TRANSACTION = 6;

export type JitoPackedInstructionInput = {
  id: string;
  rail?: 'deployment' | 'bundle' | 'sniper' | 'task' | 'tip';
  programId: string;
  keys: Array<{ pubkey: string; isSigner?: boolean; isWritable?: boolean }>;
  dataBase64?: string | null;
  expectedSigner?: string | null;
};

export type JitoPackedLookupTableInput = {
  address: string;
  addresses: string[];
};

export type JitoPackedTransactionBuildResult = {
  contract: 'bondr-jito-packed-transaction-builder-v1';
  status: 'built' | 'blocked';
  transactionBase64: string | null;
  transactionBytes: number | null;
  transactionHash: string | null;
  transactionMessageHash: string | null;
  payer: string | null;
  recentBlockhash: string | null;
  instructionIds: string[];
  rails: string[];
  expectedSigners: string[];
  requiredSigners: string[];
  programs: string[];
  accountKeys: string[];
  addressLookupTables: {
    required: boolean;
    supplied: string[];
    resolvedAddressCount: number;
  };
  limits: {
    maxSerializedBytes: number;
    maxWalletsPerPackedTransaction: number;
  };
  policy: {
    programsAllowed: boolean | null;
    requiredAccountsMatched: boolean | null;
    expectedMintReferenced: boolean | null;
  };
  blockers: string[];
  warnings: string[];
  safety: {
    noSigning: true;
    noBroadcast: true;
    noRelaySubmit: true;
    noServerCustody: true;
  };
};

function validPublicKey(value: string | null | undefined) {
  if (!value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function normalizePublicKey(value: string) {
  return new PublicKey(value).toBase58();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clampWalletLimit(value: number | null | undefined) {
  const limit = Number.isFinite(value) && Number(value) > 0 ? Number(value) : DEFAULT_MAX_WALLETS_PER_PACKED_TRANSACTION;
  return Math.max(1, Math.min(Math.floor(limit), HARD_MAX_WALLETS_PER_PACKED_TRANSACTION));
}

function lookupTableFrom(input: JitoPackedLookupTableInput) {
  return new AddressLookupTableAccount({
    key: new PublicKey(input.address),
    state: {
      deactivationSlot: BigInt('18446744073709551615'),
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      addresses: input.addresses.map((address) => new PublicKey(address))
    }
  });
}

function instructionFrom(input: JitoPackedInstructionInput) {
  return new TransactionInstruction({
    programId: new PublicKey(input.programId),
    keys: input.keys.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: Boolean(key.isSigner),
      isWritable: Boolean(key.isWritable)
    })),
    data: input.dataBase64 ? Buffer.from(input.dataBase64, 'base64') : Buffer.alloc(0)
  });
}

export function buildJitoPackedTransaction(input: {
  payer: string;
  recentBlockhash: string;
  instructions: JitoPackedInstructionInput[];
  lookupTables?: JitoPackedLookupTableInput[] | null;
  expectedMint?: string | null;
  requiredAccounts?: string[] | null;
  allowedPrograms?: string[] | null;
  computeUnitLimit?: number | null;
  computeUnitPriceMicroLamports?: number | null;
  maxWalletsPerPackedTransaction?: number | null;
}): JitoPackedTransactionBuildResult {
  const maxWalletsPerPackedTransaction = clampWalletLimit(input.maxWalletsPerPackedTransaction);
  const invalidInstructionIds = input.instructions
    .filter((instruction) => !instruction.id || !validPublicKey(instruction.programId) || instruction.keys.some((key) => !validPublicKey(key.pubkey)))
    .map((instruction) => instruction.id || 'unknown');
  const instructionExpectedSigners = input.instructions
    .map((instruction) => instruction.expectedSigner)
    .filter((signer): signer is string => Boolean(signer));
  const keySigners = input.instructions.flatMap((instruction) => instruction.keys.filter((key) => key.isSigner).map((key) => key.pubkey));
  const expectedSigners = unique([...instructionExpectedSigners, input.payer].filter(validPublicKey).map(normalizePublicKey));
  const lookupTables = input.lookupTables ?? [];
  const lookupTableAddresses = lookupTables.map((table) => table.address).filter(validPublicKey).map(normalizePublicKey);
  const requiresLookupTable = expectedSigners.length > 1;
  const blockers = [
    validPublicKey(input.payer) ? null : 'packed-transaction-payer-required',
    input.recentBlockhash ? null : 'packed-transaction-recent-blockhash-required',
    input.instructions.length ? null : 'packed-transaction-instructions-required',
    invalidInstructionIds.length ? `packed-transaction-invalid-instructions:${invalidInstructionIds.join(',')}` : null,
    expectedSigners.length > maxWalletsPerPackedTransaction ? `packed-transaction-exceeds-${maxWalletsPerPackedTransaction}-wallet-limit` : null,
    requiresLookupTable && !lookupTables.length ? 'address-lookup-table-required-for-packed-wallet-transaction' : null,
    lookupTables.some((table) => !validPublicKey(table.address) || table.addresses.some((address) => !validPublicKey(address))) ? 'packed-transaction-invalid-lookup-table' : null
  ].filter((item): item is string => Boolean(item));

  if (blockers.length) {
    return {
      contract: 'bondr-jito-packed-transaction-builder-v1',
      status: 'blocked',
      transactionBase64: null,
      transactionBytes: null,
      transactionHash: null,
      transactionMessageHash: null,
      payer: validPublicKey(input.payer) ? normalizePublicKey(input.payer) : null,
      recentBlockhash: input.recentBlockhash || null,
      instructionIds: input.instructions.map((instruction) => instruction.id).filter(Boolean),
      rails: unique(input.instructions.map((instruction) => instruction.rail ?? 'bundle')),
      expectedSigners,
      requiredSigners: unique([...keySigners, input.payer].filter(validPublicKey).map(normalizePublicKey)),
      programs: [],
      accountKeys: [],
      addressLookupTables: { required: requiresLookupTable, supplied: lookupTableAddresses, resolvedAddressCount: lookupTables.reduce((sum, table) => sum + table.addresses.length, 0) },
      limits: { maxSerializedBytes: MAX_SERIALIZED_TRANSACTION_BYTES, maxWalletsPerPackedTransaction },
      policy: { programsAllowed: null, requiredAccountsMatched: null, expectedMintReferenced: null },
      blockers: Array.from(new Set(blockers)),
      warnings: [],
      safety: { noSigning: true, noBroadcast: true, noRelaySubmit: true, noServerCustody: true }
    };
  }

  const computeInstructions = [
    Number.isFinite(input.computeUnitLimit) && Number(input.computeUnitLimit) > 0
      ? ComputeBudgetProgram.setComputeUnitLimit({ units: Math.floor(Number(input.computeUnitLimit)) })
      : null,
    Number.isFinite(input.computeUnitPriceMicroLamports) && Number(input.computeUnitPriceMicroLamports) >= 0
      ? ComputeBudgetProgram.setComputeUnitPrice({ microLamports: Math.floor(Number(input.computeUnitPriceMicroLamports)) })
      : null
  ].filter((instruction): instruction is TransactionInstruction => Boolean(instruction));
  const instructions = [...computeInstructions, ...input.instructions.map(instructionFrom)];
  const transaction = new VersionedTransaction(new TransactionMessage({
    payerKey: new PublicKey(input.payer),
    recentBlockhash: input.recentBlockhash,
    instructions
  }).compileToV0Message(lookupTables.map(lookupTableFrom)));
  const bytes = Buffer.from(transaction.serialize());
  const decoded = decodeTransactionPolicy(bytes);
  const decodedForPolicy = lookupTables.length
    ? {
      ...decoded,
      accountKeys: unique([...decoded.accountKeys, ...lookupTables.flatMap((table) => table.addresses).filter(validPublicKey).map(normalizePublicKey)]),
      unresolvedAddressLookupTables: []
    }
    : decoded;
  const policy = policyCheck({
    decoded: decodedForPolicy,
    expectedSigner: expectedSigners[0] ?? null,
    expectedMint: input.expectedMint,
    requiredAccounts: input.requiredAccounts,
    allowedPrograms: input.allowedPrograms ?? DEFAULT_ALLOWED_SWAP_PROGRAMS
  });
  const postBuildBlockers = [
    bytes.length <= MAX_SERIALIZED_TRANSACTION_BYTES ? null : `packed-transaction-exceeds-${MAX_SERIALIZED_TRANSACTION_BYTES}-byte-limit`,
    ...expectedSigners.map((signer) => decodedForPolicy.signerKeys.includes(signer) ? null : `packed-transaction-missing-signer-${signer}`),
    ...policy.blockers
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-jito-packed-transaction-builder-v1',
    status: postBuildBlockers.length ? 'blocked' : 'built',
    transactionBase64: bytes.toString('base64'),
    transactionBytes: bytes.length,
    transactionHash: createHash('sha256').update(bytes).digest('hex'),
    transactionMessageHash: decoded.messageHash,
    payer: normalizePublicKey(input.payer),
    recentBlockhash: input.recentBlockhash,
    instructionIds: input.instructions.map((instruction) => instruction.id),
    rails: unique(input.instructions.map((instruction) => instruction.rail ?? 'bundle')),
    expectedSigners,
    requiredSigners: decodedForPolicy.signerKeys,
    programs: decodedForPolicy.programs,
    accountKeys: decodedForPolicy.accountKeys,
    addressLookupTables: {
      required: requiresLookupTable,
      supplied: lookupTableAddresses,
      resolvedAddressCount: lookupTables.reduce((sum, table) => sum + table.addresses.length, 0)
    },
    limits: { maxSerializedBytes: MAX_SERIALIZED_TRANSACTION_BYTES, maxWalletsPerPackedTransaction },
    policy: {
      programsAllowed: policy.programsAllowed,
      requiredAccountsMatched: policy.requiredAccountsMatched,
      expectedMintReferenced: input.expectedMint ? policy.expectedMintReferenced : null
    },
    blockers: Array.from(new Set(postBuildBlockers)),
    warnings: policy.warnings,
    safety: { noSigning: true, noBroadcast: true, noRelaySubmit: true, noServerCustody: true }
  };
}
