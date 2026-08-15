import type { Project } from './meridian-store';

export type TokenMetadataJson = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  extensions?: {
    website?: string;
    twitter?: string;
    telegram?: string;
  };
};

export type IpfsMetadataReadiness = {
  contract: 'bondr-ipfs-metadata-readiness-v1';
  status: 'ready-to-pin' | 'blocked' | 'pinned';
  provider: 'pinata';
  providerConfigured: boolean;
  requiredEnv: string[];
  optionalEnv: ['IPFS_GATEWAY_URL'];
  blockers: string[];
  warnings: string[];
  image: {
    source: 'ipfs' | 'http' | 'local-asset-data' | 'local-asset-route' | 'data-url' | 'missing' | 'unknown';
    url: string | null;
    contentType: string | null;
    bytesKnown: boolean;
  };
  metadataUri: string | null;
  metadataJson: TokenMetadataJson;
  execution: 'readiness-only-no-ipfs-write' | 'pin-complete-no-launch';
};

type PinataResult = {
  IpfsHash?: string;
  PinSize?: number;
  Timestamp?: string;
};
type PinataErrorPayload = PinataResult & { error?: unknown; message?: unknown };

function configured() {
  return Boolean(pinataJwt());
}

function extractJwt(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  const exactJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed);
  if (exactJwt) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of ['JWT', 'jwt', 'pinata_jwt', 'PINATA_JWT', 'token']) {
      const candidate = typeof parsed[key] === 'string' ? parsed[key].trim() : '';
      if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate)) return candidate;
    }
  } catch {
    // Fall through to extracting a JWT from env-file style blobs.
  }
  return trimmed.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0] ?? trimmed;
}

export function pinataJwt() {
  return extractJwt(process.env.PINATA_JWT) || extractJwt(process.env.BONDR_PINATA_API) || '';
}

export function ipfsUri(cid: string) {
  return `ipfs://${cid}`;
}

function sourceFor(project: Project): IpfsMetadataReadiness['image']['source'] {
  const imageUrl = project.metadata.imageUrl;
  if (!imageUrl) return 'missing';
  if (/^ipfs:\/\//i.test(imageUrl) || /\/ipfs\//i.test(imageUrl)) return 'ipfs';
  if (/^https?:\/\//i.test(imageUrl)) return 'http';
  if (/^data:/i.test(imageUrl)) return 'data-url';
  if (project.metadata.imageDataUrl) return 'local-asset-data';
  if (/^\/api\/projects\/[^/]+\/asset-image/i.test(imageUrl)) return 'local-asset-route';
  return 'unknown';
}

export function buildTokenMetadataJson(project: Project, imageUri: string): TokenMetadataJson {
  const extensions = {
    website: project.metadata.website || undefined,
    twitter: project.metadata.twitter || undefined,
    telegram: project.metadata.telegram || undefined
  };
  return {
    name: project.metadata.name || project.name,
    symbol: project.metadata.symbol || project.ticker,
    description: project.metadata.description,
    image: imageUri,
    external_url: project.metadata.website || undefined,
    extensions: Object.values(extensions).some(Boolean) ? extensions : undefined
  };
}

export function buildIpfsMetadataReadiness(project: Project): IpfsMetadataReadiness {
  const providerConfigured = configured();
  const imageSource = sourceFor(project);
  const imageUri = project.metadata.metadataUri && project.metadata.imageUrl ? project.metadata.imageUrl : project.metadata.imageUrl;
  const metadataJson = buildTokenMetadataJson(project, imageUri || '');
  const metadataUri = project.metadata.metadataUri ?? null;
  const blockers = [
    project.metadata.name || project.name ? null : 'token-name-missing',
    project.metadata.symbol || project.ticker ? null : 'token-symbol-missing',
    project.metadata.description ? null : 'token-description-missing',
    project.metadata.imageUrl || project.metadata.imageDataUrl ? null : 'token-image-missing',
    imageSource === 'local-asset-route' && !project.metadata.imageDataUrl ? 'local-image-data-missing' : null,
    providerConfigured ? null : 'pinata-jwt-missing'
  ].filter((item): item is string => Boolean(item));
  const warnings = [
    imageSource === 'http' ? 'HTTP image will be embedded as-is unless separately pinned first.' : null,
    metadataUri ? 'Metadata URI already exists; pinning again will create a new immutable metadata CID.' : null
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-ipfs-metadata-readiness-v1',
    status: metadataUri ? 'pinned' : blockers.length ? 'blocked' : 'ready-to-pin',
    provider: 'pinata',
    providerConfigured,
    requiredEnv: ['PINATA_JWT', 'BONDR_PINATA_API'],
    optionalEnv: ['IPFS_GATEWAY_URL'],
    blockers,
    warnings,
    image: {
      source: imageSource,
      url: project.metadata.imageUrl || null,
      contentType: project.metadata.imageContentType ?? null,
      bytesKnown: Boolean(project.metadata.imageDataUrl)
    },
    metadataUri,
    metadataJson,
    execution: 'readiness-only-no-ipfs-write'
  };
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1],
    bytes: Buffer.from(match[2], 'base64')
  };
}

async function pinataFetch(path: string, init: RequestInit) {
  const jwt = pinataJwt();
  if (!jwt) throw new Error('PINATA_JWT or BONDR_PINATA_API is not configured.');
  const response = await fetch(`https://api.pinata.cloud${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${jwt}`,
      ...(init.headers ?? {})
    },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({})) as PinataErrorPayload;
  if (!response.ok || !payload.IpfsHash) {
    const detail = typeof payload.error === 'string'
      ? payload.error
      : typeof payload.message === 'string'
        ? payload.message
        : Object.keys(payload).length
          ? JSON.stringify(payload)
          : '';
    throw new Error(detail || `Pinata request failed with ${response.status}.`);
  }
  return payload as Required<Pick<PinataResult, 'IpfsHash'>> & PinataResult;
}

export async function pinProjectImageIfNeeded(project: Project) {
  const imageSource = sourceFor(project);
  if (imageSource === 'ipfs') return project.metadata.imageUrl;
  if (imageSource === 'http') return project.metadata.imageUrl;
  const decoded = project.metadata.imageDataUrl ? decodeDataUrl(project.metadata.imageDataUrl) : null;
  if (!decoded) throw new Error('Project image data is missing; upload or attach an image before pinning metadata.');
  const filename = `${project.id}-token-image.${decoded.contentType.split('/')[1] ?? 'png'}`;
  const form = new FormData();
  form.append('file', new Blob([decoded.bytes], { type: decoded.contentType }), filename);
  form.append('pinataMetadata', JSON.stringify({ name: filename, keyvalues: { projectId: project.id, asset: 'token-image' } }));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  const result = await pinataFetch('/pinning/pinFileToIPFS', { method: 'POST', body: form });
  return ipfsUri(result.IpfsHash);
}

export async function pinProjectMetadata(project: Project) {
  const imageUri = await pinProjectImageIfNeeded(project);
  const metadataJson = buildTokenMetadataJson(project, imageUri);
  const result = await pinataFetch('/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pinataContent: metadataJson,
      pinataMetadata: {
        name: `${project.metadata.symbol || project.ticker || project.id}-metadata.json`,
        keyvalues: { projectId: project.id, asset: 'token-metadata' }
      },
      pinataOptions: { cidVersion: 1 }
    })
  });
  return {
    imageUri,
    metadataUri: ipfsUri(result.IpfsHash),
    metadataJson,
    pinata: result
  };
}
