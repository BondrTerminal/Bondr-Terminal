# BONDR Sniper And Task Engine Readiness

Date: 2026-08-14

## Purpose

This sprint makes Sniper and Task rails honest before any live execution exists. The UI can configure and rehearse, but it must not imply autonomous trading, bundle submits, or background tasks are live.

## What This Sprint Added

- Shared readiness builders in `apps/web/lib/sniper-task-readiness.ts`.
- Sniper readiness endpoint: `/api/sniper/readiness`.
- Sniper trigger preview endpoint: `/api/sniper/trigger-preview`.
- Task readiness endpoint: `/api/tasks/readiness`.
- Sniper terminal now shows Sniper Engine and Task Engine readiness pills.
- Deployment debug route map includes the new readiness endpoints.

## Sniper Readiness Checks

- Trigger source.
- Manual trigger preview contract: `bondr-sniper-trigger-preview-v1`.
- Token/pool detection.
- Quote/build path.
- Simulation policy.
- Signer binding.
- Relay/RPC submit policy.
- Failure recovery.
- Receipts and monitoring.

## Task Readiness Checks

- Durable worker outside ordinary Vercel request lifecycle.
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
- Task configuration exists.
- Sniper trigger automation is not implemented.
- Durable task worker is not implemented.
- Broadcast remains closed.
- Jito relay remains disabled.
- No autonomous trading occurs.
- Trigger preview never builds, signs, or broadcasts a transaction.
- No fake-volume or self-trade behavior is allowed.

## Remaining Before Live Execution

- Provider-backed trigger/indexer source.
- Durable worker/queue.
- Signed intent records.
- Per-task simulation loop.
- Relay/RPC submit implementation.
- Receipt ledger.
- Recovery policy.
- Kill switch.
