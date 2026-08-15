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
    submitImplemented: boolean;
    noRelaySubmit: boolean;
  };
};

export type JitoSendBundleResult = {
  status: 'blocked' | 'submitted' | 'relay-error';
  observedAt: string;
  preview: JitoBundlePreview;
  blockers: string[];
  relayRequest?: {
    endpoint: string;
    method: 'sendBundle';
    transactionCount: number;
  };
  relayResponse?: {
    bundleId: string | null;
    raw: unknown;
  };
  normalizedError?: NormalizedJitoRelayError;
  execution: 'blocked-no-jito-relay-submit' | 'jito-send-bundle-submitted';
};

export type BundleReceiptRecord = {
  contract: 'bondr-bundle-receipt-v1';
  bundleId: string;
  rail: 'deployment' | 'bundle' | 'sniper' | 'task';
  status: 'submitted' | 'inflight' | 'landed' | 'dropped' | 'failed' | 'finalized' | 'unknown';
  txSignatures: string[];
  observedAt: string;
  provider: 'jito-block-engine';
  projectId?: string | null;
  relayResponse?: unknown;
};

export type JitoBundleStatusResult = {
  status: 'blocked' | 'ok' | 'relay-error';
  observedAt: string;
  relay: JitoRelayReadiness;
  bundleIds: string[];
  receipts: BundleReceiptRecord[];
  raw?: {
    inflight?: unknown;
    final?: unknown;
  };
  blockers: string[];
  normalizedError?: NormalizedJitoRelayError;
  execution: 'bundle-status-read-only-no-submit';
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

function signedTransactionsFrom(payload: JitoBundlePayload) {
  return asStringArray(payload.signedTransactions);
}

function bundleIdsFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()).slice(0, 20)
    : typeof value === 'string' && value.trim()
      ? [value.trim()]
      : [];
}

function statusFromRaw(raw: unknown): BundleReceiptRecord['status'] {
  const text = JSON.stringify(raw ?? {}).toLowerCase();
  if (text.includes('landed')) return 'landed';
  if (text.includes('finalized')) return 'finalized';
  if (text.includes('dropped')) return 'dropped';
  if (text.includes('failed') || text.includes('invalid')) return 'failed';
  if (text.includes('pending') || text.includes('inflight')) return 'inflight';
  return 'unknown';
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
      submitImplemented: true,
      noRelaySubmit: true
    }
  };
}

export async function sendJitoBundle(payload: JitoBundlePayload, activation: LiveActivationStatus, relay = getJitoRelayReadiness()): Promise<JitoSendBundleResult> {
  const preview = buildJitoBundlePreview(payload, activation, relay);
  const blockers = Array.from(new Set(preview.blockers));
  if (blockers.length) {
    return {
      status: 'blocked',
      observedAt: new Date().toISOString(),
      preview,
      blockers,
      normalizedError: normalizeJitoRelayError(blockers.join(', ')),
      execution: 'blocked-no-jito-relay-submit'
    };
  }

  const signedTransactions = signedTransactionsFrom(payload);
  const endpoint = `${relay.blockEngineUrl.replace(/\/$/, '')}/api/v1/bundles`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `bondr-${Date.now()}`,
        method: 'sendBundle',
        params: [signedTransactions]
      }),
      cache: 'no-store'
    });
    const raw = await response.json().catch(() => null) as null | { result?: string; error?: unknown };
    if (!response.ok || raw?.error) {
      return {
        status: 'relay-error',
        observedAt: new Date().toISOString(),
        preview,
        blockers: ['jito-relay-error'],
        relayRequest: { endpoint, method: 'sendBundle', transactionCount: signedTransactions.length },
        relayResponse: { bundleId: null, raw },
        normalizedError: normalizeJitoRelayError(typeof raw?.error === 'string' ? raw.error : JSON.stringify(raw?.error ?? { status: response.status })),
        execution: 'blocked-no-jito-relay-submit'
      };
    }
    return {
      status: 'submitted',
      observedAt: new Date().toISOString(),
      preview,
      blockers: [],
      relayRequest: { endpoint, method: 'sendBundle', transactionCount: signedTransactions.length },
      relayResponse: { bundleId: raw?.result ?? null, raw },
      execution: 'jito-send-bundle-submitted'
    };
  } catch (error) {
    return {
      status: 'relay-error',
      observedAt: new Date().toISOString(),
      preview,
      blockers: ['jito-relay-request-failed'],
      relayRequest: { endpoint, method: 'sendBundle', transactionCount: signedTransactions.length },
      normalizedError: normalizeJitoRelayError(error),
      execution: 'blocked-no-jito-relay-submit'
    };
  }
}

