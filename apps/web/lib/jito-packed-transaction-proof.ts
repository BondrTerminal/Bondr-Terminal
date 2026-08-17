import { PublicKey } from '@solana/web3.js';
import { DEFAULT_ALLOWED_SWAP_PROGRAMS, policyCheck, type DecodedTransactionPolicy } from './transaction-policy';

const DEFAULT_MAX_SERIALIZED_BYTES = 1232;
const DEFAULT_MAX_WALLETS_PER_PACKED_TRANSACTION = 4;
const HARD_MAX_WALLETS_PER_PACKED_TRANSACTION = 6;

export type JitoPackedTransactionSimulationProof = {
  status?: string | null;
  transactionMessageHash?: string | null;
  unitsConsumed?: number | null;
  provider?: string | null;
  err?: unknown;
};

export type JitoPackedTransactionProof = {
  contract: 'bondr-jito-packed-transaction-proof-v1';
  status: 'verified' | 'blocked';
  transactionMessageHash: string;
  expectedTransactionMessageHash: string | null;
  walletCount: number;
  signers: string[];
  expectedSigners: string[];
  serializedBytes: number;
  limits: {
    maxSerializedBytes: number;
    maxWalletsPerPackedTransaction: number;
  };
  addressLookupTables: {
    used: boolean;
    resolved: boolean;
    unresolved: string[];
    proofStatus: 'not-required' | 'required-and-resolved' | 'required-and-unresolved' | 'required-but-not-used';
  };
  simulationProof: {
    required: true;
    status: string | null;
    transactionMessageHash: string | null;
    messageHashMatched: boolean;
    unitsConsumed: number | null;
    provider: string | null;
  };
  policy: {
    programsAllowed: boolean;
    requiredAccountsMatched: boolean;
    expectedMintReferenced: boolean | null;
  };
  blockers: string[];
  warnings: string[];
  safety: {
    noSigning: true;
    noRelaySubmit: true;
    noServerCustody: true;
  };
};

