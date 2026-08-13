import { Connection } from '@solana/web3.js';
import { configuredDedicatedSolanaRpcs, configuredSolanaRpc, type SolanaRpcConfig, type SolanaRpcProvider } from './solana-rpc';
import { isProviderLimitedError } from './provider-truth';

export type RpcHealthStatus = 'live' | 'provider-limited' | 'modeled' | 'unavailable';

export type RpcProviderHealth = {
  observedAt: string;
  provider: SolanaRpcProvider;
  providerLabel: string;
  configured: boolean;
  enhancedTransactions: boolean;
  websocketConfigured: boolean;
  endpoint: string;
  warning: string | null;
  currentSlot: number | null;
  chain: 'mainnet-beta';
  latencyMs: number | null;
  status: RpcHealthStatus;
  note: string;
  quotaLimited: boolean;
};

export type SolanaRpcHealth = RpcProviderHealth & {
  selectedProvider: string;
  selectedProviderLabel: string;
  configuredProviderCount: number;
  providerSummary: string;
  providers: RpcProviderHealth[];
};

function timeoutMs() {
  const value = Number(process.env.SOLANA_RPC_HEALTH_TIMEOUT_MS ?? '2500');
  return Number.isFinite(value) && value > 0 ? value : 2500;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

export function rpcDisplayUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, 'redacted');
    if (rawUrl.includes('?') && [...url.searchParams.keys()].length === 0) url.searchParams.set('query', 'redacted');
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
    if (url.pathname && url.pathname !== '/') url.pathname = '/redacted';
    return url.toString();
  } catch {
    return 'invalid-url';
  }
}

function envWs(name: string) { return Boolean(process.env[name]?.trim()); }
export function solanaRpcWsConfigured(provider?: SolanaRpcProvider) {
  if (provider === 'helius-api-key' || provider === 'helius-rpc-url') return envWs('SOLANA_RPC_WS_URL') || envWs('HELIUS_RPC_WS_URL');
  if (provider === 'quicknode') return envWs('SOLANA_RPC_WS_URL') || envWs('QUICKNODE_RPC_WS_URL');
  if (provider === 'triton') return envWs('SOLANA_RPC_WS_URL') || envWs('TRITON_RPC_WS_URL');
  if (provider === 'syndica') return envWs('SOLANA_RPC_WS_URL') || envWs('SYNDICA_RPC_WS_URL');
  if (provider === 'alchemy') return envWs('SOLANA_RPC_WS_URL') || envWs('ALCHEMY_RPC_WS_URL');
  if (provider === 'chainstack') return envWs('SOLANA_RPC_WS_URL') || envWs('CHAINSTACK_RPC_WS_URL');
  if (provider === 'ankr') return envWs('SOLANA_RPC_WS_URL') || envWs('ANKR_RPC_WS_URL');
  if (provider === 'jito') return envWs('SOLANA_RPC_WS_URL') || envWs('JITO_RPC_WS_URL');
  return envWs('SOLANA_RPC_WS_URL') || envWs('HELIUS_RPC_WS_URL') || envWs('QUICKNODE_RPC_WS_URL') || envWs('TRITON_RPC_WS_URL') || envWs('SYNDICA_RPC_WS_URL') || envWs('ALCHEMY_RPC_WS_URL') || envWs('CHAINSTACK_RPC_WS_URL') || envWs('ANKR_RPC_WS_URL') || envWs('JITO_RPC_WS_URL');
}

export function solanaRpcProviderLabel(provider: string) {
  if (provider === 'quicknode') return process.env.QUICKNODE_RPC_PROVIDER_LABEL?.trim() || 'QuickNode';
  if (provider === 'triton') return process.env.TRITON_RPC_PROVIDER_LABEL?.trim() || 'Triton';
  if (provider === 'syndica') return process.env.SYNDICA_RPC_PROVIDER_LABEL?.trim() || 'Syndica';
  if (provider === 'alchemy') return process.env.ALCHEMY_RPC_PROVIDER_LABEL?.trim() || 'Alchemy';
  if (provider === 'chainstack') return process.env.CHAINSTACK_RPC_PROVIDER_LABEL?.trim() || 'Chainstack';
  if (provider === 'ankr') return process.env.ANKR_RPC_PROVIDER_LABEL?.trim() || 'Ankr';
  if (provider === 'jito') return process.env.JITO_RPC_PROVIDER_LABEL?.trim() || 'Jito';
  if (provider === 'helius-api-key' || provider === 'helius-rpc-url') return process.env.HELIUS_RPC_PROVIDER_LABEL?.trim() || process.env.SOLANA_RPC_PROVIDER_LABEL?.trim() || 'Helius';
  if (provider === 'custom-solana-rpc') return process.env.SOLANA_RPC_PROVIDER_LABEL?.trim() || 'Dedicated Solana RPC';
  return 'Public Solana RPC';
}

