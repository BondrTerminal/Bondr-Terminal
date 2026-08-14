# BONDR Execution Truth Map

Date: 2026-08-14

## Purpose

The execution truth map is the shared readiness language for BONDR's Deployment, Bundle, Sniper, and Task rails. It prevents UI-only progress from being mistaken for executable launch infrastructure.

## Contract

`/api/execution-truth-map` returns `bondr-execution-truth-map-v1`.

The normalized execution spine is:

```text
builder -> signer -> simulation -> relay-broadcast -> receipt -> monitor -> recovery
```

Each rail reports:

- `ready`
- `rehearsal-only`
- `blocked`
- `missing-implementation`

The endpoint is read-only. It does not build, sign, submit, broadcast, fund, deploy, relay, or schedule execution.

## Rail Truth

### Deployment

Current state: blocked / missing implementation.

Known gaps:

- PumpPortal create builder is mapped but not implemented.
- IPFS metadata URI is required before real PumpPortal create.
- Deploy and broadcast gates remain closed.
- Post-launch mint/signature/project-state capture is missing.
- Deployment failure recovery is missing.

### Bundle

Current state: rehearsal-only builder, blocked relay.

Known gaps:

- Jito relay is disabled by default.
- Watch-only wallet rows cannot sign bundle legs.
- Bundle ID and landed/dropped/finalized tracking are missing.
- Post-bundle wallet/buyer-state monitoring is missing.
- Bundle expiry/rebuild/no-blind-retry flow is missing.

### Sniper

Current state: manual quote/build/simulate/sign rehearsal.

Known gaps:

- Low-latency trigger source is missing.
- Pool event detection is missing.
- Broadcast gate is closed.
- Signature receipt/fill reconciliation is missing.
- Stale quote/slippage/blockhash/account-lock recovery needs live wiring.

### Task

Current state: config-only.

Known gaps:

- Durable scheduler/worker is missing.
- Per-task simulation loop is missing.
- Task receipts/audit ledger are missing.
- Pause/resume/cancel, TP/SL watchers, cooldown enforcement, and kill switch are missing.
- Task broadcast remains closed and must not run from a normal Vercel request lifecycle.

## Surfaces Wired

- `/api/execution-truth-map`
- `/api/execution-capabilities`
- `/api/terminal-backend`
- `/deployment` Review tab
- `/sniper` Execution Dock

## Safety State

The truth map is intentionally conservative. A rail should stay blocked when it lacks any part of the execution spine, even if the UI can configure that rail.

Current protected actions remain closed unless separately approved:

- live deployment
- transaction broadcast
- funding broadcast
- Jito relay submission
- private-key handling
- server custody
- autonomous task execution

## Next Sprint

Prompt 2 should close the first real builder gap: PumpPortal + IPFS deploy builder readiness.
