import { VersionedTransaction } from '@solana/web3.js';
import type { JitoPackedInstructionInput } from './jito-packed-transaction-builder';
import { decodeTransactionPolicy } from './transaction-policy';

export type JitoPreparedRouteKind = 'pumpfun-launch' | 'raydium-lp' | 'jupiter-swap';

export type JitoPreparedRouteTransactionInput = {
  id: string;
  rail?: JitoPackedInstructionInput['rail'];
  transactionBase64: string;
  expectedSigner?: string | null;
  expectedMint?: string | null;
  routeKind?: JitoPreparedRouteKind | null;
  sourceEndpoint?: string | null;
  routePolicyStatus?: 'passed' | 'blocked' | 'failed' | 'missing' | null;
  routePolicyTransactionMessageHash?: string | null;
};

export type JitoPreparedRouteAcceptance = {
  id: string;
  routeKind: JitoPreparedRouteKind | 'generic';
  sourceEndpoint: string | null;
  status: 'accepted' | 'blocked';
  transactionMessageHash: string | null;
  expectedSigner: string | null;
  expectedMint: string | null;
  blockers: string[];
};

export type JitoRouteInstructionSource = {
  contract: 'bondr-jito-route-instruction-source-v1';
  status: 'ready' | 'blocked';
  preparedTransactionIds: string[];
  routeAcceptance: JitoPreparedRouteAcceptance[];
  instructions: JitoPackedInstructionInput[];
  expectedSigners: string[];
  transactionMessageHashes: string[];
  blockers: string[];
  safety: {
    noSigning: true;
    noBroadcast: true;
    noRelaySubmit: true;
    noServerCustody: true;
  };
};

const ROUTE_ENDPOINTS: Record<JitoPreparedRouteKind, string[]> = {
  'pumpfun-launch': ['/api/deployment/pumpportal/build-create'],
  'raydium-lp': ['/api/deployment/raydium/build-lp'],
  'jupiter-swap': ['/api/execution-swap', '/api/routers/jupiter/build-swap']
};

const HASH_RE = /^[a-f0-9]{64}$/i;
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function routeAcceptanceFor(prepared: JitoPreparedRouteTransactionInput, decoded: ReturnType<typeof decodeTransactionPolicy> | null): JitoPreparedRouteAcceptance {
  const id = prepared.id || 'unknown';
  const routeKind = prepared.routeKind ?? 'generic';
  const sourceEndpoint = prepared.sourceEndpoint?.trim() || null;
  const expectedSigner = prepared.expectedSigner?.trim() || null;
  const expectedMint = prepared.expectedMint?.trim() || null;
  if (routeKind === 'generic') {
    return {
      id,
      routeKind,
      sourceEndpoint,
      status: decoded ? 'accepted' : 'blocked',
      transactionMessageHash: decoded?.messageHash ?? null,
      expectedSigner,
      expectedMint,
      blockers: decoded ? [] : [`prepared-route-transaction-${id}-decode-required`]
    };
  }

  const routePolicyHash = prepared.routePolicyTransactionMessageHash?.trim().toLowerCase() || null;
  const allowedEndpoints = ROUTE_ENDPOINTS[routeKind];
  const blockers = [
    sourceEndpoint && allowedEndpoints.includes(sourceEndpoint) ? null : `prepared-route-transaction-${id}-${routeKind}-source-endpoint-required`,
    prepared.routePolicyStatus === 'passed' ? null : `prepared-route-transaction-${id}-${routeKind}-policy-proof-required`,
    routePolicyHash && HASH_RE.test(routePolicyHash) ? null : `prepared-route-transaction-${id}-${routeKind}-policy-message-hash-required`,
    decoded && routePolicyHash === decoded.messageHash ? null : `prepared-route-transaction-${id}-${routeKind}-policy-message-hash-mismatch`,
    expectedSigner && decoded?.signerKeys.includes(expectedSigner) ? null : `prepared-route-transaction-${id}-${routeKind}-expected-signer-required`,
    expectedMint && ADDRESS_RE.test(expectedMint) && decoded?.accountKeys.includes(expectedMint) ? null : expectedMint ? `prepared-route-transaction-${id}-${routeKind}-expected-mint-not-referenced` : null
  ].filter((item): item is string => Boolean(item));

  return {
    id,
    routeKind,
    sourceEndpoint,
    status: blockers.length ? 'blocked' : 'accepted',
    transactionMessageHash: decoded?.messageHash ?? null,
    expectedSigner,
    expectedMint,
    blockers: Array.from(new Set(blockers))
  };
}

