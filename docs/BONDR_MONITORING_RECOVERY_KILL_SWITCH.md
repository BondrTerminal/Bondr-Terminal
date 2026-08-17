# BONDR Monitoring, Recovery, And Kill Switch

Date: 2026-08-14

Updated: 2026-08-16

## Purpose

Sprint 10 adds the recovery-readiness contract for future live launch, bundle, sniper, and task execution. It does not monitor, retry, rebuild, sign, or broadcast.

## What This Adds

- Recovery status endpoint: `GET /api/execution/recovery-status`.
- Contract: `bondr-execution-recovery-readiness-v1`.
- Deployment recovery preview contract: `bondr-deployment-recovery-preview-v1`.
- Monitoring readiness for:
  - launch transaction
  - bundle transactions
  - wallet balances
  - token balances
  - pool/graduation state
- Retry policy:
  - retry/rebuild only for blockhash expiry, account lock contention, rate limits, and transient network failures
  - no retry for stale market/slippage, insufficient funds, signer/auth, risk/HALT, invalid transaction, or unknown failures
- Deployment recovery preview records the receipt fields needed after a create, the cases that require a rebuild rather than a retry, and the failure classes that must stop without blind resubmission.
- Kill-switch status reads existing `HALT` file locations without creating or changing them.
- Live risk readiness contract: `bondr-live-risk-readiness-v1`.
- `getLiveActivationStatus()` now exposes shared live risk limits and closes signing, broadcast, funding broadcast, and deployment gates when:
  - HALT/emergency stop is active
  - live mode lacks drawdown/daily-loss observation
  - daily loss meets/exceeds `LIVE_MAX_DAILY_LOSS_SOL`
  - drawdown meets/exceeds `LIVE_KILL_SWITCH_DRAWDOWN_BPS`
- `/api/execution-capabilities` exposes `riskReadiness`.
- `/api/terminal/live-readiness` includes a Risk category.

## Still Missing

- Durable monitor worker.
- Receipt ledger persistence.
- Automatic post-submit polling.
- Recovery runner with bounded retries.
- Operator controls to arm/disarm execution outside the filesystem HALT convention.
- Production live drawdown/daily-loss observation source.
