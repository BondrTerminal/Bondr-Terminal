import { ensureServerEnvLoaded } from './server-env';

ensureServerEnvLoaded();

export const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

export type SolanaRpcConfig = {
  url: string;
  provider: 'helius-rpc-url' | 'helius-api-key' | 'quicknode' | 'triton' | 'custom-solana-rpc' | 'public-solana-rpc';
  configured: boolean;
  heliusApiKey: string | null;
  enhancedTransactions: boolean;
  warning?: string;
};

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

export function getHeliusApiKey(): string | null {
  return cleanEnv('HELIUS_API_KEY') || parseHeliusApiKeyFromUrl(cleanEnv('HELIUS_RPC_URL'));
}

export function configuredSolanaRpc(): SolanaRpcConfig {
  const heliusRpcUrl = validHttpUrl(cleanEnv('HELIUS_RPC_URL'));
  const heliusApiKey = getHeliusApiKey();

  if (heliusApiKey) {
    const rpcUrlHasKey = Boolean(parseHeliusApiKeyFromUrl(heliusRpcUrl ?? undefined));
    return {
      url: rpcUrlHasKey ? heliusRpcUrl! : `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      provider: rpcUrlHasKey ? 'helius-rpc-url' : 'helius-api-key',
      configured: true,
      heliusApiKey,
      enhancedTransactions: true,
      warning: heliusRpcUrl && !rpcUrlHasKey ? 'HELIUS_RPC_URL was present without api-key; HELIUS_API_KEY-built URL is being used instead.' : undefined
    };
  }

  if (heliusRpcUrl && new URL(heliusRpcUrl).hostname.includes('helius-rpc.com')) {
    return {
      url: heliusRpcUrl,
      provider: 'helius-rpc-url',
      configured: true,
      heliusApiKey: null,
      enhancedTransactions: false,
      warning: 'HELIUS_RPC_URL is set without an api-key; RPC may fail and enhanced transactions are unavailable.'
    };
  }

  const quicknode = validHttpUrl(cleanEnv('QUICKNODE_RPC_URL'));
  if (quicknode) return { url: quicknode, provider: 'quicknode', configured: true, heliusApiKey: null, enhancedTransactions: false };

  const triton = validHttpUrl(cleanEnv('TRITON_RPC_URL'));
  if (triton) return { url: triton, provider: 'triton', configured: true, heliusApiKey: null, enhancedTransactions: false };

  const custom = validHttpUrl(cleanEnv('SOLANA_RPC_URL'));
  if (custom) return { url: custom, provider: 'custom-solana-rpc', configured: true, heliusApiKey: null, enhancedTransactions: false };

  return { url: DEFAULT_SOLANA_RPC_URL, provider: 'public-solana-rpc', configured: false, heliusApiKey: null, enhancedTransactions: false };
}
