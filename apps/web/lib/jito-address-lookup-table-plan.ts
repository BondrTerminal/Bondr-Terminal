import { createHash } from 'node:crypto';
import { AddressLookupTableProgram, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { decodeTransactionPolicy } from './transaction-policy';

const MAX_ADDRESSES_PER_LOOKUP_TABLE = 256;
const DEFAULT_ADDRESSES_PER_EXTEND = 30;
const MAX_ADDRESSES_PER_EXTEND = 30;

export type JitoAddressLookupTableTransaction = {
  id: string;
  action: 'create-lookup-table' | 'extend-lookup-table';
  lookupTableAddress: string;
  addressCount: number;
  addresses: string[];
  requiredSigners: string[];
  transactionBase64: string | null;
  transactionBytes: number | null;
  transactionHash: string | null;
  transactionMessageHash: string | null;
  programs: string[];
  blockers: string[];
};

export type JitoAddressLookupTablePlan = {
  contract: 'bondr-jito-address-lookup-table-plan-v1';
  status: 'planned' | 'blocked';
  lookupTableAddress: string | null;
  authority: string | null;
  payer: string | null;
  recentSlot: number | null;
  recentBlockhash: string | null;
  totalAddresses: number;
  requiredAddresses: string[];
  missingRequiredAddresses: string[];
  chunks: Array<{ index: number; addresses: string[]; count: number }>;
  transactions: JitoAddressLookupTableTransaction[];
  lifecycle: {
    createRequired: boolean;
    extendRequired: boolean;
    maxAddressesPerLookupTable: number;
    maxAddressesPerExtendTransaction: number;
  };
  proof: {
    allRequiredAddressesPlanned: boolean;
    canBuildUnsignedTransactions: boolean;
    lookupTableReadyForPackedTransactions: boolean;
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

function normalizeAddresses(values: Array<string | null | undefined>) {
  const addresses: string[] = [];
  const invalid: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!validPublicKey(trimmed)) {
      invalid.push(trimmed);
      continue;
    }
    addresses.push(new PublicKey(trimmed).toBase58());
  }
  return {
    addresses: Array.from(new Set(addresses)),
    invalid
  };
}

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function buildUnsignedTransaction(args: {
  id: string;
  action: JitoAddressLookupTableTransaction['action'];
  lookupTableAddress: PublicKey;
  payer: PublicKey;
  authority: PublicKey;
  recentBlockhash: string;
  addresses: PublicKey[];
  recentSlot?: number | null;
}) {
  const instruction = args.action === 'create-lookup-table'
    ? AddressLookupTableProgram.createLookupTable({
      authority: args.authority,
      payer: args.payer,
      recentSlot: args.recentSlot ?? 0
    })[0]
    : AddressLookupTableProgram.extendLookupTable({
      lookupTable: args.lookupTableAddress,
      authority: args.authority,
      payer: args.payer,
      addresses: args.addresses
    });
  const transaction = new VersionedTransaction(new TransactionMessage({
    payerKey: args.payer,
    recentBlockhash: args.recentBlockhash,
    instructions: [instruction]
  }).compileToV0Message());
  const bytes = Buffer.from(transaction.serialize());
  const decoded = decodeTransactionPolicy(bytes);
  return {
    transactionBase64: bytes.toString('base64'),
    transactionBytes: bytes.length,
    transactionHash: createHash('sha256').update(bytes).digest('hex'),
    transactionMessageHash: decoded.messageHash,
    programs: decoded.programs
  };
}

export function buildJitoAddressLookupTablePlan(input: {
  authority?: string | null;
  payer?: string | null;
  lookupTableAddress?: string | null;
  addresses: Array<string | null | undefined>;
  requiredAddresses?: Array<string | null | undefined>;
  recentSlot?: number | null;
  recentBlockhash?: string | null;
  includeUnsignedTransactions?: boolean;
  maxAddressesPerExtendTransaction?: number;
}): JitoAddressLookupTablePlan {
  const authority = input.authority && validPublicKey(input.authority) ? new PublicKey(input.authority).toBase58() : null;
  const payer = input.payer && validPublicKey(input.payer) ? new PublicKey(input.payer).toBase58() : null;
  const normalized = normalizeAddresses(input.addresses);
  const required = normalizeAddresses(input.requiredAddresses ?? []);
  const addresses = normalized.addresses;
  const requiredAddresses = required.addresses;
  const addressSet = new Set(addresses);
  const missingRequiredAddresses = requiredAddresses.filter((address) => !addressSet.has(address));
  const maxAddressesPerExtendTransaction = Math.max(1, Math.min(
    Math.floor(input.maxAddressesPerExtendTransaction ?? DEFAULT_ADDRESSES_PER_EXTEND),
    MAX_ADDRESSES_PER_EXTEND
  ));
  const extendChunks = chunk(addresses, maxAddressesPerExtendTransaction).map((addresses, index) => ({ index, addresses, count: addresses.length }));
  const lookupTableAddress = input.lookupTableAddress && validPublicKey(input.lookupTableAddress)
    ? new PublicKey(input.lookupTableAddress).toBase58()
    : authority && payer && Number.isInteger(input.recentSlot)
      ? AddressLookupTableProgram.createLookupTable({
        authority: new PublicKey(authority),
        payer: new PublicKey(payer),
        recentSlot: input.recentSlot!
      })[1].toBase58()
      : null;
  const canBuildUnsignedTransactions = Boolean(input.includeUnsignedTransactions && authority && payer && lookupTableAddress && input.recentBlockhash);
  const transactionBlockers = [
    input.includeUnsignedTransactions && !authority ? 'lookup-table-authority-required' : null,
    input.includeUnsignedTransactions && !payer ? 'lookup-table-payer-required' : null,
    input.includeUnsignedTransactions && !lookupTableAddress ? 'lookup-table-address-or-recent-slot-required' : null,
    input.includeUnsignedTransactions && !input.recentBlockhash ? 'recent-blockhash-required-for-unsigned-lookup-table-transactions' : null
  ].filter((item): item is string => Boolean(item));

  const transactions: JitoAddressLookupTableTransaction[] = [];
  if (lookupTableAddress) {
    const lookupTable = new PublicKey(lookupTableAddress);
    if (!input.lookupTableAddress) {
      const built = canBuildUnsignedTransactions
        ? buildUnsignedTransaction({
          id: 'lookup-table-create',
          action: 'create-lookup-table',
          lookupTableAddress: lookupTable,
          payer: new PublicKey(payer!),
          authority: new PublicKey(authority!),
          recentBlockhash: input.recentBlockhash!,
          addresses: [],
          recentSlot: input.recentSlot
        })
        : null;
      transactions.push({
        id: 'lookup-table-create',
        action: 'create-lookup-table',
        lookupTableAddress,
        addressCount: 0,
        addresses: [],
        requiredSigners: [authority, payer].filter((item): item is string => Boolean(item)),
        transactionBase64: built?.transactionBase64 ?? null,
        transactionBytes: built?.transactionBytes ?? null,
        transactionHash: built?.transactionHash ?? null,
        transactionMessageHash: built?.transactionMessageHash ?? null,
        programs: built?.programs ?? [],
        blockers: transactionBlockers
      });
    }
    for (const chunk of extendChunks) {
      const built = canBuildUnsignedTransactions
        ? buildUnsignedTransaction({
          id: `lookup-table-extend-${chunk.index}`,
          action: 'extend-lookup-table',
          lookupTableAddress: lookupTable,
          payer: new PublicKey(payer!),
          authority: new PublicKey(authority!),
          recentBlockhash: input.recentBlockhash!,
          addresses: chunk.addresses.map((address) => new PublicKey(address))
        })
        : null;
      transactions.push({
        id: `lookup-table-extend-${chunk.index}`,
        action: 'extend-lookup-table',
        lookupTableAddress,
        addressCount: chunk.count,
        addresses: chunk.addresses,
        requiredSigners: [authority, payer].filter((item): item is string => Boolean(item)),
        transactionBase64: built?.transactionBase64 ?? null,
        transactionBytes: built?.transactionBytes ?? null,
        transactionHash: built?.transactionHash ?? null,
        transactionMessageHash: built?.transactionMessageHash ?? null,
        programs: built?.programs ?? [],
        blockers: transactionBlockers
      });
    }
  }

  const blockers = [
    authority ? null : 'lookup-table-authority-required',
    payer ? null : 'lookup-table-payer-required',
    addresses.length ? null : 'lookup-table-addresses-required',
    addresses.length <= MAX_ADDRESSES_PER_LOOKUP_TABLE ? null : `lookup-table-exceeds-${MAX_ADDRESSES_PER_LOOKUP_TABLE}-address-limit`,
    normalized.invalid.length ? `lookup-table-invalid-addresses:${normalized.invalid.join(',')}` : null,
    required.invalid.length ? `lookup-table-invalid-required-addresses:${required.invalid.join(',')}` : null,
    missingRequiredAddresses.length ? 'lookup-table-required-addresses-missing-from-plan' : null,
    input.includeUnsignedTransactions && !canBuildUnsignedTransactions ? 'lookup-table-unsigned-transaction-build-blocked' : null,
    ...transactionBlockers
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-jito-address-lookup-table-plan-v1',
    status: blockers.length ? 'blocked' : 'planned',
    lookupTableAddress,
    authority,
    payer,
    recentSlot: Number.isInteger(input.recentSlot) ? input.recentSlot! : null,
    recentBlockhash: input.recentBlockhash ?? null,
    totalAddresses: addresses.length,
    requiredAddresses,
    missingRequiredAddresses,
    chunks: extendChunks,
    transactions,
    lifecycle: {
      createRequired: !input.lookupTableAddress,
      extendRequired: addresses.length > 0,
      maxAddressesPerLookupTable: MAX_ADDRESSES_PER_LOOKUP_TABLE,
      maxAddressesPerExtendTransaction
    },
    proof: {
      allRequiredAddressesPlanned: missingRequiredAddresses.length === 0,
      canBuildUnsignedTransactions,
      lookupTableReadyForPackedTransactions: blockers.length === 0 && Boolean(lookupTableAddress)
    },
    blockers: Array.from(new Set(blockers)),
    warnings: [
      extendChunks.length > 1 ? 'lookup-table-extension-requires-multiple-transactions' : null,
      transactions.length > 5 ? 'lookup-table-lifecycle-exceeds-one-jito-bundle-wave' : null
    ].filter((item): item is string => Boolean(item)),
    safety: {
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      noServerCustody: true
    }
  };
}
