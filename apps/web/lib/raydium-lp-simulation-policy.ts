import { RAYDIUM_CPMM_CREATE_POOL_ALLOWED_PROGRAMS } from './raydium-cpmm-create-pool-adapter';
import { decodeTransactionPolicy, policyCheck } from './transaction-policy';

export type RaydiumLpSimulationProof = {
  err?: unknown;
  logs?: string[] | null;
  unitsConsumed?: number | null;
  provider?: string | null;
};

export type RaydiumLpSimulationPolicyInput = {
  transactionBase64?: string | null;
  expectedSigner?: string | null;
  baseMint?: string | null;
  quoteMint?: string | null;
  requiredAccounts?: string[] | null;
  allowedPrograms?: string[] | null;
  transactionMessageHash?: string | null;
  simulationProof?: RaydiumLpSimulationProof | null;
};

export type RaydiumLpSimulationPolicy = {
  contract: 'bondr-raydium-lp-simulation-policy-v1';
  status: 'passed' | 'blocked';
  execution: 'raydium-lp-policy-and-simulation-review-no-signing-no-broadcast';
  decoded: {
    kind: 'legacy' | 'versioned' | null;
    signerKeys: string[];
    accountKeys: string[];
    programs: string[];
    messageHash: string | null;
  };
  policyReview: {
    signerMatched: boolean;
    baseMintReferenced: boolean;
    quoteMintReferenced: boolean;
    requiredAccountsMatched: boolean;
    programsAllowed: boolean;
    transactionMessageHash: string | null;
    allowedPrograms: string[];
    requiredAccounts: string[];
    blockers: string[];
    warnings: string[];
  };
  simulationReview: {
    required: true;
    provided: boolean;
    passed: boolean;
    err: unknown;
    unitsConsumed: number | null;
    provider: string | null;
    logSample: string[];
  };
  safeToRequestSignature: boolean;
  blockers: string[];
  warnings: string[];
  safety: {
    noSigning: true;
    noBroadcast: true;
    noServerCustody: true;
    requiresSimulationBeforeSigning: true;
  };
};

function asStringArray(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
}

function decodeBase64(value: string | null | undefined) {
  if (!value || typeof value !== 'string') return null;
  try {
    const bytes = Buffer.from(value, 'base64');
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

function emptyPolicy(blockers: string[]): RaydiumLpSimulationPolicy {
  return {
    contract: 'bondr-raydium-lp-simulation-policy-v1',
    status: 'blocked',
    execution: 'raydium-lp-policy-and-simulation-review-no-signing-no-broadcast',
    decoded: { kind: null, signerKeys: [], accountKeys: [], programs: [], messageHash: null },
    policyReview: {
      signerMatched: false,
      baseMintReferenced: false,
      quoteMintReferenced: false,
      requiredAccountsMatched: false,
      programsAllowed: false,
      transactionMessageHash: null,
      allowedPrograms: RAYDIUM_CPMM_CREATE_POOL_ALLOWED_PROGRAMS,
      requiredAccounts: [],
      blockers,
      warnings: []
    },
    simulationReview: {
      required: true,
      provided: false,
      passed: false,
      err: null,
      unitsConsumed: null,
      provider: null,
      logSample: []
    },
    safeToRequestSignature: false,
    blockers,
    warnings: [],
    safety: {
      noSigning: true,
      noBroadcast: true,
      noServerCustody: true,
      requiresSimulationBeforeSigning: true
    }
  };
}

export function buildRaydiumLpSimulationPolicy(input: RaydiumLpSimulationPolicyInput): RaydiumLpSimulationPolicy {
  const raw = decodeBase64(input.transactionBase64);
  if (!raw) return emptyPolicy(['transaction-base64-required']);

  let decoded: ReturnType<typeof decodeTransactionPolicy>;
  try {
    decoded = decodeTransactionPolicy(raw);
  } catch {
    return emptyPolicy(['transaction-decode-failed']);
  }

  const requiredAccounts = Array.from(new Set([
    ...asStringArray(input.requiredAccounts),
    input.baseMint,
    input.quoteMint
  ].filter((item): item is string => Boolean(item))));
  const policy = policyCheck({
    decoded,
    expectedSigner: input.expectedSigner ?? null,
    expectedMint: input.baseMint ?? null,
    allowedPrograms: asStringArray(input.allowedPrograms).length ? asStringArray(input.allowedPrograms) : RAYDIUM_CPMM_CREATE_POOL_ALLOWED_PROGRAMS,
    requiredAccounts,
    transactionMessageHash: input.transactionMessageHash ?? null
  });
  const proof = input.simulationProof ?? null;
  const simulationPassed = Boolean(proof && proof.err === null);
  const simulationBlockers = [
    proof ? null : 'simulation-proof-required',
    proof && proof.err !== null ? 'simulation-failed' : null
  ].filter((item): item is string => Boolean(item));
  const blockers = Array.from(new Set([...policy.blockers, ...simulationBlockers]));

  return {
    contract: 'bondr-raydium-lp-simulation-policy-v1',
    status: blockers.length ? 'blocked' : 'passed',
    execution: 'raydium-lp-policy-and-simulation-review-no-signing-no-broadcast',
    decoded: {
      kind: decoded.kind,
      signerKeys: decoded.signerKeys,
      accountKeys: decoded.accountKeys,
      programs: decoded.programs,
      messageHash: decoded.messageHash
    },
    policyReview: {
      signerMatched: policy.signerMatched,
      baseMintReferenced: policy.expectedMintReferenced,
      quoteMintReferenced: Boolean(input.quoteMint && decoded.accountKeys.includes(input.quoteMint)),
      requiredAccountsMatched: policy.requiredAccountsMatched,
      programsAllowed: policy.programsAllowed,
      transactionMessageHash: policy.transactionMessageHash,
      allowedPrograms: policy.allowedPrograms,
      requiredAccounts: policy.requiredAccounts,
      blockers: policy.blockers,
      warnings: policy.warnings
    },
    simulationReview: {
      required: true,
      provided: Boolean(proof),
      passed: simulationPassed,
      err: proof?.err ?? null,
      unitsConsumed: proof?.unitsConsumed ?? null,
      provider: proof?.provider ?? null,
      logSample: (proof?.logs ?? []).slice(0, 12)
    },
    safeToRequestSignature: blockers.length === 0,
    blockers,
    warnings: policy.warnings,
    safety: {
      noSigning: true,
      noBroadcast: true,
      noServerCustody: true,
      requiresSimulationBeforeSigning: true
    }
  };
}
