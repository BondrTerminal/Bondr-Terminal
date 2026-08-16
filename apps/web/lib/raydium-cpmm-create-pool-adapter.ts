import { createHash } from 'node:crypto';
import BN from 'bn.js';
import {
  CREATE_CPMM_POOL_FEE_ACC,
  CREATE_CPMM_POOL_PROGRAM,
  getCreatePoolKeys,
  makeCreateCpmmPoolInInstruction
} from '@raydium-io/raydium-sdk-v2';
import { PublicKey, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { decodeTransactionPolicy, policyCheck } from './transaction-policy';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export const RAYDIUM_CPMM_CREATE_POOL_ALLOWED_PROGRAMS = [
  CREATE_CPMM_POOL_PROGRAM.toBase58(),
  TOKEN_PROGRAM_ID.toBase58(),
  ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
  '11111111111111111111111111111111',
  'ComputeBudget111111111111111111111111111111'
];

export type RaydiumCpmmCreatePoolInput = {
  creator: string | null;
  baseMint: string | null;
  quoteMint?: string | null;
  baseDecimals?: number | null;
  quoteDecimals?: number | null;
  baseAmountRaw?: string | number | bigint | null;
  quoteAmountRaw?: string | number | bigint | null;
  configId?: string | null;
  poolFeeAccount?: string | null;
  recentBlockhash?: string | null;
  openTime?: number | string | null;
  includeUnsignedTransaction?: boolean;
};

export type RaydiumCpmmCreatePoolBuild = {
  contract: 'bondr-raydium-cpmm-create-pool-build-v1';
  status: 'preview-ready' | 'built' | 'blocked';
  execution: 'raydium-cpmm-create-pool-preview-no-signing-no-broadcast' | 'unsigned-raydium-cpmm-create-pool-built-no-signing-no-broadcast';
  sdk: {
    package: '@raydium-io/raydium-sdk-v2';
    primitive: 'makeCreateCpmmPoolInInstruction';
    pdaHelper: 'getCreatePoolKeys';
  };
  creator: string | null;
  baseMint: string | null;
  quoteMint: string | null;
  configId: string | null;
  poolFeeAccount: string | null;
  derived: {
    poolId: string | null;
    authority: string | null;
    lpMint: string | null;
    vaultA: string | null;
    vaultB: string | null;
    observationId: string | null;
    userBaseAta: string | null;
    userQuoteAta: string | null;
    userLpAta: string | null;
  };
  amounts: {
    baseAmountRaw: string | null;
    quoteAmountRaw: string | null;
    openTime: string | null;
  };
  requiredSigners: string[];
  writableAccounts: string[];
  simulationRequest: {
    required: true;
    endpoint: '/api/transaction-policy/simulate-or-provider-simulate';
    mustPassBeforeSigning: true;
  };
  transactionBase64?: string;
  transactionHash?: string;
  transactionBytes?: number;
  messageHash?: string;
  programs?: string[];
  accountKeys?: string[];
  policyReview?: {
    signerMatched: boolean;
    baseMintReferenced: boolean;
    quoteMintReferenced: boolean;
    requiredAccountsMatched: boolean;
    programsAllowed: boolean;
    transactionMessageHash: string;
    allowedPrograms: string[];
    requiredAccounts: string[];
    safeToRequestSignatureAfterSimulation: boolean;
    blockers: string[];
    warnings: string[];
  };
  blockers: string[];
  warnings: string[];
  safety: {
    noSigning: true;
    noBroadcast: true;
    noServerCustody: true;
    requiresOperatorAuthForUnsignedBuild: true;
    requiresSimulationBeforeSigning: true;
    requiresLpMintProofAfterBroadcast: true;
  };
};

function parsePk(value: string | null | undefined, label: string) {
  if (!value || !ADDRESS_RE.test(value)) throw new Error(`${label} must be a valid public key.`);
  return new PublicKey(value);
}

function maybePk(value: string | null | undefined) {
  if (!value) return null;
  try {
    return parsePk(value, 'publicKey');
  } catch {
    return null;
  }
}

function integer(value: unknown, fallback: number) {
  return Number.isInteger(value) ? Number(value) : fallback;
}

function rawAmount(value: unknown) {
  if (typeof value === 'bigint') return value > 0n ? value.toString() : null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value).toString();
  if (typeof value === 'string' && /^\d+$/.test(value.trim()) && BigInt(value.trim()) > 0n) return value.trim();
  return null;
}