export function buildJitoRouteInstructionSource(input: {
  preparedTransactions: JitoPreparedRouteTransactionInput[];
}): JitoRouteInstructionSource {
  const instructions: JitoPackedInstructionInput[] = [];
  const expectedSigners: string[] = [];
  const transactionMessageHashes: string[] = [];
  const routeAcceptance: JitoPreparedRouteAcceptance[] = [];
  const blockers: string[] = [];

  for (const prepared of input.preparedTransactions) {
    if (!prepared.id) blockers.push('prepared-route-transaction-id-required');
    if (!prepared.transactionBase64) {
      blockers.push(`prepared-route-transaction-${prepared.id || 'unknown'}-base64-required`);
      continue;
    }
    try {
      const raw = Buffer.from(prepared.transactionBase64, 'base64');
      const transaction = VersionedTransaction.deserialize(raw);
      const decoded = decodeTransactionPolicy(raw);
      const acceptance = routeAcceptanceFor(prepared, decoded);
      routeAcceptance.push(acceptance);
      blockers.push(...acceptance.blockers);
      transactionMessageHashes.push(decoded.messageHash);
      if (prepared.expectedSigner) expectedSigners.push(prepared.expectedSigner);
      if (transaction.message.addressTableLookups.length) {
        blockers.push(`prepared-route-transaction-${prepared.id || 'unknown'}-lookup-table-decompile-requires-resolved-source`);
        continue;
      }
      for (const [instructionIndex, instruction] of transaction.message.compiledInstructions.entries()) {
        const program = transaction.message.staticAccountKeys[instruction.programIdIndex];
        if (!program) {
          blockers.push(`prepared-route-transaction-${prepared.id || 'unknown'}-instruction-${instructionIndex}-program-missing`);
          continue;
        }
        instructions.push({
          id: `${prepared.id}-ix-${instructionIndex}`,
          rail: prepared.rail ?? 'bundle',
          programId: program.toBase58(),
          expectedSigner: prepared.expectedSigner ?? null,
          keys: instruction.accountKeyIndexes.map((accountIndex) => {
            const key = transaction.message.staticAccountKeys[accountIndex];
            return {
              pubkey: key?.toBase58() ?? '',
              isSigner: transaction.message.isAccountSigner(accountIndex),
              isWritable: transaction.message.isAccountWritable(accountIndex)
            };
          }).filter((key) => key.pubkey),
          dataBase64: Buffer.from(instruction.data).toString('base64')
        });
      }
    } catch {
      blockers.push(`prepared-route-transaction-${prepared.id || 'unknown'}-decode-failed`);
      routeAcceptance.push(routeAcceptanceFor(prepared, null));
    }
  }

  return {
    contract: 'bondr-jito-route-instruction-source-v1',
    status: blockers.length ? 'blocked' : 'ready',
    preparedTransactionIds: input.preparedTransactions.map((tx) => tx.id).filter(Boolean),
    routeAcceptance,
    instructions,
    expectedSigners: Array.from(new Set(expectedSigners)),
    transactionMessageHashes: Array.from(new Set(transactionMessageHashes)),
    blockers: Array.from(new Set(blockers)),
    safety: {
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      noServerCustody: true
    }
  };
}
