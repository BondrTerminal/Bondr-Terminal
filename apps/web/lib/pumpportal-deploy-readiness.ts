import type { LiveActivationStatus } from './live-activation';
import type { Project, Wallet, WalletPlanEntry } from './meridian-store';
import { pinataJwt } from './ipfs-metadata-readiness';
import { createHash } from 'node:crypto';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';

export type PumpPortalCreatePreview = {
  contract: 'bondr-pumpportal-create-preview-v1';
  status: 'ready-to-build-preview' | 'blocked';
  execution: 'preview-only-no-provider-call-no-signing-no-broadcast';
  provider: {
    name: 'PumpPortal';
    endpoint: 'POST https://pumpportal.fun/api/trade-local';
    action: 'create';
    docs: string[];
  };
  ipfs: {
    status: 'ready' | 'provider-configured-upload-needed' | 'provider-required' | 'metadata-uri-missing' | 'image-required';
    requiredEnv: string[];
    optionalEnv: string[];
    providerConfigured: boolean;
    imageUrl: string | null;
    imageSource: 'ipfs' | 'http' | 'local-asset-route' | 'data-url' | 'missing' | 'unknown';
    imageValidation: {
      present: boolean;
      acceptableSource: boolean;
      note: string;
    };
    metadataUri: string | null;
    metadataUriSource: 'stored-project-metadata-uri' | 'ipfs-image-placeholder' | 'missing';
  };
  requiredInputs: string[];
  presentInputs: Record<string, boolean>;
  blockers: string[];
  warnings: string[];
  payloadPreview: {
    publicKey: string | null;
    action: 'create';
    tokenMetadata: {
      name: string;
      symbol: string;
      uri: string | null;
    };
    mint: string | null;
    denominatedInSol: 'true';
    amount: number;
    slippage: number;
    priorityFee: number;
    pool: string;
  };
  metadataJsonPreview: {
    name: string;
    symbol: string;
    description: string;
    image: string | null;
    external_url?: string;
    extensions: {
      website?: string;
      twitter?: string;
      telegram?: string;
    };
  };
  signerPreview: {
    devWalletId: string | null;
    devWalletAddress: string | null;
    custodyMode: Wallet['custodyMode'] | 'missing';
    clientMintPublicKeyRequired: true;
    serverCustody: false;
  };
  safety: {
    deploymentEnabled: boolean;
    broadcastEnabled: boolean;
    signingEnabled: boolean;
    explicitApprovalRequired: true;
    noProviderCall: true;
  };
};

export type PumpPortalBuildCreateInput = {
  mintPublicKey?: string | null;
  connectedSigner?: string | null;
  confirmBuild?: boolean;
};

export type PumpPortalBuildCreateResult = {
  contract: 'bondr-pumpportal-build-create-v1';
  status: 'blocked' | 'provider-build-disabled' | 'built';
  observedAt: string;
  provider: PumpPortalCreatePreview['provider'];
  preview: PumpPortalCreatePreview;
  requestBody: PumpPortalCreatePreview['payloadPreview'];
  blockers: string[];
  warnings: string[];
  requiredEnv: ['PUMPPORTAL_BUILD_ENABLED'];
  optionalEnv: ['PUMPPORTAL_TRADE_LOCAL_URL'];
  safety: {
    noSigning: true;
    noBroadcast: true;
    noPrivateKeys: true;
    providerCallEnabled: boolean;
    confirmBuild: boolean;
    deploymentGateIgnoredForBuildOnly: true;
  };
  build?: {
    transactionBase64: string;
    transactionBytes: number;
    transactionHash: string;
    requiredSigners: string[];
    mint: string;
    feePayer: string | null;
  };
  execution: 'blocked-no-provider-call' | 'provider-build-disabled-no-call' | 'unsigned-create-transaction-built-no-signing-no-broadcast';
};

function isPresent(value?: string | null) {
  return Boolean(value?.trim());
}

