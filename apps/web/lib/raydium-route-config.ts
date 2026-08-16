import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { walletPlanEntries, type Project, type Wallet, type WalletPlanEntry } from './meridian-store';
import { buildRaydiumCpmmCreatePoolTransaction } from './raydium-cpmm-create-pool-adapter';

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export type RaydiumRouteConfigOverrides = {
  configId?: string | null;
  baseDecimals?: number | null;
  quoteDecimals?: number | null;
  baseAmountRaw?: string | number | bigint | null;
  quoteAmountRaw?: string | number | bigint | null;
  recentBlockhash?: string | null;
};

export type RaydiumRouteConfigContract = {
  contract: 'bondr-raydium-route-config-v1';
  status: 'ready' | 'blocked';
  execution: 'raydium-route-config-only-no-provider-call-no-signing-no-broadcast';
  route: {
    selected: boolean;
    launchPath: 'raydium' | 'not-raydium';
    independentOfPumpFun: true;
    disallowedDependencies: string[];
  };
  projectId: string | null;
  deployer: string | null;
  baseMint: string | null;
  quoteMint: string;
  config: {
    configId: string | null;
    source: 'explicit-route-config' | 'override' | 'missing';
    validationStatus: 'valid-public-key' | 'missing' | 'invalid';
  };
  decimals: {
    baseDecimals: number | null;
    quoteDecimals: number | null;
  };
  liquidityAmounts: {
    baseAmountRaw: string | null;
    quoteAmountRaw: string | null;
    quoteLiquiditySol: number | null;
    withheldTokenPct: number | null;
    withheldTokenAmount: number | null;
  };
  tokenAccountPrep: {
    userBaseAta: string | null;
    userQuoteAta: string | null;
    userLpAta: string | null;
    requiredBeforeUnsignedLpBuild: string[];
    unsignedPrerequisiteTransaction: {
      required: boolean;
      endpoint: '/api/deployment/raydium/prepare-accounts';
      status: 'future-contract';
      noSigning: true;
      noBroadcast: true;
    };
  };
  poolDerivation: {
    poolId: string | null;
    lpMint: string | null;
    vaultA: string | null;
    vaultB: string | null;
    observationId: string | null;
  };
  unsignedBuildInput: {
    endpoint: '/api/deployment/raydium/build-lp';
    body: {
      creator: string | null;
      baseMint: string | null;
      quoteMint: string;
      baseDecimals: number | null;
      quoteDecimals: number | null;
      baseAmountRaw: string | null;
      quoteAmountRaw: string | null;
      configId: string | null;
      recentBlockhash: string | null;
      includeUnsignedTransaction: boolean;
    };
  };
  blockers: string[];
  warnings: string[];
  safety: {
    noPumpFunDependency: true;
    noProviderCall: true;
    noSigning: true;
    noBroadcast: true;
    noServerCustody: true;
  };
};

function validPublicKey(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

function rawAmount(value: unknown) {
  if (typeof value === 'bigint') return value > 0n ? value.toString() : null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value).toString();
  if (typeof value === 'string' && /^\d+$/.test(value.trim()) && BigInt(value.trim()) > 0n) return value.trim();
  return null;
}

function decimals(value: unknown, fallback: number | null) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 12 ? Number(value) : fallback;
}

function phaseFor(entry: WalletPlanEntry) {
  return entry.executionPhase ?? (entry.role.toLowerCase().includes('dev') ? 'dev' : 'observe');
}

function deployerWallet(project: Project | null, wallets: Wallet[]) {
  const plan = walletPlanEntries(project).find((entry) => phaseFor(entry) === 'dev') ?? walletPlanEntries(project).find((entry) => entry.participate) ?? null;
  return wallets.find((wallet) => wallet.id === plan?.walletId) ?? wallets[0] ?? null;
}

function ata(owner: string | null, mint: string | null) {
  if (!owner || !mint) return null;
  try {
    const ownerKey = new PublicKey(owner);
    const mintKey = new PublicKey(mint);
    return PublicKey.findProgramAddressSync([ownerKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintKey.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0].toBase58();
  } catch {
    return null;
  }
}

function quoteRawFromSol(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value * 1_000_000_000).toString()
    : null;
}