function bn(value: string | null) {
  if (!value) throw new Error('amount raw value is required.');
  return new BN(value);
}

function ataAddress(owner: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0];
}

function hash(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function blockPreview(input: RaydiumCpmmCreatePoolInput): RaydiumCpmmCreatePoolBuild {
  const creator = maybePk(input.creator ?? null);
  const baseMint = maybePk(input.baseMint ?? null);
  const quoteMint = maybePk(input.quoteMint ?? WSOL_MINT);
  const configId = maybePk(input.configId ?? null);
  const poolFeeAccount = maybePk(input.poolFeeAccount ?? CREATE_CPMM_POOL_FEE_ACC.toBase58());
  const baseAmountRaw = rawAmount(input.baseAmountRaw);
  const quoteAmountRaw = rawAmount(input.quoteAmountRaw);
  const blockers = [
    creator ? null : 'creator-required',
    baseMint ? null : 'base-mint-required',
    quoteMint ? null : 'quote-mint-required',
    configId ? null : 'raydium-cpmm-config-id-required',
    poolFeeAccount ? null : 'raydium-pool-fee-account-required',
    baseAmountRaw ? null : 'base-amount-raw-required',
    quoteAmountRaw ? null : 'quote-amount-raw-required',
    integer(input.baseDecimals, -1) >= 0 ? null : 'base-decimals-required',
    integer(input.quoteDecimals, -1) >= 0 ? null : 'quote-decimals-required'
  ].filter((item): item is string => Boolean(item));
  const keys = creator && baseMint && quoteMint && configId
    ? getCreatePoolKeys({ programId: CREATE_CPMM_POOL_PROGRAM, configId, mintA: baseMint, mintB: quoteMint })
    : null;
  const userBaseAta = creator && baseMint ? ataAddress(creator, baseMint) : null;
  const userQuoteAta = creator && quoteMint ? ataAddress(creator, quoteMint) : null;
  const userLpAta = creator && keys?.lpMint ? ataAddress(creator, keys.lpMint) : null;

  return {
    contract: 'bondr-raydium-cpmm-create-pool-build-v1',
    status: blockers.length ? 'blocked' : 'preview-ready',
    execution: 'raydium-cpmm-create-pool-preview-no-signing-no-broadcast',
    sdk: {
      package: '@raydium-io/raydium-sdk-v2',
      primitive: 'makeCreateCpmmPoolInInstruction',
      pdaHelper: 'getCreatePoolKeys'
    },
    creator: creator?.toBase58() ?? null,
    baseMint: baseMint?.toBase58() ?? null,
    quoteMint: quoteMint?.toBase58() ?? null,
    configId: configId?.toBase58() ?? null,
    poolFeeAccount: poolFeeAccount?.toBase58() ?? null,
    derived: {
      poolId: keys?.poolId.toBase58() ?? null,
      authority: keys?.authority.toBase58() ?? null,
      lpMint: keys?.lpMint.toBase58() ?? null,
      vaultA: keys?.vaultA.toBase58() ?? null,
      vaultB: keys?.vaultB.toBase58() ?? null,
      observationId: keys?.observationId.toBase58() ?? null,
      userBaseAta: userBaseAta?.toBase58() ?? null,
      userQuoteAta: userQuoteAta?.toBase58() ?? null,
      userLpAta: userLpAta?.toBase58() ?? null
    },
    amounts: {
      baseAmountRaw,
      quoteAmountRaw,
      openTime: String(input.openTime ?? 0)
    },
    requiredSigners: creator ? [creator.toBase58()] : [],
    writableAccounts: [
      keys?.poolId,
      keys?.lpMint,
      userBaseAta,
      userQuoteAta,
      userLpAta,
      keys?.vaultA,
      keys?.vaultB,
      keys?.observationId
    ].filter((item): item is PublicKey => Boolean(item)).map((item) => item.toBase58()),
    simulationRequest: {
      required: true,
      endpoint: '/api/transaction-policy/simulate-or-provider-simulate',
      mustPassBeforeSigning: true
    },
    blockers: Array.from(new Set(blockers)),
    warnings: [
      'User base/quote/LP token accounts must exist or be created in a reviewed prerequisite transaction.',
      'Raydium config id must come from Raydium config discovery, not operator guesswork.'
    ],
    safety: {
      noSigning: true,
      noBroadcast: true,
      noServerCustody: true,
      requiresOperatorAuthForUnsignedBuild: true,
      requiresSimulationBeforeSigning: true,
      requiresLpMintProofAfterBroadcast: true
    }
  };
}

export function buildRaydiumCpmmCreatePoolTransaction(input: RaydiumCpmmCreatePoolInput): RaydiumCpmmCreatePoolBuild {
  const preview = blockPreview(input);
  if (!input.includeUnsignedTransaction || preview.blockers.length) return preview;
  if (!input.recentBlockhash || input.recentBlockhash.length < 32) {
    return { ...preview, status: 'blocked', blockers: Array.from(new Set([...preview.blockers, 'recent-blockhash-required'])) };
  }

  const creator = parsePk(preview.creator, 'creator');
  const baseMint = parsePk(preview.baseMint, 'baseMint');
  const quoteMint = parsePk(preview.quoteMint, 'quoteMint');
  const configId = parsePk(preview.configId, 'configId');
  const poolFeeAccount = parsePk(preview.poolFeeAccount, 'poolFeeAccount');
  const poolId = parsePk(preview.derived.poolId, 'poolId');
  const authority = parsePk(preview.derived.authority, 'authority');
  const lpMint = parsePk(preview.derived.lpMint, 'lpMint');
  const vaultA = parsePk(preview.derived.vaultA, 'vaultA');
  const vaultB = parsePk(preview.derived.vaultB, 'vaultB');
  const observationId = parsePk(preview.derived.observationId, 'observationId');
  const userBaseAta = parsePk(preview.derived.userBaseAta, 'userBaseAta');
  const userQuoteAta = parsePk(preview.derived.userQuoteAta, 'userQuoteAta');
  const userLpAta = parsePk(preview.derived.userLpAta, 'userLpAta');

  const instruction = makeCreateCpmmPoolInInstruction(
    CREATE_CPMM_POOL_PROGRAM,
    creator,
    configId,
    authority,
    poolId,
    baseMint,
    quoteMint,
    lpMint,
    userBaseAta,
    userQuoteAta,
    userLpAta,
    vaultA,
    vaultB,
    poolFeeAccount,
    TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    observationId,
    bn(preview.amounts.baseAmountRaw),
    bn(preview.amounts.quoteAmountRaw),
    new BN(String(input.openTime ?? 0))
  );
  const tx = new Transaction();
  tx.feePayer = creator;
  tx.recentBlockhash = input.recentBlockhash;
  tx.add(instruction);
  const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const decoded = decodeTransactionPolicy(bytes);
  const requiredAccounts = [
    baseMint,
    quoteMint,
    poolId,
    lpMint,
    vaultA,
    vaultB,
    observationId,
    userBaseAta,
    userQuoteAta,
    userLpAta
  ].map((key) => key.toBase58());
  const policy = policyCheck({
    decoded,
    expectedSigner: creator.toBase58(),
    expectedMint: baseMint.toBase58(),
    allowedPrograms: RAYDIUM_CPMM_CREATE_POOL_ALLOWED_PROGRAMS,
    requiredAccounts
  });

  return {
    ...preview,
    status: 'built',
    execution: 'unsigned-raydium-cpmm-create-pool-built-no-signing-no-broadcast',
    transactionBase64: Buffer.from(bytes).toString('base64'),
    transactionHash: hash(Buffer.from(bytes)),
    transactionBytes: bytes.length,
    messageHash: decoded.messageHash,
    programs: decoded.programs,
    accountKeys: decoded.accountKeys,
    policyReview: {
      signerMatched: policy.signerMatched,
      baseMintReferenced: policy.expectedMintReferenced,
      quoteMintReferenced: decoded.accountKeys.includes(quoteMint.toBase58()),
      requiredAccountsMatched: policy.requiredAccountsMatched,
      programsAllowed: policy.programsAllowed,
      transactionMessageHash: policy.transactionMessageHash,
      allowedPrograms: policy.allowedPrograms,
      requiredAccounts: policy.requiredAccounts,
      safeToRequestSignatureAfterSimulation: policy.blockers.length === 0,
      blockers: policy.blockers,
      warnings: policy.warnings
    },
    blockers: []
  };
}
