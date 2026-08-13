# BONDR Live Beta Status

_Last updated: 2026-08-13_

## Current profile: A-profile signing rehearsal proven

Production has been user-verified through the A-profile quote/build/simulation/browser-wallet-sign path. This proves the safe signing rehearsal works, not that live trading is enabled.

Current intended gate state:

- `LIVE_TRADING_ENABLED=true`
- `LIVE_BETA_SIGNING_ENABLED=true`
- `LIVE_BETA_BROADCAST_ENABLED=false`
- `LIVE_DEPLOYMENT_ENABLED=false`
- `LIVE_REQUIRE_SIMULATION=true`
- `LIVE_ALLOWED_CLUSTER=mainnet-beta`
- `LIVE_MAX_SOL_PER_SWAP=0.01`
- `LIVE_MAX_USDC_PER_SWAP=5`
- `LIVE_MAX_SLIPPAGE_BPS=100`

## Already proven

Production A-profile path:

1. Operator/auth login.
2. Browser wallet connection.
3. Runtime wallet source from `/api/wallet-rail`.
4. Quote preview.
5. Unsigned transaction build.
6. Required simulation.
7. Browser-wallet signing after simulation passes.
8. Signed transaction remains client-side because broadcast is disabled.

Wallet Ops persistence is now Postgres-backed in production. Wallet Ops records are still public-address inventory/matching records; they are not server custody or signers.

## Currently gated

These are intentionally blocked until separate approval and profile activation:

- Transaction broadcast.
- Token deployment.
- Wallet funding.
- Reward claims or payouts.
- Server-side custody.
- Server-side private-key signing.
- Hidden swaps or real swaps without explicit broadcast gate activation.

## Still broken / not yet proven

- Deployment adapters remain readiness/config surfaces only; no live deploy builder/broadcast path is active.
- Broadcast policy, intent checks, and post-broadcast handling are not proven live.
- Local TypeScript check may currently fail in `apps/web/app/api/projects/route.ts` unless separately fixed; verify before shipping.
- Provider health must be checked from current runtime evidence. Do not carry forward stale Helius quota-limit claims if QuickNode or another configured provider is succeeding.

## Runtime source of truth

`/api/wallet-rail` is the canonical runtime wallet source for connected signer, selected/project wallet, inventory match, wallet mode, auth state, and runtime balance status. Older Wallet Ops/portfolio routes may support inventory/reporting, but must not override wallet-rail execution truth.

## User-facing status component

The reusable Live Beta Status panel should appear on Hub, Terminal, Liquidity, Deployment, Wallet Ops/Profile surfaces and show:

- Live trading gate enabled for A-profile rehearsal.
- Browser-wallet signing enabled.
- Simulation required enabled.
- Broadcast disabled.
- Deployment disabled.
- Funding/payouts disabled.
- Cluster `mainnet-beta`.
- Swap caps and slippage caps.
- Provider status from current provider readiness/runtime checks.
- Operator auth status.

## Deployment adapter status

Deployment remains config-only in A-profile. Launch adapters are honest readiness surfaces only:

- Pump.fun: adapter pending / unsigned builder required.
- Raydium: adapter pending / unsigned builder required.
- Meteora: adapter pending / unsigned builder required.
- Bonk: adapter pending / unsigned builder required.

Broadcast/deploy unlock requires future B/C-profile approval.

## Next unlock criteria

Before considering B-profile broadcast:

1. Product/UI pass complete.
2. Operator auth friction resolved.
3. Production A-profile signing flow remains repeatable on current deployment.
4. Current provider readiness proves reliable quote/build/simulation; QuickNode success supersedes old provider-limit notes.
5. Intent matching, policy checks, and signed-transaction handling are manually tested while broadcast remains off.
6. Broadcast policy reviewed separately.
7. Broadcast env gate explicitly enabled only after approval.

Before considering C-profile deployment:

1. Unsigned deployment builders exist per launch adapter.
2. Deployment simulations/preflights pass.
3. Funding model is explicit and approved.
4. No private keys or server custody are introduced.
5. Broadcast/deploy action has separate user confirmation.
