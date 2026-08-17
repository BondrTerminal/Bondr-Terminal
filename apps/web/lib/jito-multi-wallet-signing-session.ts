import { VersionedTransaction } from '@solana/web3.js';
import { decodeTransactionPolicy } from './transaction-policy';

export type JitoSigningTransactionInput = {
  id: string;
  waveIndex: number;
  transactionBase64?: string | null;
  transactionMessageHash: string;
  requiredSigners: string[];
  blockhashExpiresAt?: string | null;
};

export type JitoMultiWalletSigningSession = {
  contract: 'bondr-jito-multi-wallet-signing-session-v1';
  status: 'complete' | 'blocked';
  transactionCount: number;
  requiredSignerCount: number;
  signedSignerCount: number;
  missingSignerCount: number;
  transactions: Array<{
    id: string;
    waveIndex: number;
    transactionMessageHash: string;
    requiredSigners: string[];
    signedSigners: string[];
    missingSigners: string[];
    blockhashExpiresAt: string | null;
    expired: boolean;
    blockers: string[];
  }>;
  signingOrder: string[];
  nextSigner: string | null;
  blockers: string[];
  safety: {
    noSigning: true;
    noBroadcast: true;
    noRelaySubmit: true;
    noServerCustody: true;
    rebuildAllOnExpiry: true;
  };
};

function nonZeroSignature(signature: Uint8Array | undefined) {
  return Boolean(signature && signature.some((byte) => byte !== 0));
}

function signedSignersFromBase64(transactionBase64: string | null | undefined, expectedMessageHash: string) {
  if (!transactionBase64) return { signedSigners: [] as string[], blockers: ['signed-transaction-required'] };
  try {
    const raw = Buffer.from(transactionBase64, 'base64');
    const transaction = VersionedTransaction.deserialize(raw);
    const decoded = decodeTransactionPolicy(raw);
    const blockers = decoded.messageHash === expectedMessageHash ? [] : ['signed-transaction-message-hash-mismatch'];
    const signedSigners = transaction.message.staticAccountKeys
      .slice(0, transaction.signatures.length)
      .map((key, index) => nonZeroSignature(transaction.signatures[index]) ? key.toBase58() : null)
      .filter((key): key is string => Boolean(key));
    return { signedSigners, blockers };
  } catch {
    return { signedSigners: [] as string[], blockers: ['signed-transaction-decode-failed'] };
  }
}

export function buildJitoMultiWalletSigningSession(input: {
  transactions: JitoSigningTransactionInput[];
  signingOrder?: string[] | null;
}): JitoMultiWalletSigningSession {
  const signingOrder = Array.from(new Set((input.signingOrder?.length ? input.signingOrder : input.transactions.flatMap((tx) => tx.requiredSigners)).filter(Boolean)));
  const transactions = input.transactions.map((tx) => {
    const requiredSigners = Array.from(new Set(tx.requiredSigners.filter(Boolean)));
    const signed = signedSignersFromBase64(tx.transactionBase64, tx.transactionMessageHash);
    const signedSigners = requiredSigners.filter((signer) => signed.signedSigners.includes(signer));
    const missingSigners = requiredSigners.filter((signer) => !signedSigners.includes(signer));
    const expired = tx.blockhashExpiresAt ? Date.parse(tx.blockhashExpiresAt) <= Date.now() : false;
    const blockers = [
      tx.id ? null : 'signing-transaction-id-required',
      tx.transactionMessageHash ? null : `signing-transaction-${tx.id || 'unknown'}-message-hash-required`,
      requiredSigners.length ? null : `signing-transaction-${tx.id || 'unknown'}-required-signers-missing`,
      expired ? `signing-transaction-${tx.id || 'unknown'}-blockhash-expired-rebuild-required` : null,
      ...signed.blockers.map((blocker) => `signing-transaction-${tx.id || 'unknown'}-${blocker}`),
      ...missingSigners.map((signer) => `signing-transaction-${tx.id || 'unknown'}-missing-signature-${signer}`),
      ...requiredSigners.map((signer) => signingOrder.includes(signer) ? null : `signing-transaction-${tx.id || 'unknown'}-signer-not-in-order-${signer}`)
    ].filter((item): item is string => Boolean(item));
    return {
      id: tx.id,
      waveIndex: tx.waveIndex,
      transactionMessageHash: tx.transactionMessageHash,
      requiredSigners,
      signedSigners,
      missingSigners,
      blockhashExpiresAt: tx.blockhashExpiresAt ?? null,
      expired,
      blockers: Array.from(new Set(blockers))
    };
  });
  const missingSigners = Array.from(new Set(transactions.flatMap((tx) => tx.missingSigners)));
  const signedSigners = Array.from(new Set(transactions.flatMap((tx) => tx.signedSigners)));
  const blockers = Array.from(new Set([
    input.transactions.length ? null : 'signing-transactions-required',
    ...transactions.flatMap((tx) => tx.blockers)
  ].filter((item): item is string => Boolean(item))));

  return {
    contract: 'bondr-jito-multi-wallet-signing-session-v1',
    status: blockers.length ? 'blocked' : 'complete',
    transactionCount: input.transactions.length,
    requiredSignerCount: Array.from(new Set(transactions.flatMap((tx) => tx.requiredSigners))).length,
    signedSignerCount: signedSigners.length,
    missingSignerCount: missingSigners.length,
    transactions,
    signingOrder,
    nextSigner: signingOrder.find((signer) => missingSigners.includes(signer)) ?? missingSigners[0] ?? null,
    blockers,
    safety: {
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      noServerCustody: true,
      rebuildAllOnExpiry: true
    }
  };
}
