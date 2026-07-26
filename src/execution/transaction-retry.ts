import type { CapturedError } from '../runtime/errors.js';

export type TransactionFailureKind =
  | 'transient-network'
  | 'rate-limited'
  | 'blockhash-expired'
  | 'account-in-use'
  | 'stale-market-or-slippage'
  | 'insufficient-funds'
  | 'risk-or-halt'
  | 'signer-or-auth'
  | 'invalid-transaction'
  | 'unknown';

export type TransactionFailureClassification = {
  kind: TransactionFailureKind;
  retryable: boolean;
  reason: string;
};

export type TransactionRetryDecision = {
  action: 'retry' | 'pass';
  kind: TransactionFailureKind;
  attempt: number;
  nextAttempt: number | null;
  delayMs: number | null;
  retryable: boolean;
  reason: string;
};

type FailureLike = string | Error | CapturedError | {
  message?: string;
  name?: string;
  code?: string | number;
  status?: number;
  statusCode?: number;
  logs?: string[];
};

function failureText(failure: FailureLike): string {
  if (typeof failure === 'string') return failure;
  if (failure instanceof Error) return [failure.name, failure.message, failure.cause instanceof Error ? failure.cause.message : ''].join(' ');

  const code = 'code' in failure ? failure.code : undefined;
  const status = 'status' in failure ? failure.status : undefined;
  const statusCode = 'statusCode' in failure ? failure.statusCode : undefined;
  const logs = 'logs' in failure ? failure.logs : undefined;
  const parts = [
    failure.name,
    failure.message,
    code === undefined ? undefined : String(code),
    status === undefined ? undefined : `status ${status}`,
    statusCode === undefined ? undefined : `status ${statusCode}`,
    ...(logs ?? [])
  ];
  return parts.filter((part): part is string => part !== undefined && part.length > 0).join(' ');
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

export function classifyTransactionFailure(failure: FailureLike): TransactionFailureClassification {
  const text = failureText(failure).toLowerCase();

  if (includesAny(text, ['halt', 'kill switch', 'risk blocked', 'drawdown', 'daily loss'])) {
    return { kind: 'risk-or-halt', retryable: false, reason: 'risk or HALT guard blocked the transaction; do not retry blindly' };
  }

  if (includesAny(text, ['insufficient funds', 'insufficient lamports', 'insufficient sol', 'custom program error: 0x1'])) {
    return { kind: 'insufficient-funds', retryable: false, reason: 'wallet does not have enough spendable balance for this transaction' };
  }

  if (includesAny(text, ['slippage', 'price impact', 'minimum output', 'market moved', 'stale quote'])) {
    return { kind: 'stale-market-or-slippage', retryable: false, reason: 'quote or market moved; pass this transaction and rebuild a fresh decision' };
  }

  if (includesAny(text, ['signature verification failed', 'unauthorized', 'not authorized', 'missing required signature', 'keypair', 'signer'])) {
    return { kind: 'signer-or-auth', retryable: false, reason: 'signer/auth failure requires operator or signer fix, not retry' };
  }

  if (includesAny(text, ['invalid instruction', 'invalid account', 'account owned by wrong program', 'owner mismatch', 'invalid account data', 'address lookup table not found'])) {
    return { kind: 'invalid-transaction', retryable: false, reason: 'transaction shape or accounts are invalid; retrying the same transaction will not help' };
  }

  if (includesAny(text, ['blockhash not found', 'block height exceeded', 'transaction expired', 'transactionexpiredblockheightexceedederror', 'last valid block height'])) {
    return { kind: 'blockhash-expired', retryable: true, reason: 'recent blockhash expired; rebuild and retry if retry budget remains' };
  }

  if (includesAny(text, ['account in use', 'accountinuse', 'would exceed max account locks'])) {
    return { kind: 'account-in-use', retryable: true, reason: 'account lock contention is usually temporary; retry after a short backoff' };
  }

  if (includesAny(text, ['429', 'too many requests', 'rate limit', 'rate-limited', 'retry-after'])) {
    return { kind: 'rate-limited', retryable: true, reason: 'RPC or API rate-limited the request; retry after backoff if budget remains' };
  }

  if (includesAny(text, ['timeout', 'timed out', 'fetch failed', 'econnreset', 'etimedout', 'socket hang up', 'node is unhealthy', '503', '502', '504', 'service unavailable', 'temporarily unavailable'])) {
    return { kind: 'transient-network', retryable: true, reason: 'network/RPC failure looks temporary; retry if budget remains' };
  }

  return { kind: 'unknown', retryable: false, reason: 'unknown transaction failure; pass rather than compound risk with blind retries' };
}

export function decideTransactionRetry(args: {
  failure: FailureLike;
  attempt: number;
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryAfterMs?: number;
}): TransactionRetryDecision {
  const attempt = Math.max(0, Math.floor(args.attempt));
  const maxRetries = Math.max(0, Math.floor(args.maxRetries));
  const classification = classifyTransactionFailure(args.failure);

  if (!classification.retryable) {
    return {
      action: 'pass',
      kind: classification.kind,
      attempt,
      nextAttempt: null,
      delayMs: null,
      retryable: false,
      reason: classification.reason
    };
  }

  if (attempt >= maxRetries) {
    return {
      action: 'pass',
      kind: classification.kind,
      attempt,
      nextAttempt: null,
      delayMs: null,
      retryable: true,
      reason: `${classification.reason}; retry budget exhausted (${attempt}/${maxRetries})`
    };
  }

  const baseDelayMs = args.baseDelayMs ?? 500;
  const maxDelayMs = args.maxDelayMs ?? 5_000;
  const exponentialDelayMs = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
  const delayMs = args.retryAfterMs === undefined ? exponentialDelayMs : Math.max(exponentialDelayMs, args.retryAfterMs);

  return {
    action: 'retry',
    kind: classification.kind,
    attempt,
    nextAttempt: attempt + 1,
    delayMs,
    retryable: true,
    reason: classification.reason
  };
}
