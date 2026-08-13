# BONDR Transaction Preview Layer

Date: 2026-08-11
Phase: Safe unsigned-build foundation

## Purpose

The Transaction Preview Layer gives BONDR/Bond.Terminal one shared contract for route previews, unsigned transaction builds, signer dry-runs, and blocked broadcast responses.

This is a live-beta foundation step only. It does **not** enable signing, broadcast, custody, deployment, swaps, LP creation, wallet mutation, reward claims, or payouts.

## Contract

Canonical type: `apps/web/lib/transaction-preview.ts`

Every preview carries the safety invariants explicitly:

- `userConfirmationRequired: true`
- `signingEnabled: false`
- `broadcastEnabled: false`
- `blockers: string[]`
- `warnings: string[]`

Supported preview modes:

- `preview-only` — quote/read-only estimate; no transaction built.
- `unsigned-build` — unsigned transaction may be returned for later browser-wallet inspection/signing after future gates.
- `simulation-ready` — reserved for simulation surfaces once provider simulation is wired.

Supported action labels:

- `swap`
- `launch`
- `lp`
- `claim`
- `wallet-send`

## Human-readable preview UI

Added compact premium preview cards in the Terminal execution dock and Liquidity quote probe. These surfaces show mode, action, simulation status, route/provider, blockers, warnings, and explicit disabled signing/broadcast state. They are informational only; the execute/broadcast controls remain disabled unless a future explicit live activation is approved.

## Wired surfaces

- `/api/execution-quote`
  - Returns route/quote preview only.
  - Adds `transactionPreview.mode = preview-only` on successful quote responses.
  - No transaction is built, signed, or sent.

- `/api/execution-swap`
  - Still blocked unless `LIVE_TRADING_ENABLED=true`.
  - Blocked responses include `transactionPreview` with signing/broadcast disabled.
  - If a future live-gated build path is enabled, the response carries `transactionPreview.mode = unsigned-build` and still marks signing/broadcast disabled.

- `/api/send-signed-transaction`
  - Still blocked unless `LIVE_TRADING_ENABLED=true`.
  - Blocked responses include `transactionPreview` with signing/broadcast disabled.
  - Existing policy checks remain the final safety layer before any future broadcast.

- `/api/terminal/signer-dry-run`
  - Remains decode/policy-check only.
  - No broadcast is performed.

## Safety boundaries

Current build remains pre-live:

- No server custody execution.
- No hidden swaps.
- No fake balances or unlabeled placeholder metrics.
- No browser-wallet signing flow is enabled.
- No transaction broadcast is enabled.
- No token deployment, LP creation, wallet funding, or reward claiming is enabled.

## Verification

Latest local verification for this pass:

- `pnpm web:check` — passed
- `pnpm web:build` — passed
- Human-readable preview UI pass: `pnpm web:check` and `pnpm web:build` completed locally
- `pnpm test` — passed, 166 tests
- Local production smoke on `127.0.0.1:3143` — `/api/execution-swap` returned `403` with `transactionPreview.signingEnabled=false` and `transactionPreview.broadcastEnabled=false`; `/api/execution-capabilities` returned `liveTradingEnabled=false`.

## Next live-beta steps

Before any real live beta activation, BONDR still needs:

1. Browser-wallet connection and signer identity confirmation.
2. Human-readable transaction preview UI.
3. Provider simulation for unsigned transactions.
4. Explicit final confirmation before signing.
5. Broadcast gate with intent binding, policy checks, RPC health, slippage/amount limits, and post-signature reporting.
6. Separate explicit approval before enabling `LIVE_TRADING_ENABLED=true` in any environment.


## Live-beta enablement note — 2026-08-11

Controlled live-beta plumbing has been added behind explicit gates. See `docs/BONDR_LIVE_BETA_ENABLEMENT.md`. This does not mean live trading/deployment is active: env gates remain off by default, simulation is required, signing uses browser wallets only, and broadcast requires a separate explicit gate.
