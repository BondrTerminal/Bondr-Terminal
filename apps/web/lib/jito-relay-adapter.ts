import type { LiveActivationStatus } from './live-activation';
import { getJitoRelayReadiness, type JitoRelayReadiness } from './jito-relay-readiness';

export type JitoBundlePayload = {
  signedTransactions?: unknown;
  expectedSigners?: unknown;
  expectedMint?: unknown;
  tipLamports?: unknown;
  simulationProof?: unknown;
  approvalId?: unknown;
};

export type NormalizedJitoRelayError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type JitoBundlePreview = {
  contract: 'bondr-jito-bundle-preview-v1';
  status: 'preview-ready' | 'blocked';
  execution: 'policy-preview-only-no-relay-submit';
  relay: JitoRelayReadiness;
  methods: {
    tipAccounts: {
      method: 'getTipAccounts';
      endpoint: string;
    };
    sendBundle: {
      method: 'sendBundle';
      endpoint: string;
      bodyShape: {
        jsonrpc: '2.0';
        id: string;
        method: 'sendBundle';
        params: ['base64[]'];
      };
    };
    getInflightBundleStatuses: 'getInflightBundleStatuses';
    getBundleStatuses: 'getBundleStatuses';
  };
  policy: {
    maxTransactions: number;
    signedTransactionCount: number;
    expectedSignerCount: number;
    expectedMint: string | null;
    tipLamports: number;
    maxTipLamports: number;
    simulationProofPresent: boolean;
    approvalPresent: boolean;
  };
  blockers: string[];
  warnings: string[];
  payloadShape: {
    signedTransactions: 'base64[]';
    expectedSigners: 'wallet public key[]';
    expectedMint: 'token mint';
    tipLamports: number;
    simulationProof: 'required-before-submit';
    approvalId: 'required-before-submit';
  };
  safety: {
    relayEnabled: boolean;
    broadcastEnabled: boolean;
    submitImplemented: false;
    noRelaySubmit: true;
  };
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function normalizeJitoRelayError(error: unknown): NormalizedJitoRelayError {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown Jito relay error.';
  const lower = message.toLowerCase();
  const retryable = /timeout|429|rate|temporar|unavailable|blockhash|leader/i.test(message) && !/signature|insufficient|slippage|simulation/i.test(message);
  const code = lower.includes('tip') ? 'jito-tip-error' : lower.includes('simulation') ? 'simulation-failed' : retryable ? 'transient-relay-error' : 'relay-policy-error';
  return { code, message, retryable };
}

export function buildJitoBundlePreview(payload: JitoBundlePayload = {}, activation: LiveActivationStatus, relay = getJitoRelayReadiness()): JitoBundlePreview {
  const signedTransactions = asStringArray(payload.signedTransactions);
  const expectedSigners = asStringArray(payload.expectedSigners);
  const expectedMint = asString(payload.expectedMint);
  const tipLamports = asNumber(payload.tipLamports, relay.tip.minLamports);
  const simulationProofPresent = Boolean(payload.simulationProof);
  const approvalPresent = Boolean(asString(payload.approvalId));

  const blockers = [
    signedTransactions.length ? null : 'signed-transactions-missing',
    signedTransactions.length > relay.limits.maxTransactionsPerBundle ? `bundle-exceeds-${relay.limits.maxTransactionsPerBundle}-transaction-limit` : null,
    expectedSigners.length ? null : 'expected-signers-missing',
    expectedMint ? null : 'expected-mint-missing',
    tipLamports > 0 ? null : 'jito-tip-missing',
    tipLamports > relay.tip.maxLamports ? 'jito-tip-exceeds-cap' : null,
    simulationProofPresent ? null : 'simulation-proof-missing',
    approvalPresent ? null : 'explicit-approval-missing',
    relay.relayEnabled ? null : 'jito-relay-disabled',
    activation.broadcastEnabled ? null : 'broadcast-gate-closed'
  ].filter((item): item is string => Boolean(item));
  const warnings = [
    relay.authConfigured ? null : 'No Jito auth configured; public JSON-RPC may work, authenticated searcher mode remains unavailable.',
    signedTransactions.length === relay.limits.maxTransactionsPerBundle ? 'Bundle is at Jito public limit; add no more legs.' : null
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-jito-bundle-preview-v1',
    status: blockers.filter((blocker) => !['jito-relay-disabled', 'broadcast-gate-closed', 'simulation-proof-missing', 'explicit-approval-missing'].includes(blocker)).length ? 'blocked' : 'preview-ready',
    execution: 'policy-preview-only-no-relay-submit',
    relay,
    methods: {
      tipAccounts: {
        method: 'getTipAccounts',
        endpoint: relay.tip.tipAccountsEndpoint
      },
      sendBundle: {
        method: 'sendBundle',
        endpoint: `${relay.blockEngineUrl.replace(/\/$/, '')}/api/v1/bundles`,
        bodyShape: {
          jsonrpc: '2.0',
          id: 'bondr-bundle-submit',
          method: 'sendBundle',
          params: ['base64[]']
        }
      },
      getInflightBundleStatuses: 'getInflightBundleStatuses',
      getBundleStatuses: 'getBundleStatuses'
    },
    policy: {
      maxTransactions: relay.limits.maxTransactionsPerBundle,
      signedTransactionCount: signedTransactions.length,
      expectedSignerCount: expectedSigners.length,
      expectedMint,
      tipLamports,
      maxTipLamports: relay.tip.maxLamports,
      simulationProofPresent,
      approvalPresent
    },
    blockers,
    warnings,
    payloadShape: {
      signedTransactions: 'base64[]',
      expectedSigners: 'wallet public key[]',
      expectedMint: 'token mint',
      tipLamports,
      simulationProof: 'required-before-submit',
      approvalId: 'required-before-submit'
    },
    safety: {
      relayEnabled: relay.relayEnabled,
      broadcastEnabled: activation.broadcastEnabled,
      submitImplemented: false,
      noRelaySubmit: true
    }
  };
}

export function buildJitoSendBundleBlockedResponse(payload: JitoBundlePayload, activation: LiveActivationStatus, relay = getJitoRelayReadiness()) {
  const preview = buildJitoBundlePreview(payload, activation, relay);
  const blockers = [...preview.blockers, 'live-jito-submit-not-implemented'];
  return {
    status: 'blocked',
    observedAt: new Date().toISOString(),
    preview,
    blockers: Array.from(new Set(blockers)),
    normalizedError: normalizeJitoRelayError('Jito sendBundle live submission is intentionally not implemented in this sprint.'),
    execution: 'blocked-no-jito-relay-submit',
    nextImplementation: ['deserialize and hash signed txs', 'verify signer/mint/tip policy', 'submit sendBundle to Jito JSON-RPC', 'store bundle id', 'poll inflight/final status']
  };
}
