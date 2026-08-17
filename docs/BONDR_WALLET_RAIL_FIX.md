# BONDR Wallet Rail Fix

_Last updated: 2026-08-13_

## Current state

The wallet rail fix is in production and the A-profile quote/build/simulation/browser-wallet-sign path has been user-verified. Broadcast remains disabled, so this is a signing rehearsal path, not live trading.

Wallet Ops persistence is now Postgres-backed in production. That improves durability, but it does not change the signing model: Wallet Ops records are public-address inventory/matching records unless the connected browser signer matches the selected wallet.

## Diagnosis

BONDR had three overlapping wallet rails:

1. **Browser signer rail** — client-only `window.solana` connection used by Terminal and Deployment for A-profile signing.
2. **Wallet Ops inventory rail** — stored public wallet records, either `watch-only` or `managed-local`, used for project wallet assignment and UI selection.
3. **Vault rail** — encrypted managed-local wallet setup/readiness. The vault can exist, but A-profile does not use server custody or vault signing.

The confusing state came from treating vault/inventory readiness as if it were the same thing as A-profile browser-wallet signing readiness.

Canonical rule:

> In A-profile, the only executable signer is the connected browser wallet. Wallet Ops records are selectable execution targets, but they are signable only when the browser signer address matches the selected wallet. Vault availability is setup state, not signing capability.

## Canonical wallet rail contract

`/api/wallet-rail` is the canonical runtime wallet source. It returns a read-only view of:

- connected browser signer
- selected/project wallet
- Wallet Ops inventory match
- selected-wallet inventory match
- wallet mode (`browser-wallet`, `watch-only`, or `not-connected`)
- auth state
- connected signer SOL balance
- selected wallet SOL balance
- active mint token balance when supplied
- balance status/source/note
- warnings/blockers

This rail never signs, broadcasts, funds, deploys, claims, or requests private keys.

## Pages consuming the rail

The reusable `WalletRailStatus` component is mounted on:

- Profile
- Wallet Ops
- Terminal `/sniper`
- Portfolio
- Deployment

The old manual signing harness has been retired; current verification happens through the real Profile, Terminal, and Deployment surfaces.

## Proven vs gated

Already proven in production:

- Operator/auth login.
- Browser wallet connection.
- Wallet-rail runtime source.
- Quote preview.
- Unsigned transaction build.
- Required simulation.
- Browser-wallet signing after simulation passes.

Still gated:

- Broadcast.
- Real swap settlement.
- Token deployment.
- Wallet funding.
- Reward claims/payouts.
- Server-side custody/signing.

Still needs verification before next unlock:

- Repeat production sign-path QA on current deployment.
- Current provider readiness; do not rely on stale Helius quota-limit claims if QuickNode succeeds.
- Intent matching and policy checks for signed transactions while broadcast remains off.
- Local TypeScript check status, especially `apps/web/app/api/projects/route.ts` unless already fixed.

## Browser-wallet mode vs vault custody

A-profile uses browser-wallet signing. The platform should not say the product is unusable simply because vault custody is unavailable.

Preferred copy:

- `Browser wallet connected`
- `Connected signer is not in Wallet Ops`
- `Vault custody unavailable, but A-profile uses browser-wallet signing.`
- `Wallet mismatch: selected wallet and connected signer differ.`
- `Balance provider-limited.`

Avoid vague copy like `wallet setup needed` when the real issue is vault/inventory configuration rather than A-profile signer availability.

## Balance refresh behavior

- Manual `Refresh balances` button.
- No RPC spam loop.
- Connected signer and selected wallet balances are read through `/api/wallet-rail`.
- If the active provider is quota-limited/degraded, the rail reports `provider-limited` rather than inventing balances.
- If QuickNode/current provider checks succeed, docs and UI should not continue claiming a Helius quota blocker.

## Safety invariants

- No private keys requested by the rail.
- No server signing.
- No broadcast.
- No deployment execution.
- No wallet funding.
- No reward claims or payouts.
- No auto-import of browser signer into Wallet Ops.
- Browser-wallet signing remains simulation-gated.

## Manual end-to-end test script

1. Open `/profile`.
2. Connect browser wallet in the wallet rail.
3. If rail says connected signer is not in Wallet Ops, click **Add connected signer as watch-only wallet**.
4. Refresh balances.
5. Confirm connected signer, selected wallet, Wallet Ops inventory, and SOL balance/provider status are visible.
6. Open `/sniper` or `/deployment?project=<projectId>`.
7. Select/match the connected signer wallet.
8. Run preflight, quote/build, simulate, then sign locally only after simulation passes.
9. Confirm the signed transaction is not broadcast while the live broadcast gate is closed.
10. Confirm exact block reasons are visible before any build/sign/broadcast step.

## Watch-only connected signer add flow

When a browser wallet is connected but not present in Wallet Ops, `WalletRailStatus` shows **Add connected signer as watch-only wallet**.

This flow uses the existing `/api/wallets` public-address import path and stores only:

- public address
- role label
- Wallet Ops group
- purpose/status metadata

It does **not**:

- request private keys
- create a managed-local vault wallet
- sign transactions
- broadcast transactions
- fund wallets
- deploy tokens
- auto-import without a user click

Watch-only adds the public address for matching and balance display. Browser wallet still signs.

## FoundationStatusPanel

The foundation pass added `FoundationStatusPanel` to core data/execution pages. It summarizes:

- wallet identity: canonical `/api/wallet-rail`
- SOL balance status
- token balance status
- auth state
- execution capability
- A-profile signing path
- broadcast disabled
- deployment disabled

This panel is intentionally not a wallet connector. It explains the platform-wide truth layer so users understand which rail is authoritative before using `WalletRailStatus` or Terminal.