function quotaLimited(note: string) {
  return isProviderLimitedError(note);
}

async function checkProvider(rpc: SolanaRpcConfig, observedAt: string): Promise<RpcProviderHealth> {
  const started = Date.now();
  const base = {
    observedAt,
    provider: rpc.provider,
    providerLabel: solanaRpcProviderLabel(rpc.provider),
    configured: rpc.configured,
    enhancedTransactions: rpc.enhancedTransactions,
    websocketConfigured: solanaRpcWsConfigured(rpc.provider),
    endpoint: rpcDisplayUrl(rpc.url),
    warning: rpc.warning ?? null,
    currentSlot: null as number | null,
    chain: 'mainnet-beta' as const,
    latencyMs: null as number | null,
    status: 'modeled' as RpcHealthStatus,
    note: '',
    quotaLimited: false
  };

  try {
    const connection = new Connection(rpc.url, 'confirmed');
    const slot = await withTimeout(connection.getSlot('confirmed'), timeoutMs(), `${base.providerLabel} Solana RPC health check`);
    return { ...base, currentSlot: slot, latencyMs: Date.now() - started, status: 'live', note: `${base.providerLabel} dedicated RPC responded successfully.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RPC health check failed.';
    const isQuota = quotaLimited(message);
    return { ...base, latencyMs: Date.now() - started, status: isQuota ? 'provider-limited' : 'unavailable', note: isQuota ? `Provider-limited: ${base.providerLabel} RPC health check could not complete because the provider rejected, timed out, or quota-limited the request: ${message}` : `${base.providerLabel} dedicated RPC configured but unavailable for health check: ${message}`, quotaLimited: isQuota, warning: isQuota ? 'Provider-limited: quota/rate/timeout reached; this is provider state, not wallet or transaction truth.' : base.warning };
  }
}

function providerRank(provider: RpcProviderHealth) {
  if (provider.status === 'live') return 0;
  if (provider.status === 'provider-limited' || provider.quotaLimited) return 1;
  if (provider.status === 'unavailable') return 2;
  return 3;
}

export async function getSolanaRpcHealth(): Promise<SolanaRpcHealth> {
  const observedAt = new Date().toISOString();
  const providers = configuredDedicatedSolanaRpcs();
  if (!providers.length) {
    const rpc = configuredSolanaRpc();
    const base: RpcProviderHealth = {
      observedAt,
      provider: rpc.provider,
      providerLabel: solanaRpcProviderLabel(rpc.provider),
      configured: false,
      enhancedTransactions: false,
      websocketConfigured: solanaRpcWsConfigured(),
      endpoint: rpcDisplayUrl(rpc.url),
      warning: null,
      currentSlot: null,
      chain: 'mainnet-beta',
      latencyMs: null,
      status: 'modeled',
      note: 'Dedicated Solana RPC is not configured; Wallet Ops is using modeled/read-only fallback. Public RPC cannot satisfy live readiness.',
      quotaLimited: false
    };
    return { ...base, selectedProvider: base.provider, selectedProviderLabel: base.providerLabel, configuredProviderCount: 0, providerSummary: 'No dedicated RPC providers configured.', providers: [] };
  }

  const results = await Promise.all(providers.map((provider) => checkProvider(provider, observedAt)));
  const selected = [...results].sort((a, b) => providerRank(a) - providerRank(b) || (a.latencyMs ?? Number.MAX_SAFE_INTEGER) - (b.latencyMs ?? Number.MAX_SAFE_INTEGER))[0];
  const summary = results.map((provider) => `${provider.providerLabel}:${provider.status}${provider.quotaLimited ? ':quota' : ''}`).join(' · ');
  return { ...selected, selectedProvider: selected.provider, selectedProviderLabel: selected.providerLabel, configuredProviderCount: results.length, providerSummary: summary, providers: results };
}
