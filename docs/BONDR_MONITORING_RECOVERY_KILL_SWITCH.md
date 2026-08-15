# BONDR Monitoring, Recovery, And Kill Switch

Date: 2026-08-14

## Purpose

Sprint 10 adds the recovery-readiness contract for future live launch, bundle, sniper, and task execution. It does not monitor, retry, rebuild, sign, or broadcast.

## What This Adds

- Recovery status endpoint: `GET /api/execution/recovery-status`.
- Contract: `bondr-execution-recovery-readiness-v1`.
- Monitoring readiness for:
  - launch transaction
  - bundle transactions
  - wallet balances
  - token balances
  - pool/graduation state
- Retry policy:
  - retry/rebuild only for blockhash expiry, account lock contention, rate limits, and transient network failures
  - no retry for stale market/slippage, insufficient funds, signer/auth, risk/HALT, invalid transaction, or unknown failures
- Kill-switch status reads existing `HALT` file locations without creating or changing them.

## Still Missing

- Durable monitor worker.
- Receipt ledger persistence.
- Automatic post-submit polling.
- Recovery runner with bounded retries.
- Operator controls to arm/disarm execution outside the filesystem HALT convention.