export function buildRaydiumRouteConfig(project: Project | null, wallets: Wallet[], overrides: RaydiumRouteConfigOverrides = {}): RaydiumRouteConfigContract {
  const route = project?.launchConfig?.route ?? null;
  const selected = project?.launchPath === 'raydium' || route?.platform === 'raydium';
  const deployer = deployerWallet(project, wallets);
  const deployerAddress = validPublicKey(deployer?.address ?? null);
  const baseMint = validPublicKey(project?.tokenMint ?? project?.launchReceipt?.tokenMint ?? null);
  const quoteMint = route?.quoteToken === 'USDC' ? 'USDC-resolver-required' : WSOL_MINT;
  const routeConfigId = validPublicKey(route?.raydiumCpmmConfigId ?? null);
  const overrideConfigId = validPublicKey(overrides.configId ?? null);
  const rawConfigValue = overrides.configId ?? route?.raydiumCpmmConfigId ?? null;
  const configId = overrideConfigId ?? routeConfigId;
  const baseDecimals = decimals(overrides.baseDecimals, decimals(route?.raydiumBaseDecimals, 6));
  const quoteDecimals = decimals(overrides.quoteDecimals, decimals(route?.raydiumQuoteDecimals, quoteMint === WSOL_MINT ? 9 : null));
  const baseAmountRaw = rawAmount(overrides.baseAmountRaw) ?? rawAmount(route?.raydiumBaseAmountRaw) ?? rawAmount(route?.raydiumWithheldTokenAmount);
  const quoteAmountRaw = rawAmount(overrides.quoteAmountRaw) ?? rawAmount(route?.raydiumQuoteAmountRaw) ?? quoteRawFromSol(route?.raydiumLiquiditySol);
  const preview = buildRaydiumCpmmCreatePoolTransaction({
    creator: deployerAddress,
    baseMint,
    quoteMint,
    baseDecimals,
    quoteDecimals,
    baseAmountRaw,
    quoteAmountRaw,
    configId,
    recentBlockhash: overrides.recentBlockhash ?? null,
    includeUnsignedTransaction: false
  });
  const userBaseAta = preview.derived.userBaseAta ?? ata(deployerAddress, baseMint);
  const userQuoteAta = preview.derived.userQuoteAta ?? ata(deployerAddress, quoteMint === WSOL_MINT ? WSOL_MINT : null);
  const userLpAta = preview.derived.userLpAta;
  const configValidationStatus = configId ? 'valid-public-key' : rawConfigValue ? 'invalid' : 'missing';
  const blockers = [
    selected ? null : 'raydium-route-not-selected',
    project ? null : 'project-required',
    deployerAddress ? null : 'deployer-wallet-required',
    baseMint ? null : 'base-token-mint-required',
    quoteMint === WSOL_MINT ? null : 'quote-token-resolver-required',
    configId ? null : 'raydium-cpmm-config-id-required',
    baseDecimals !== null ? null : 'base-decimals-required',
    quoteDecimals !== null ? null : 'quote-decimals-required',
    baseAmountRaw ? null : 'base-amount-raw-required',
    quoteAmountRaw ? null : 'quote-amount-raw-required',
    route?.burnLiquidity ? null : 'lp-burn-policy-required',
    userBaseAta ? null : 'user-base-token-account-derivation-required',
    userQuoteAta ? null : 'user-quote-token-account-derivation-required'
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-raydium-route-config-v1',
    status: blockers.length ? 'blocked' : 'ready',
    execution: 'raydium-route-config-only-no-provider-call-no-signing-no-broadcast',
    route: {
      selected,
      launchPath: selected ? 'raydium' : 'not-raydium',
      independentOfPumpFun: true,
      disallowedDependencies: ['PumpPortal create', 'Pump.fun migration', 'PumpSwap graduation', 'Pump.fun bonding curve state']
    },
    projectId: project?.id ?? null,
    deployer: deployerAddress,
    baseMint,
    quoteMint,
    config: {
      configId,
      source: overrideConfigId ? 'override' : routeConfigId ? 'explicit-route-config' : 'missing',
      validationStatus: configValidationStatus
    },
    decimals: { baseDecimals, quoteDecimals },
    liquidityAmounts: {
      baseAmountRaw,
      quoteAmountRaw,
      quoteLiquiditySol: route?.raydiumLiquiditySol ?? null,
      withheldTokenPct: route?.raydiumWithheldTokenPct ?? null,
      withheldTokenAmount: route?.raydiumWithheldTokenAmount ?? null
    },
    tokenAccountPrep: {
      userBaseAta,
      userQuoteAta,
      userLpAta,
      requiredBeforeUnsignedLpBuild: ['fund deployer base token ATA', 'prepare WSOL/quote ATA or reviewed SOL wrap', 'derive LP ATA from Raydium pool keys'],
      unsignedPrerequisiteTransaction: {
        required: true,
        endpoint: '/api/deployment/raydium/prepare-accounts',
        status: 'future-contract',
        noSigning: true,
        noBroadcast: true
      }
    },
    poolDerivation: {
      poolId: preview.derived.poolId,
      lpMint: preview.derived.lpMint,
      vaultA: preview.derived.vaultA,
      vaultB: preview.derived.vaultB,
      observationId: preview.derived.observationId
    },
    unsignedBuildInput: {
      endpoint: '/api/deployment/raydium/build-lp',
      body: {
        creator: deployerAddress,
        baseMint,
        quoteMint,
        baseDecimals,
        quoteDecimals,
        baseAmountRaw,
        quoteAmountRaw,
        configId,
        recentBlockhash: overrides.recentBlockhash ?? null,
        includeUnsignedTransaction: false
      }
    },
    blockers: Array.from(new Set(blockers)),
    warnings: [
      'Raydium CPMM config id must come from verified Raydium config discovery or explicit operator-provided config.',
      baseAmountRaw ? null : 'Withheld token percent cannot become raw token liquidity until token supply/allocation is known.'
    ].filter((item): item is string => Boolean(item)),
    safety: {
      noPumpFunDependency: true,
      noProviderCall: true,
      noSigning: true,
      noBroadcast: true,
      noServerCustody: true
    }
  };
}
