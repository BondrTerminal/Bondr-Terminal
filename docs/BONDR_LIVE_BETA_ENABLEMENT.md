# BONDR Live Beta Enablement

Date: 2026-08-11
Phase: Controlled live-beta plumbing behind explicit gates

## Objective

Move BONDR from pure pre-live preview toward functional live-beta infrastructure without unsafe execution. This pass adds the gate contract, simulation route, and browser-wallet UI flow needed for live beta, but does **not** flip any live environment variables and does **not** broadcast or deploy anything.

## Environment gates

Live functionality is controlled by explicit env gates:

- `LIVE_TRADING_ENABLED=true` — allows live-shaped unsigned transaction build paths.
- `LIVE_BETA_SIGNING_ENABLED=true` — allows browser-wallet signing UI after live trading is enabled.
- `LIVE_BETA_BROADCAST_ENABLED=true` — allows signed transaction submission after trading + signing are enabled.
- `LIVE_DEPLOYMENT_ENABLED=true` — allows deployment adapters after trading + signing are enabled.
- `LIVE_REQUIRE_SIMULATION=true` — default behavior; signing/broadcast must be blocked when simulation fails or is missing.
- `LIVE_ALLOWED_CLUSTER=mainnet-beta|devnet|testnet|localnet` — defaults to `mainnet-beta`.
- `LIVE_MAX_SOL_PER_SWAP` — defaults to `0.25`.
- `LIVE_MAX_USDC_PER_SWAP` — defaults to `50`.
- `LIVE_MAX_SLIPPAGE_BPS` — defaults to `250`.

## Canonical readiness contract

Added `apps/web/lib/live-activation.ts`.

It returns:

- `liveTradingEnabled`
- `signingEnabled`
- `broadcastEnabled`
- `deploymentEnabled`
- `requireSimulation`
- `allowedCluster`
- `readinessLevel`
- `limits`
- `rpcHealth`
- `authStatus`
- `blockers`
- `warnings`

Readiness levels:

- `disabled`
- `preview`
- `signing-ready`
- `broadcast-ready`
- `deployment-ready`

## Wired API surfaces

### `/api/execution-capabilities`

Now returns the full `liveActivation` contract plus top-level compatibility fields:

- `signingEnabled`
- `broadcastEnabled`
- `deploymentEnabled`
- `requireSimulation`
- `allowedCluster`
- `readinessLevel`
- `blockers`
- `warnings`

### `/api/terminal/live-readiness`

Now reports category readiness for:

- wallet connection
- transaction preview
- simulation
- broadcast
- deployment
- provider/RPC

### `/api/terminal/signer-dry-run`

Now supports POST simulation of `unsignedTransaction` or `signedTransaction` base64:

- decodes transaction
- simulates over configured RPC
- returns logs, error, units consumed, and replacement blockhash when available
- never signs
- never broadcasts
- returns `TransactionPreview` metadata

### `/api/execution-swap`

Still gated by `LIVE_TRADING_ENABLED` for unsigned build. Responses now expose signing/broadcast/deployment flags for UI consumers.

### `/api/send-signed-transaction`

Broadcast now requires all three gates:

- `LIVE_TRADING_ENABLED=true`
- `LIVE_BETA_SIGNING_ENABLED=true`
- `LIVE_BETA_BROADCAST_ENABLED=true`

Existing server-side policy checks remain required before any broadcast.

## Terminal live-beta UX

Terminal execution dock now supports a gated flow:

1. Preview quote.
2. Build + simulate unsigned transaction.
3. Show Transaction Preview safety card.
4. Enable `Sign in wallet` only when signing gate is active and simulation passed.
5. Store signed transaction client-side if broadcast gate is disabled.
6. Enable `Submit transaction` only when broadcast gate is active and a signed transaction exists.

The server never collects private keys and never signs.

## Deployment status

Deployment is not fully live yet. `LIVE_DEPLOYMENT_ENABLED` is represented in the readiness contract, but adapter-specific unsigned transaction builders are still required for Pump.fun, Raydium, Meteora, and Bonk. Until those adapters are implemented and verified, Deployment remains config/preflight/preview-only.

## Provider/RPC blocker

Last runtime smoke showed Helius configured but quota-limited/degraded with `429 max usage reached`. Live beta should not proceed until either:

- Helius quota is fixed, or
- a healthy explicit fallback provider is configured and shown in readiness.

Do not silently fall back to public RPC for live broadcast.

## Safety invariants

Still prohibited unless separately and explicitly approved/tested:

- server custody
- server-side private key signing
- hidden swaps
- automatic deployment
- automatic wallet funding
- reward payouts/claims
- background trading
- unlabeled fake balances/PnL

## Verification

Required after this pass:

- `pnpm web:check`
- `pnpm web:build`
- `pnpm test`
- local smoke for `/api/execution-capabilities`
- local smoke for `/api/terminal/live-readiness`
- blocked-path smoke with default gates false

No Vercel deploy should be performed until the operator explicitly requests deployment after local verification.
