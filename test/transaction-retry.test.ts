import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTransactionFailure, decideTransactionRetry } from '../src/execution/transaction-retry.js';

test('retries transient Solana/RPC failures while retry budget remains', () => {
  const decision = decideTransactionRetry({
    failure: new Error('TransactionExpiredBlockheightExceededError: block height exceeded'),
    attempt: 0,
    maxRetries: 2,
    baseDelayMs: 250
  });

  assert.equal(decision.action, 'retry');
  assert.equal(decision.kind, 'blockhash-expired');
  assert.equal(decision.nextAttempt, 1);
  assert.equal(decision.delayMs, 250);
});

test('passes retryable failures after retry budget is exhausted', () => {
  const decision = decideTransactionRetry({
    failure: 'RPC 429 too many requests',
    attempt: 2,
    maxRetries: 2
  });

  assert.equal(decision.action, 'pass');
  assert.equal(decision.kind, 'rate-limited');
  assert.equal(decision.retryable, true);
  assert.match(decision.reason, /retry budget exhausted/);
});

test('passes stale quote and slippage failures instead of blind retrying', () => {
  const decision = decideTransactionRetry({
    failure: { message: 'Slippage tolerance exceeded: minimum output not met' },
    attempt: 0,
    maxRetries: 3
  });

  assert.equal(decision.action, 'pass');
  assert.equal(decision.kind, 'stale-market-or-slippage');
  assert.equal(decision.retryable, false);
  assert.match(decision.reason, /rebuild a fresh decision/);
});

test('passes insufficient funds and signer failures', () => {
  const insufficient = classifyTransactionFailure('custom program error: 0x1 insufficient funds for fee');
  assert.equal(insufficient.kind, 'insufficient-funds');
  assert.equal(insufficient.retryable, false);

  const signer = decideTransactionRetry({
    failure: 'signature verification failed: missing required signature',
    attempt: 0,
    maxRetries: 3
  });
  assert.equal(signer.action, 'pass');
  assert.equal(signer.kind, 'signer-or-auth');
});

test('uses retry-after when it is longer than exponential backoff', () => {
  const decision = decideTransactionRetry({
    failure: { statusCode: 429, message: 'Too Many Requests' },
    attempt: 1,
    maxRetries: 3,
    baseDelayMs: 500,
    retryAfterMs: 3_000
  });

  assert.equal(decision.action, 'retry');
  assert.equal(decision.delayMs, 3_000);
});

test('unknown failures pass rather than compounding risk', () => {
  const decision = decideTransactionRetry({
    failure: 'unrecognized custom venue failure',
    attempt: 0,
    maxRetries: 3
  });

  assert.equal(decision.action, 'pass');
  assert.equal(decision.kind, 'unknown');
});
