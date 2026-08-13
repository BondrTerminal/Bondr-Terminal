# BONDR Beta Readiness Audit

Date: 2026-08-13
Production URL: https://solana-spl-market-maker.vercel.app
Current phase: Controlled A-profile signing rehearsal; broadcast/deployment gated

## Current assessment

BONDR is no longer just pre-live UI plumbing: production A-profile quote/build/simulation/browser-wallet signing has been user-verified. This is a major beta milestone.

Do not overclaim it. Broadcast remains disabled, deployment remains disabled, and no real swap/deploy settlement is live.

## Already proven

- Public BONDR/Bond.Terminal navigation structure: Hub, Project Dashboard, Deployment, Terminal, Wallets, Portfolio, GitHub, Token Analyzer, Liquidity, Profile.
- Project Dashboard combines the old Projects/Dashboard concepts and preserves Portfolio as the money/accounting page.
- Global `+ Create Project` entry point exists and routes through the shared guided wizard.
- Deployment shows launch path planning for Pump.fun, Raydium, Meteora, and Bonk, but remains config/readiness only.
- Wallet Ops has Saved Presets and production Postgres persistence.
- `/api/wallet-rail` is the canonical runtime wallet source.
- Portfolio has Rewards Tracker and disabled Claim Rewards UI.
- Terminal links reward estimates/accounting to Portfolio Rewards.
- Transaction Preview Layer contract exists at `apps/web/lib/transaction-preview.ts` and is documented in `docs/BONDR_TRANSACTION_PREVIEW_LAYER.md`.
- Production A-profile path: operator/auth login → browser wallet connect → wallet rail → quote → unsigned build → simulation → browser-wallet sign.

## Currently gated

- Transaction broadcasting.
- Real swaps/buys/sells.
- Token deployment and Pump.fun/Raydium/Meteora/Bonk live launch execution.
- Wallet funding, sends, imports/exports as live product actions.
- LP creation/locking/burning.
- Reward claims, payouts, fee routing, and accounting settlement.
- Server custody or server-side private-key signing.

## Still broken / not yet proven

- Deployment adapters do not yet provide approved unsigned deploy builders and live deploy simulations.
- Broadcast policy, intent matching, and post-broadcast signature handling are not live-proven.
- Pump.fun exact bonding-curve estimator is not connected; current calculator is placeholder math.
- Wallet selection updates UI/config planning; do not treat it as a fully live task assignment/execution engine.
- Rewards are placeholder estimates only and cannot be claimed.
- Local `pnpm web:check` may fail in `apps/web/app/api/projects/route.ts` unless another agent has fixed it; rerun before ship claims.
- Provider/RPC status must be based on current runtime checks. Remove old Helius quota-limit claims when QuickNode/current provider succeeds.

## Requirements before B-profile broadcast

### Wallet/signing

- Repeatable production A-profile sign-path QA on current deployment.
- Wallet balance/provider readiness from current runtime provider.
- Human-readable transaction preview UI wired to the shared `TransactionPreview` response contract before signing.
- Explicit user approval before signing.
- No server custody and no collection of sensitive credentials.
- Session-level disconnect and wallet context reset.
- Clear distinction between watch-only/project wallets and connected signer wallet.

### Swap/trading

- Quote provider health and fallback handling.
- Slippage preview.
- Priority fee preview.
- Route preview.
- Token/mint verification before quote or transaction build.
- Transaction simulation.
- Signed transaction intent hash/policy checks while broadcast remains off.
- Separate approval to enable signed transaction broadcast.
- Post-trade signature link and failure handling after broadcast is enabled.

## Requirements before C-profile deployment

- Token metadata validation.
- Image upload validation.
- Launch path validation.
- Dev wallet confirmation.
- Bundle wallet confirmation and duplicate-assignment checks.
- Quote token confirmation for SOL/USDC.
- Exact/clearly-labeled Pump.fun estimator state.
- Unsigned deployment transaction preview using the shared `TransactionPreview` response contract.
- Deployment simulation/preflight.
- Explicit final launch confirmation.
- Post-launch CA/mint capture and project update.
- Separate deploy/broadcast gate approval.

## Rewards requirements

- Rewards remain estimated until fee accounting exists.
- Claim button remains disabled.
- No payout rails yet.
- Legal/accounting review required before claims.
- Anti-abuse rules required before volume rewards can become real.

## Safety invariants

- No server custody execution.
- No hidden swaps.
- No fake balances, fake PnL, or unlabeled placeholder metrics.
- Browser-wallet signing only after simulation passes.
- No broadcast without explicit B-profile gate and confirmation.
- No deployment without explicit C-profile gate and confirmation.
- No reward claims/payouts until fee accounting and payout infrastructure are implemented and reviewed.
- No sensitive credential collection or movement through the web app.

## Verification status

Historical local verification from earlier audit pass:

- `pnpm web:check` — previously passed after Transaction Preview Layer patch.
- `pnpm web:build` — previously passed after Transaction Preview Layer patch.
- Runtime smoke previously confirmed gated execution behavior with broadcast disabled.

Current required verification before claiming readiness:

- Rerun `pnpm web:check` and confirm/fix the known `apps/web/app/api/projects/route.ts` TypeScript failure.
- Rerun `pnpm web:build`.
- Repeat production A-profile quote/build/sim/sign QA.
- Confirm `/api/wallet-rail` is the displayed runtime wallet source.
- Confirm broadcast and deployment remain disabled.
- Confirm provider readiness from current provider, including QuickNode if configured.
