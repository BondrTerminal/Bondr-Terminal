import { ensureServerEnvLoaded } from './server-env';

ensureServerEnvLoaded();

export const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

export type SolanaRpcProvider =
  | 'custom-solana-rpc'
  | 'quicknode'
  | 'triton'
  | 'syndica'
  | 'alchemy'
  | 'chainstack'
  | 'ankr'
  | 'jito'
  | 'helius-rpc-url'
  | 'helius-api-key'
  | 'public-solana-rpc';

export type SolanaRpcConfig = {
  url: string;
  provider: SolanaRpcProvider;
  configured: boolean;
  heliusApiKey: string | null;
  enhancedTransactions: boolean;
  warning?: string;
};

type DedicatedRpcProvider = Exclude<SolanaRpcProvider, 'helius-rpc-url' | 'helius-api-key' | 'public-solana-rpc'>;

type StandardRpcEnv = {
  env: string;
  provider: DedicatedRpcProvider;
};

const STANDARD_RPC_ENVS: StandardRpcEnv[] = [
  { env: 'QUICKNODE_RPC_URL', provider: 'quicknode' },
  { env: 'TRITON_RPC_URL', provider: 'triton' },
  { env: 'SYNDICA_RPC_URL', provider: 'syndica' },
  { env: 'ALCHEMY_RPC_URL', provider: 'alchemy' },
  { env: 'CHAINSTACK_RPC_URL', provider: 'chainstack' },
  { env: 'ANKR_RPC_URL', provider: 'ankr' },
  { env: 'JITO_RPC_URL', provider: 'jito' }
];

function cleanEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function validHttpUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseHeliusApiKeyFromUrl(rawUrl: string | undefined): string | null {
  const valid = validHttpUrl(rawUrl);
  if (!valid) return null;
  try {
    const url = new URL(valid);
    if (!url.hostname.includes('helius-rpc.com')) return null;
    return url.searchParams.get('api-key') || null;
  } catch {
    return null;
  }
}

function isHeliusUrl(rawUrl: string | null) {
  if (!rawUrl) return false;
  try { return new URL(rawUrl).hostname.includes('helius-rpc.com'); } catch { return false; }
}

function rpcConfig(url: string, provider: DedicatedRpcProvider): SolanaRpcConfig {
  return { url, provider, configured: true, heliusApiKey: null, enhancedTransactions: false };
}

export function getHeliusApiKey(): string | null {
  return cleanEnv('HELIUS_API_KEY') || parseHeliusApiKeyFromUrl(cleanEnv('HELIUS_RPC_URL')) || parseHeliusApiKeyFromUrl(cleanEnv('SOLANA_RPC_URL'));
}

export function configuredDedicatedSolanaRpcs(): SolanaRpcConfig[] {
  const configs: SolanaRpcConfig[] = [];
  const heliusRpcUrl = validHttpUrl(cleanEnv('HELIUS_RPC_URL'));
  const solanaRpcUrl = validHttpUrl(cleanEnv('SOLANA_RPC_URL'));
  const heliusApiKey = getHeliusApiKey();

  // SOLANA_RPC_URL is the explicit primary backend RPC override. If it is not a
  // Helius URL, prefer it ahead of vendor-specific fallbacks for simulation/read
  // reliability while Helius can remain configured for enhanced data.
  if (solanaRpcUrl && !isHeliusUrl(solanaRpcUrl)) configs.push(rpcConfig(solanaRpcUrl, 'custom-solana-rpc'));

  for (const provider of STANDARD_RPC_ENVS) {
    const url = validHttpUrl(cleanEnv(provider.env));
    if (url) configs.push(rpcConfig(url, provider.provider));
  }

  if (heliusApiKey) {
    const heliusUrlWithKey = isHeliusUrl(heliusRpcUrl) && Boolean(parseHeliusApiKeyFromUrl(heliusRpcUrl ?? undefined))
      ? heliusRpcUrl!
      : isHeliusUrl(solanaRpcUrl) && Boolean(parseHeliusApiKeyFromUrl(solanaRpcUrl ?? undefined))
        ? solanaRpcUrl!
        : `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    configs.push({
      url: heliusUrlWithKey,
      provider: heliusUrlWithKey === heliusRpcUrl || heliusUrlWithKey === solanaRpcUrl ? 'helius-rpc-url' : 'helius-api-key',
      configured: true,
      heliusApiKey,
      enhancedTransactions: true,
      warning: heliusRpcUrl && !parseHeliusApiKeyFromUrl(heliusRpcUrl ?? undefined) ? 'HELIUS_RPC_URL was present without api-key; HELIUS_API_KEY-built URL is being used instead.' : undefined
    });
  } else if (isHeliusUrl(heliusRpcUrl) || isHeliusUrl(solanaRpcUrl)) {
    configs.push({
      url: (isHeliusUrl(heliusRpcUrl) ? heliusRpcUrl : solanaRpcUrl)!,
      provider: 'helius-rpc-url',
      configured: true,
      heliusApiKey: null,
      enhancedTransactions: false,
      warning: 'Helius RPC URL is set without an api-key; RPC may fail and enhanced transactions are unavailable.'
    });
  }

  const seen = new Set<string>();
  return configs.filter((config) => {
    if (seen.has(config.url)) return false;
    seen.add(config.url);
    return true;
  });
}

export function configuredSolanaRpc(): SolanaRpcConfig {
  return configuredDedicatedSolanaRpcs()[0] ?? { url: DEFAULT_SOLANA_RPC_URL, provider: 'public-solana-rpc', configured: false, heliusApiKey: null, enhancedTransactions: false };
}
