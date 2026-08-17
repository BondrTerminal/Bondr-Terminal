# BONDR Sniper And Task Engine Readiness

Date: 2026-08-14

Updated: 2026-08-16

## Purpose

This sprint makes Sniper and Task rails honest before any live execution exists. The UI can configure and rehearse, but it must not imply autonomous trading, bundle submits, or background tasks are live.

## What This Sprint Added

- Shared readiness builders in `apps/web/lib/sniper-task-readiness.ts`.
- Sniper readiness endpoint: `/api/sniper/readiness`.
- Sniper trigger preview endpoint: `/api/sniper/trigger-preview`.
- Task readiness endpoint: `/api/tasks/readiness`.
- Task queue preview endpoint: `/api/tasks/queue-preview`.
- Sniper terminal now shows Sniper Engine and Task Engine readiness pills.
- Deployment debug route map includes the new readiness endpoints.
- Sniper pool freshness proof contract: `bondr-sniper-pool-freshness-proof-v1`.
- Task lifecycle preview contract: `bondr-task-lifecycle-preview-v1`.
- Task receipt ledger preview contract: `bondr-task-receipt-ledger-preview-v1`.
- Task monitor/recovery preview contract: `bondr-task-monitor-recovery-preview-v1`.

## Sniper Readiness Checks

- Trigger source.
- Manual trigger preview contract: `bondr-sniper-trigger-preview-v1`.
- Pool detector/webhook freshness proof requiring mint, pool id, slot, positive liquidity, and fresh observation timestamp.
- Token/pool detection.
- Quote/build path.
- Simulation policy.
- Signer binding.
- Relay/RPC submit policy.
- Failure recovery.
- Receipts and monitoring.

## Task Readiness Checks

- Durable worker outside ordinary Vercel request lifecycle.
- Queue preview contract: `bondr-task-queue-preview-v1`.
- Lifecycle preview contract: `bondr-task-lifecycle-preview-v1`.
- Receipt ledger preview contract: `bondr-task-receipt-ledger-preview-v1`.
- Monitor/recovery preview contract: `bondr-task-monitor-recovery-preview-v1`.
- Schedule/queue model.
- Pause/resume/cancel controls.
- Signer binding.
- Cooldown and max-run enforcement.
- TP/SL/trailing watchers.
- Anti-self-trade and anti-fake-volume policy.
- Relay/RPC submit policy.
- Receipts and recovery.

## Current Truth

- Sniper manual quote/build/simulate/sign rehearsal exists.
- Sniper trigger preview validates source, mint, connected signer, amount, slippage, simulation proof, relay, and broadcast blockers without building a buy.
- Sniper automated source preview now requires fresh pool proof before clearing pool-detector/webhook triggers.
- Task configuration exists.
- Task queue preview models task name, wallet allowlist, schedule, max runs, cooldown, risk binding, and paused-by-default state.
- Task lifecycle preview models queued/waiting/ready/completed states, idempotency keys, pause/resume/cancel controls, cooldown, max runs, and TP/SL/trailing/take-profit readiness.
- Task receipt ledger preview names the receipt fields required before durable worker execution.
- Task monitor/recovery preview names TP/SL/trailing watchers and no-blind-retry recovery classes.
- Durable sniper trigger automation is not implemented.
- Durable task worker, persistent queue, live monitor, durable receipt ledger, and automatic recovery runner are not implemented.
- Broadcast remains closed.
- Jito relay remains disabled.
- No autonomous trading occurs.
- Trigger preview never builds, signs, or broadcasts a transaction.
- Task queue preview never persists a worker job or executes a trade.
- No fake-volume or self-trade behavior is allowed.

## Remaining Before Live Execution

- Provider-backed trigger/indexer source.
- Durable worker/queue.
- Signed intent records.
- Per-task simulation loop.
- Relay/RPC submit implementation.
- Durable receipt ledger.
- Automatic recovery runner.
- Kill switch enforcement in live readiness.