async function jitoRpc(relay: JitoRelayReadiness, method: string, params: unknown[]) {
  const endpoint = `${relay.blockEngineUrl.replace(/\/$/, '')}/api/v1/bundles`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `bondr-${method}-${Date.now()}`, method, params }),
    cache: 'no-store'
  });
  const raw = await response.json().catch(() => null) as null | { result?: unknown; error?: unknown };
  if (!response.ok || raw?.error) throw new Error(typeof raw?.error === 'string' ? raw.error : JSON.stringify(raw?.error ?? { status: response.status }));
  return raw?.result ?? raw;
}

export async function getJitoBundleStatus(input: { bundleIds?: unknown; projectId?: string | null; rail?: BundleReceiptRecord['rail'] }, relay = getJitoRelayReadiness()): Promise<JitoBundleStatusResult> {
  const observedAt = new Date().toISOString();
  const bundleIds = bundleIdsFrom(input.bundleIds);
  const blockers = [
    bundleIds.length ? null : 'bundle-id-required',
    relay.relayEnabled ? null : 'jito-relay-disabled'
  ].filter((item): item is string => Boolean(item));
  if (blockers.length) {
    return { status: 'blocked', observedAt, relay, bundleIds, receipts: [], blockers, execution: 'bundle-status-read-only-no-submit' };
  }
  try {
    const [inflight, final] = await Promise.all([
      jitoRpc(relay, 'getInflightBundleStatuses', [bundleIds]),
      jitoRpc(relay, 'getBundleStatuses', [bundleIds])
    ]);
    const receipts = bundleIds.map((bundleId): BundleReceiptRecord => ({
      contract: 'bondr-bundle-receipt-v1',
      bundleId,
      rail: input.rail ?? 'bundle',
      status: statusFromRaw({ inflight, final, bundleId }),
      txSignatures: [],
      observedAt,
      provider: 'jito-block-engine',
      projectId: input.projectId ?? null,
      relayResponse: { inflight, final }
    }));
    return { status: 'ok', observedAt, relay, bundleIds, receipts, raw: { inflight, final }, blockers: [], execution: 'bundle-status-read-only-no-submit' };
  } catch (error) {
    return { status: 'relay-error', observedAt, relay, bundleIds, receipts: [], blockers: ['jito-bundle-status-request-failed'], normalizedError: normalizeJitoRelayError(error), execution: 'bundle-status-read-only-no-submit' };
  }
}

export function buildJitoSendBundleBlockedResponse(payload: JitoBundlePayload, activation: LiveActivationStatus, relay = getJitoRelayReadiness()) {
  const preview = buildJitoBundlePreview(payload, activation, relay);
  const blockers = Array.from(new Set(preview.blockers));
  return {
    status: 'blocked',
    observedAt: new Date().toISOString(),
    preview,
    blockers,
    normalizedError: normalizeJitoRelayError(blockers.join(', ')),
    execution: 'blocked-no-jito-relay-submit',
    nextImplementation: ['provide signed transactions', 'verify simulation proof', 'provide explicit approval', 'open Jito relay and broadcast gates', 'submit sendBundle to Jito JSON-RPC', 'store bundle id', 'poll inflight/final status']
  };
}
