# BONDR Execution Readiness Sprint

Date: 2026-08-14

## Scope

This sprint combines the Jito/relay gap and the broader launch-execution audit into one readiness layer. It does not enable live deployment, funding, broadcast, private-key handling, or server custody.

## What Exists

- Deployment rehearsal UI with token metadata, route, wallet, task, risk, and review steps.
- A-profile browser-wallet signing rehearsal and live gate contract.
- Pre-live dry-run endpoint.
- Bundle sequencer validation and unsigned transaction build path.
- Readiness surfaces for deployment, wallet rail, execution capabilities, and terminal.

## What Was Missing

- Jito/block-engine relay status, tip caps, method contract, and bundle status requirements.
- Pump.fun/PumpPortal create readiness: IPFS metadata, mint keypair, dev wallet, initial buy, slippage, priority fee, and pool requirements.
- IPFS pinning readiness.
- Honest multi-wallet signing status. Browser-wallet-only signing does not make watch-only wallet bundle legs executable.
- Explicit risk presets. A project could save zeroed risk rails and fail dry-run with `risk-rules-missing`.
- Funding/tip readiness: priority fee cap, Jito tip cap, create fee bucket, and buffer SOL.
- Sniper/task execution readiness: trigger engine, relay policy, durable scheduler/worker, confirmation/retry loop, and monitoring.

## What This Sprint Added

- `bondr-jito-relay-readiness-v1` contract in `apps/web/lib/jito-relay-readiness.ts`.
- `/api/relay/jito/status` for status/readiness only. It does not build, sign, submit, or relay transactions.
- `/api/execution-capabilities` now exposes Jito relay status and `/api/relay/jito/status`.
- `/api/bundle-sequencer` now reports Jito relay readiness, signed-bundle payload shape, tip cap requirements, and future submit route instead of a vague relay-unavailable state.
- `/api/deployment-readiness` now includes relay readiness.
- Deployment launch readiness now reports PumpPortal create readiness, IPFS metadata readiness, signing orchestration, relay readiness, and funding/tip readiness.
- Pre-live dry-run now returns exact missing risk-rule details plus relay and execution rail readiness.
- Deployment UI now includes explicit risk presets:
  - Conservative
  - Standard launch rehearsal
  - Aggressive sniper
  - Manual/custom
- Deployment Review now shows execution-readiness tiles for Jito relay, PumpPortal/IPFS, multi-wallet signing, and task worker status.

## Still Blocked Before Real Launch

- Real PumpPortal create builder and metadata upload/pinning pipeline.
- Real Jito `sendBundle` endpoint and bundle status polling.
- Multi-wallet signing orchestration for non-dev wallet legs.
- Sniper trigger engine.
- Durable task runner/worker.
- Post-submit confirmation, retry, receipt, and project-state update loop.
- Provider-backed post-launch monitoring/webhooks/indexing.
- Separate operator approval to enable deploy, broadcast, or funding gates.

## Provider Docs Consulted

- Jito low-latency transaction send and bundles: https://docs.jito.wtf/lowlatencytxnsend/
- Jito TypeScript SDK: https://github.com/jito-labs/jito-ts
- Jito JSON-RPC JavaScript SDK: https://github.com/jito-labs/jito-js-rpc
- PumpPortal token creation: https://pumpportal.fun/creation/
- PumpPortal Jito bundles: https://pumpportal.fun/local-trading-api/jito-bundles/
- Solana confirmation concepts: https://solana.com/developers/cookbook/transactions/confirmation/
- Jupiter send transaction docs: https://developers.jup.ag/docs/swap/v1/send-swap-transaction
- Helius webhooks: https://www.helius.dev/docs/webhooks

## Safety State

Live submission remains blocked by default:

- `LIVE_BETA_BROADCAST_ENABLED=false`
- `LIVE_DEPLOYMENT_ENABLED=false`
- `LIVE_BETA_FUNDING_BROADCAST_ENABLED=false`
- `JITO_RELAY_ENABLED=false`

Any future relay/deploy endpoint must remain preview/status/policy-only until the operator explicitly approves the live gate profile.
