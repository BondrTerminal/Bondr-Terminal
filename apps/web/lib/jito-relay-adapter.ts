import type { LiveActivationStatus } from './live-activation';
import { getJitoRelayReadiness, type JitoRelayReadiness } from './jito-relay-readiness';
import { VersionedTransaction } from '@solana/web3.js';

export type JitoBundlePayload = {
  signedTransactions?: unknown;
  expectedSigners?: unknown;
  expectedMint?: unknown;
  expectedTransactionSignatures?: unknown;
  tipLamports?: unknown;
  simulationProof?: unknown;
  approvalId?: unknown;
  antiFrontRunRequired?: unknown;
  projectId?: unknown;
  rail?: unknown;
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
    antiFrontRunRequired: boolean;
    antiFrontRunMarkerDetected: boolean;
    antiFrontRunMarkerIndexes: number[];
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
    antiFrontRunRequired: boolean;
  };
  safety: {
    relayEnabled: boolean;
    broadcastEnabled: boolean;
    submitImplemented: boolean;
    noRelaySubmit: boolean;
  };
};

const JITO_DONT_FRONT_PREFIX = 'jitodontfront';

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
  receipt?: BundleReceiptRecord | null;
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
  confirmationStatus?: string | null;
  landedSlot?: number | null;
  err?: unknown;
  statusSource?: 'submitted-response' | 'getInflightBundleStatuses' | 'getBundleStatuses' | 'combined';
  executionProofStatus?: 'relay-status-only-not-chain-proof';
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

function railFrom(value: unknown): BundleReceiptRecord['rail'] {
  return value === 'deployment' || value === 'bundle' || value === 'sniper' || value === 'task' ? value : 'bundle';
}

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function asBoolean(value: unknown) {
  return value === true || value === 'true';
}

function signedTransactionsFrom(payload: JitoBundlePayload) {
  return asStringArray(payload.signedTransactions);
}

function jitoDontFrontMarkerIndexes(signedTransactions: string[]) {
  const indexes: number[] = [];
  signedTransactions.forEach((transactionBase64, index) => {
    try {
      const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
      const hasMarker = transaction.message.staticAccountKeys.some((key) => key.toBase58().startsWith(JITO_DONT_FRONT_PREFIX));
      if (hasMarker) indexes.push(index);
    } catch {
      // The signed-review layer owns full transaction validity. This helper only
      // detects Jito's optional anti-front-run marker when it is decodable.
    }
  });
  return indexes;
}

function bundleIdsFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()).slice(0, 20)
    : typeof value === 'string' && value.trim()
      ? [value.trim()]
      : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function valueRows(raw: unknown): Record<string, unknown>[] {
  const record = asRecord(raw);
  const value = Array.isArray(record.value) ? record.value : Array.isArray(record.result) ? record.result : [];
  return value.filter((row): row is Record<string, unknown> => row && typeof row === 'object' && !Array.isArray(row));
}

function bundleIdFromRow(row: Record<string, unknown>) {
  return asString(row.bundle_id ?? row.bundleId ?? row.bundle);
}