function imageSource(imageUrl?: string | null): PumpPortalCreatePreview['ipfs']['imageSource'] {
  if (!imageUrl) return 'missing';
  if (/^ipfs:\/\//i.test(imageUrl) || /\/ipfs\//i.test(imageUrl)) return 'ipfs';
  if (/^https?:\/\//i.test(imageUrl)) return 'http';
  if (/^data:/i.test(imageUrl)) return 'data-url';
  if (/^\/api\/projects\/[^/]+\/asset-image/i.test(imageUrl)) return 'local-asset-route';
  return 'unknown';
}

function isIpfsUri(value?: string | null) {
  return Boolean(value && (/^ipfs:\/\//i.test(value) || /\/ipfs\//i.test(value)));
}

function planByPhase(project: Project, phase: NonNullable<WalletPlanEntry['executionPhase']>) {
  return project.launchConfig?.walletPlan.find((entry) => entry.executionPhase === phase || entry.role.toLowerCase().includes(phase));
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function providerBuildEnabled() {
  return process.env.PUMPPORTAL_BUILD_ENABLED === 'true';
}

function tradeLocalUrl() {
  return process.env.PUMPPORTAL_TRADE_LOCAL_URL?.trim() || 'https://pumpportal.fun/api/trade-local';
}

function validPublicKey(value?: string | null) {
  if (!value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function buildStructuralBlockers(preview: PumpPortalCreatePreview) {
  return preview.blockers.filter((blocker) => !['deployment-gate-closed', 'broadcast-gate-closed'].includes(blocker));
}

function normalizeSerializedTransaction(payload: ArrayBuffer) {
  const bytes = Buffer.from(payload);
  const transaction = VersionedTransaction.deserialize(bytes);
  const transactionBase64 = bytes.toString('base64');
  return {
    transactionBase64,
    transactionBytes: bytes.length,
    transactionHash: createHash('sha256').update(bytes).digest('hex'),
    requiredSigners: transaction.message.staticAccountKeys
      .slice(0, transaction.message.header.numRequiredSignatures)
      .map((key) => key.toBase58()),
    feePayer: transaction.message.staticAccountKeys[0]?.toBase58() ?? null
  };
}

export function buildPumpPortalCreatePreview(project: Project, wallets: Wallet[], activation: LiveActivationStatus, input: { mintPublicKey?: string | null } = {}): PumpPortalCreatePreview {
  const devPlan = planByPhase(project, 'dev') ?? project.launchConfig?.walletPlan.find((entry) => entry.participate) ?? null;
  const devWallet = wallets.find((wallet) => wallet.id === devPlan?.walletId) ?? wallets[0] ?? null;
  const imageUrl = project.metadata.imageUrl?.trim() || null;
  const storedMetadataUri = project.metadata.metadataUri?.trim() || null;
  const image = imageSource(imageUrl);
  const imageAlreadyIpfs = isIpfsUri(imageUrl);
  const metadataUri = isIpfsUri(storedMetadataUri) ? storedMetadataUri : imageAlreadyIpfs ? imageUrl : null;
  const providerConfigured = Boolean(pinataJwt());
  const tokenName = project.metadata.name || project.name;
  const tokenSymbol = project.metadata.symbol || project.ticker;
  const description = project.metadata.description;
  const route = project.launchConfig?.route;
  const rules = project.launchConfig?.devWalletRules;
  const amount = numberValue(devPlan?.plannedBuySol, project.fundingPlan.devBuySol);
  const slippage = Math.max(0, (route?.slippageBps ?? rules?.maxSlippageBps ?? 100) / 100);
  const priorityFee = numberValue(rules?.maxPriorityFeeSol, 0);
  const pool = route?.platform === 'bonk' ? 'bonk' : 'pump';

  const presentInputs = {
    name: isPresent(tokenName),
    symbol: isPresent(tokenSymbol),
    description: isPresent(description),
    image: Boolean(imageUrl),
    ipfsMetadataUri: Boolean(metadataUri),
    devWalletPublicKey: Boolean(devWallet?.address),
    mintPublicKey: Boolean(input.mintPublicKey?.trim()),
    initialBuySol: amount > 0,
    slippage: slippage > 0,
    priorityFeeCap: priorityFee >= 0,
    pool: Boolean(pool)
  };
  const blockers = [
    presentInputs.name ? null : 'token-name-missing',
    presentInputs.symbol ? null : 'token-symbol-missing',
    presentInputs.description ? null : 'token-description-missing',
    presentInputs.image ? null : 'token-image-missing',
    presentInputs.ipfsMetadataUri ? null : providerConfigured ? 'ipfs-upload-needed' : 'ipfs-provider-required',
    presentInputs.devWalletPublicKey ? null : 'dev-wallet-missing',
    presentInputs.mintPublicKey ? null : 'client-mint-public-key-required',
    presentInputs.initialBuySol ? null : 'initial-buy-sol-missing',
    activation.deploymentEnabled ? null : 'deployment-gate-closed',
    activation.broadcastEnabled ? null : 'broadcast-gate-closed'
  ].filter((item): item is string => Boolean(item));
  const warnings = [
    image === 'local-asset-route' ? 'local asset route is fine for preview, but PumpPortal create needs pinned IPFS metadata before launch' : null,
    image === 'data-url' ? 'data URL must be uploaded to IPFS before PumpPortal create' : null,
    image === 'http' ? 'HTTP image must be pinned into metadata JSON before PumpPortal create' : null,
    priorityFee === 0 ? 'priority fee cap is zero; live create would likely need a nonzero capped priority fee' : null
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-pumpportal-create-preview-v1',
    status: blockers.filter((blocker) => !['deployment-gate-closed', 'broadcast-gate-closed'].includes(blocker)).length ? 'blocked' : 'ready-to-build-preview',
    execution: 'preview-only-no-provider-call-no-signing-no-broadcast',
    provider: {
      name: 'PumpPortal',
      endpoint: 'POST https://pumpportal.fun/api/trade-local',
      action: 'create',
      docs: ['https://pumpportal.fun/creation/', 'https://pumpportal.fun/local-trading-api/trading-api/']
    },
    ipfs: {
      status: imageAlreadyIpfs ? 'ready' : imageUrl ? providerConfigured ? 'provider-configured-upload-needed' : 'provider-required' : 'image-required',
      requiredEnv: ['PINATA_JWT', 'BONDR_PINATA_API'],
      optionalEnv: ['IPFS_GATEWAY_URL'],
      providerConfigured,
      imageUrl,
      imageSource: image,
      imageValidation: {
        present: Boolean(imageUrl),
        acceptableSource: image !== 'missing' && image !== 'unknown',
        note: imageAlreadyIpfs ? 'Image/metadata field is IPFS-shaped.' : 'Preview only; final create requires image plus metadata JSON pinned to IPFS.'
      },
      metadataUri,
      metadataUriSource: storedMetadataUri ? 'stored-project-metadata-uri' : metadataUri ? 'ipfs-image-placeholder' : 'missing'
    },
    requiredInputs: [
      'token name',
      'token symbol',
      'token description',
      'token image',
      'IPFS metadata URI',
      'dev wallet public key',
      'client-created mint public key',
      'initial buy SOL',
      'slippage percent',
      'priority fee SOL',
      'pool'
    ],
    presentInputs,
    blockers,
    warnings,
    payloadPreview: {
      publicKey: devWallet?.address ?? null,
      action: 'create',
      tokenMetadata: {
        name: tokenName,
        symbol: tokenSymbol,
        uri: metadataUri
      },
      mint: input.mintPublicKey?.trim() || null,
      denominatedInSol: 'true',
      amount,
      slippage,
      priorityFee,
      pool
    },
    metadataJsonPreview: {
      name: tokenName,
      symbol: tokenSymbol,
      description,
      image: imageUrl,
      external_url: project.metadata.website || undefined,
      extensions: {
        website: project.metadata.website || undefined,
        twitter: project.metadata.twitter || undefined,
        telegram: project.metadata.telegram || undefined
      }
    },
    signerPreview: {
      devWalletId: devWallet?.id ?? null,
      devWalletAddress: devWallet?.address ?? null,
      custodyMode: devWallet?.custodyMode ?? 'missing',
      clientMintPublicKeyRequired: true,
      serverCustody: false
    },
    safety: {
      deploymentEnabled: activation.deploymentEnabled,
      broadcastEnabled: activation.broadcastEnabled,
      signingEnabled: activation.signingEnabled,
      explicitApprovalRequired: true,
      noProviderCall: true
    }
  };
}

export async function buildPumpPortalCreateTransaction(project: Project, wallets: Wallet[], activation: LiveActivationStatus, input: PumpPortalBuildCreateInput = {}): Promise<PumpPortalBuildCreateResult> {
  const observedAt = new Date().toISOString();
  const preview = buildPumpPortalCreatePreview(project, wallets, activation, { mintPublicKey: input.mintPublicKey });
  const structuralBlockers = buildStructuralBlockers(preview);
  const mint = preview.payloadPreview.mint;
  const connectedSigner = input.connectedSigner?.trim() || null;
  const requestBody = preview.payloadPreview;
  const blockers = [
    ...structuralBlockers,
    mint && validPublicKey(mint) ? null : 'client-mint-public-key-invalid',
    requestBody.publicKey && validPublicKey(requestBody.publicKey) ? null : 'dev-wallet-public-key-invalid',
    connectedSigner ? null : 'browser-signer-proof-required',
    connectedSigner && requestBody.publicKey && connectedSigner !== requestBody.publicKey ? 'browser-signer-dev-wallet-mismatch' : null
  ].filter((item): item is string => Boolean(item));
  const enabled = providerBuildEnabled();
  const confirmBuild = input.confirmBuild === true;
  const base = {
    contract: 'bondr-pumpportal-build-create-v1' as const,
    observedAt,
    provider: preview.provider,
    preview,
    requestBody,
    blockers,
    warnings: preview.warnings,
    requiredEnv: ['PUMPPORTAL_BUILD_ENABLED'] as ['PUMPPORTAL_BUILD_ENABLED'],
    optionalEnv: ['PUMPPORTAL_TRADE_LOCAL_URL'] as ['PUMPPORTAL_TRADE_LOCAL_URL'],
    safety: {
      noSigning: true as const,
      noBroadcast: true as const,
      noPrivateKeys: true as const,
      providerCallEnabled: enabled,
      confirmBuild,
      deploymentGateIgnoredForBuildOnly: true as const
    }
  };

  if (blockers.length) {
    return { ...base, status: 'blocked', execution: 'blocked-no-provider-call' };
  }
  if (!enabled || !confirmBuild) {
    return { ...base, status: 'provider-build-disabled', blockers: enabled ? ['explicit-confirm-build-required'] : ['pumpportal-build-disabled'], execution: 'provider-build-disabled-no-call' };
  }

  const response = await fetch(tradeLocalUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
    cache: 'no-store'
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { ...base, status: 'blocked', blockers: [`pumpportal-build-failed-${response.status}`], warnings: [...preview.warnings, text.slice(0, 240)], execution: 'blocked-no-provider-call' };
  }
  if (contentType.includes('application/json')) {
    const json = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    return { ...base, status: 'blocked', blockers: ['pumpportal-returned-json-not-transaction'], warnings: [...preview.warnings, json?.error ?? json?.message ?? 'PumpPortal returned JSON instead of serialized transaction bytes.'], execution: 'blocked-no-provider-call' };
  }

  const build = normalizeSerializedTransaction(await response.arrayBuffer());
  return {
    ...base,
    status: 'built',
    build: {
      ...build,
      requiredSigners: Array.from(new Set([...build.requiredSigners, requestBody.publicKey, mint].filter((item): item is string => Boolean(item)))),
      mint: mint!
    },
    execution: 'unsigned-create-transaction-built-no-signing-no-broadcast'
  };
}