function validPublicKey(value: string) {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function clampPackedWalletLimit(value: number | null | undefined) {
  const limit = Number.isFinite(value) && Number(value) > 0 ? Number(value) : DEFAULT_MAX_WALLETS_PER_PACKED_TRANSACTION;
  return Math.max(1, Math.min(Math.floor(limit), HARD_MAX_WALLETS_PER_PACKED_TRANSACTION));
}

export function buildJitoPackedTransactionProof(input: {
  decoded: DecodedTransactionPolicy;
  serializedBytes: number;
  expectedSigners: string[];
  expectedMint?: string | null;
  requiredAccounts?: string[] | null;
  allowedPrograms?: string[] | null;
  transactionMessageHash?: string | null;
  simulationProof?: JitoPackedTransactionSimulationProof | null;
  maxSerializedBytes?: number;
  maxWalletsPerPackedTransaction?: number;
}): JitoPackedTransactionProof {
  const expectedSigners = Array.from(new Set(input.expectedSigners.map((signer) => signer.trim()).filter(Boolean)));
  const maxWalletsPerPackedTransaction = clampPackedWalletLimit(input.maxWalletsPerPackedTransaction);
  const maxSerializedBytes = Number.isFinite(input.maxSerializedBytes) && Number(input.maxSerializedBytes) > 0 ? Number(input.maxSerializedBytes) : DEFAULT_MAX_SERIALIZED_BYTES;
  const expectedTransactionMessageHash = input.transactionMessageHash ?? null;
  const simulationHash = input.simulationProof?.transactionMessageHash ?? null;
  const expectedMint = input.expectedMint ?? null;
  const requiredAccounts = Array.from(new Set([...(input.requiredAccounts ?? []), expectedMint].filter((item): item is string => Boolean(item))));
  const unresolved = input.decoded.unresolvedAddressLookupTables ?? [];
  const usesLookupTables = Boolean(input.decoded.usesAddressLookupTables);
  const lookupTablesResolved = usesLookupTables && unresolved.length === 0;
  const packedWalletRequiresLookupTable = expectedSigners.length > 1;
  const policy = policyCheck({
    decoded: input.decoded,
    expectedSigner: expectedSigners[0] ?? null,
    expectedMint,
    allowedPrograms: input.allowedPrograms ?? DEFAULT_ALLOWED_SWAP_PROGRAMS,
    requiredAccounts,
    transactionMessageHash: expectedTransactionMessageHash
  });
  const blockers = [
    expectedSigners.length ? null : 'packed-transaction-expected-signers-required',
    expectedSigners.length > maxWalletsPerPackedTransaction ? `packed-transaction-exceeds-${maxWalletsPerPackedTransaction}-wallet-limit` : null,
    input.serializedBytes > 0 ? null : 'packed-transaction-serialized-bytes-required',
    input.serializedBytes <= maxSerializedBytes ? null : `packed-transaction-exceeds-${maxSerializedBytes}-byte-limit`,
    expectedTransactionMessageHash && expectedTransactionMessageHash !== input.decoded.messageHash ? 'packed-transaction-message-hash-mismatch' : null,
    input.simulationProof ? null : 'packed-transaction-simulation-proof-required',
    input.simulationProof?.status === 'ok' ? null : 'packed-transaction-simulation-status-not-ok',
    simulationHash ? null : 'packed-transaction-simulation-message-hash-required',
    simulationHash && simulationHash === input.decoded.messageHash ? null : 'packed-transaction-simulation-message-hash-mismatch',
    packedWalletRequiresLookupTable && !usesLookupTables ? 'address-lookup-table-required-for-packed-wallet-transaction' : null,
    usesLookupTables && !lookupTablesResolved ? 'address-lookup-table-resolution-required-for-packed-transaction' : null,
    ...expectedSigners.map((signer) => validPublicKey(signer) ? null : `packed-transaction-invalid-signer-${signer}`),
    ...expectedSigners.map((signer) => input.decoded.signerKeys.includes(signer) ? null : `packed-transaction-missing-signer-${signer}`),
    ...requiredAccounts.map((account) => validPublicKey(account) ? null : `packed-transaction-invalid-required-account-${account}`),
    ...policy.blockers
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-jito-packed-transaction-proof-v1',
    status: blockers.length ? 'blocked' : 'verified',
    transactionMessageHash: input.decoded.messageHash,
    expectedTransactionMessageHash,
    walletCount: expectedSigners.length,
    signers: input.decoded.signerKeys,
    expectedSigners,
    serializedBytes: input.serializedBytes,
    limits: {
      maxSerializedBytes,
      maxWalletsPerPackedTransaction
    },
    addressLookupTables: {
      used: usesLookupTables,
      resolved: !usesLookupTables || lookupTablesResolved,
      unresolved,
      proofStatus: packedWalletRequiresLookupTable
        ? usesLookupTables
          ? lookupTablesResolved ? 'required-and-resolved' : 'required-and-unresolved'
          : 'required-but-not-used'
        : 'not-required'
    },
    simulationProof: {
      required: true,
      status: input.simulationProof?.status ?? null,
      transactionMessageHash: simulationHash,
      messageHashMatched: Boolean(simulationHash && simulationHash === input.decoded.messageHash),
      unitsConsumed: input.simulationProof?.unitsConsumed ?? null,
      provider: input.simulationProof?.provider ?? null
    },
    policy: {
      programsAllowed: policy.programsAllowed,
      requiredAccountsMatched: policy.requiredAccountsMatched,
      expectedMintReferenced: expectedMint ? policy.expectedMintReferenced : null
    },
    blockers: Array.from(new Set(blockers)),
    warnings: policy.warnings,
    safety: {
      noSigning: true,
      noRelaySubmit: true,
      noServerCustody: true
    }
  };
}