function findBundleRow(raw: unknown, bundleId: string) {
  return valueRows(raw).find((row) => bundleIdFromRow(row) === bundleId) ?? null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function signaturesFromRow(row: Record<string, unknown> | null) {
  return asStringArray(row?.transactions ?? row?.txSignatures ?? row?.transaction_signatures);
}

function statusFromRows(inflightRow: Record<string, unknown> | null, finalRow: Record<string, unknown> | null): BundleReceiptRecord['status'] {
  const err = finalRow?.err ?? inflightRow?.err ?? null;
  const finalStatus = String(finalRow?.confirmation_status ?? finalRow?.confirmationStatus ?? finalRow?.status ?? '').toLowerCase();
  const inflightStatus = String(inflightRow?.status ?? '').toLowerCase();
  if (err) return 'failed';
  if (finalStatus === 'finalized') return 'finalized';
  if (finalStatus === 'confirmed' || finalStatus === 'processed' || finalStatus === 'landed') return 'landed';
  if (finalStatus === 'failed' || finalStatus === 'invalid') return 'failed';
  if (inflightStatus === 'landed') return 'landed';
  if (inflightStatus === 'failed' || inflightStatus === 'invalid') return 'failed';
  if (inflightStatus === 'dropped') return 'dropped';
  if (inflightStatus === 'pending' || inflightStatus === 'inflight') return 'inflight';
  return 'unknown';
}

export function normalizeJitoBundleStatusReceipt(input: {
  bundleId: string;
  inflight?: unknown;
  final?: unknown;
  observedAt: string;
  rail?: BundleReceiptRecord['rail'];
  projectId?: string | null;
}): BundleReceiptRecord {
  const inflightRow = findBundleRow(input.inflight, input.bundleId);
  const finalRow = findBundleRow(input.final, input.bundleId);
  const status = statusFromRows(inflightRow, finalRow);
  const txSignatures = Array.from(new Set([
    ...signaturesFromRow(finalRow),
    ...signaturesFromRow(inflightRow)
  ]));
  const confirmationStatus = asString(finalRow?.confirmation_status ?? finalRow?.confirmationStatus ?? null);
  const landedSlot = numberOrNull(finalRow?.slot ?? finalRow?.landed_slot ?? inflightRow?.landed_slot ?? inflightRow?.landedSlot ?? null);
  return {
    contract: 'bondr-bundle-receipt-v1',
    bundleId: input.bundleId,
    rail: input.rail ?? 'bundle',
    status,
    txSignatures,
    observedAt: input.observedAt,
    provider: 'jito-block-engine',
    projectId: input.projectId ?? null,
    confirmationStatus,
    landedSlot,
    err: finalRow?.err ?? inflightRow?.err ?? null,
    statusSource: inflightRow && finalRow ? 'combined' : finalRow ? 'getBundleStatuses' : inflightRow ? 'getInflightBundleStatuses' : 'combined',
    executionProofStatus: 'relay-status-only-not-chain-proof',
    relayResponse: { inflight: inflightRow, final: finalRow }
  };
}

function buildSubmittedReceipt(payload: JitoBundlePayload, bundleId: string | null, relayResponse: unknown, observedAt: string): BundleReceiptRecord | null {
  if (!bundleId) return null;
  return {
    contract: 'bondr-bundle-receipt-v1',
    bundleId,
    rail: railFrom(payload.rail),
    status: 'submitted',
    txSignatures: asStringArray(payload.expectedTransactionSignatures),
    observedAt,
    provider: 'jito-block-engine',
    projectId: asString(payload.projectId),
    statusSource: 'submitted-response',
    executionProofStatus: 'relay-status-only-not-chain-proof',
    relayResponse
  };
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
  const antiFrontRunRequired = asBoolean(payload.antiFrontRunRequired);
  const antiFrontRunMarkerIndexes = jitoDontFrontMarkerIndexes(signedTransactions);
  const antiFrontRunMarkerDetected = antiFrontRunMarkerIndexes.length > 0;

  const blockers = [
    signedTransactions.length ? null : 'signed-transactions-missing',
    signedTransactions.length > relay.limits.maxTransactionsPerBundle ? `bundle-exceeds-${relay.limits.maxTransactionsPerBundle}-transaction-limit` : null,
    expectedSigners.length ? null : 'expected-signers-missing',
    expectedMint ? null : 'expected-mint-missing',
    tipLamports > 0 ? null : 'jito-tip-missing',
    tipLamports > relay.tip.maxLamports ? 'jito-tip-exceeds-cap' : null,
    simulationProofPresent ? null : 'simulation-proof-missing',
    approvalPresent ? null : 'explicit-approval-missing',
    antiFrontRunRequired && antiFrontRunMarkerIndexes[0] !== 0 ? 'jitodontfront-marker-required-on-first-transaction' : null,
    antiFrontRunMarkerIndexes.some((index) => index > 0) ? 'jitodontfront-protected-transaction-must-be-first' : null,
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
      approvalPresent,
      antiFrontRunRequired,
      antiFrontRunMarkerDetected,
      antiFrontRunMarkerIndexes
    },
    blockers,
    warnings,
    payloadShape: {
      signedTransactions: 'base64[]',
      expectedSigners: 'wallet public key[]',
      expectedMint: 'token mint',
      tipLamports,
      simulationProof: 'required-before-submit',
      approvalId: 'required-before-submit',
      antiFrontRunRequired
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
        params: [signedTransactions, { encoding: 'base64' }]
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
    const observedAt = new Date().toISOString();
    const bundleId = raw?.result ?? null;
    return {
      status: 'submitted',
      observedAt,
      preview,
      blockers: [],
      relayRequest: { endpoint, method: 'sendBundle', transactionCount: signedTransactions.length },
      relayResponse: { bundleId, raw },
      receipt: buildSubmittedReceipt(payload, bundleId, raw, observedAt),
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
    const receipts = bundleIds.map((bundleId) => normalizeJitoBundleStatusReceipt({ bundleId, inflight, final, observedAt, rail: input.rail, projectId: input.projectId }));
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
