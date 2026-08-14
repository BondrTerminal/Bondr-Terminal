export type JitoRelayReadiness = {
  contract: 'bondr-jito-relay-readiness-v1';
  status: 'disabled' | 'misconfigured' | 'configured-preview' | 'relay-ready';
  relayEnabled: boolean;
  provider: 'jito-block-engine';
  blockEngineUrl: string;
  blockEngineRegion: string;
  authConfigured: boolean;
  tip: {
    minLamports: number;
    maxLamports: number;
    minSol: number;
    maxSol: number;
    tipAccountsEndpoint: string;
  };
  limits: {
    maxTransactionsPerBundle: number;
    maxWalletsPerBundle: number;
    maxTotalSol: number;
  };
  methods: {
    sendBundle: string;
    getBundleStatuses: string;
    getInflightBundleStatuses: string;
    getTipAccounts: string;
    sendTransaction: string;
  };
  requiredEnv: string[];
  optionalEnv: string[];
  blockers: string[];
  warnings: string[];
  execution: 'relay-status-only-no-bundle-submit' | 'relay-configured-preview-only' | 'relay-ready-gated-submit';
};

function boolEnv(name: string) {
  return process.env[name] === 'true';
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getJitoRelayReadiness(): JitoRelayReadiness {
  const relayEnabled = boolEnv('JITO_RELAY_ENABLED');
  const blockEngineUrl = process.env.JITO_BLOCK_ENGINE_URL?.trim() || 'https://mainnet.block-engine.jito.wtf';
  const blockEngineRegion = process.env.JITO_BLOCK_ENGINE_REGION?.trim() || 'mainnet-default';
  const authConfigured = Boolean(process.env.JITO_AUTH_TOKEN?.trim() || process.env.JITO_AUTH_KEYPAIR_OR_TOKEN?.trim() || process.env.JITO_AUTH_UUID?.trim());
  const minLamports = numberEnv('JITO_TIP_LAMPORTS_MIN', 1_000);
  const maxLamports = numberEnv('JITO_TIP_LAMPORTS_MAX', 100_000);
  const maxTransactionsPerBundle = Math.min(numberEnv('JITO_MAX_TRANSACTIONS_PER_BUNDLE', 5), 5);
  const maxWalletsPerBundle = Math.min(numberEnv('BUNDLE_MAX_WALLETS', 5), maxTransactionsPerBundle);
  const maxTotalSol = numberEnv('BUNDLE_MAX_TOTAL_SOL', 0.25);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!relayEnabled) blockers.push('JITO_RELAY_ENABLED is false.');
  if (!blockEngineUrl) blockers.push('JITO_BLOCK_ENGINE_URL is missing.');
  if (maxLamports <= 0) blockers.push('JITO_TIP_LAMPORTS_MAX must be greater than zero.');
  if (maxLamports < minLamports) blockers.push('JITO_TIP_LAMPORTS_MAX is below JITO_TIP_LAMPORTS_MIN.');
  if (!authConfigured) warnings.push('No Jito auth token/keypair configured; public JSON-RPC may work, authenticated searcher mode remains unavailable.');

  const status: JitoRelayReadiness['status'] = blockers.length
    ? relayEnabled ? 'misconfigured' : 'disabled'
    : relayEnabled ? 'relay-ready' : 'configured-preview';

  return {
    contract: 'bondr-jito-relay-readiness-v1',
    status,
    relayEnabled,
    provider: 'jito-block-engine',
    blockEngineUrl,
    blockEngineRegion,
    authConfigured,
    tip: {
      minLamports,
      maxLamports,
      minSol: minLamports / 1_000_000_000,
      maxSol: maxLamports / 1_000_000_000,
      tipAccountsEndpoint: `${blockEngineUrl.replace(/\/$/, '')}/api/v1/getTipAccounts`
    },
    limits: {
      maxTransactionsPerBundle,
      maxWalletsPerBundle,
      maxTotalSol
    },
    methods: {
      sendBundle: 'sendBundle',
      getBundleStatuses: 'getBundleStatuses',
      getInflightBundleStatuses: 'getInflightBundleStatuses',
      getTipAccounts: 'getTipAccounts',
      sendTransaction: 'sendTransaction'
    },
    requiredEnv: ['JITO_RELAY_ENABLED', 'JITO_BLOCK_ENGINE_URL', 'JITO_TIP_LAMPORTS_MIN', 'JITO_TIP_LAMPORTS_MAX'],
    optionalEnv: ['JITO_BLOCK_ENGINE_REGION', 'JITO_AUTH_TOKEN', 'JITO_AUTH_KEYPAIR_OR_TOKEN', 'JITO_AUTH_UUID', 'JITO_MAX_TRANSACTIONS_PER_BUNDLE'],
    blockers,
    warnings,
    execution: blockers.length
      ? 'relay-status-only-no-bundle-submit'
      : relayEnabled
        ? 'relay-ready-gated-submit'
        : 'relay-configured-preview-only'
  };
}
