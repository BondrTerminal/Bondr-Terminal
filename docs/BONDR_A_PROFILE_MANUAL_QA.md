# BONDR A-Profile Manual QA

_Last updated: 2026-08-11_

## What this page tests

`/live-beta-test` is a manual QA harness for BONDR A-profile signing readiness. It splits the Terminal path into separate, inspectable phases:

1. Load `/api/execution-capabilities`.
2. Check operator auth status.
3. Connect a Solana browser wallet.
4. Compare selected/project wallet with connected signer.
5. Request quote preview only.
6. Build unsigned transaction only.
7. Simulate unsigned transaction only.
8. Sign locally in browser wallet only after simulation passes.
9. Confirm broadcast remains disabled.

## What it does not do

The harness does **not**:

- Broadcast transactions.
- Deploy tokens.
- Fund wallets.
- Claim or pay rewards.
- Request private keys.
- Server-sign.
- Perform hidden swaps.
- Enable B/C-profile gates.

Any signed transaction is held client-side for inspection only while A-profile broadcast remains disabled.

## Expected A-profile gates

Production A-profile should report:

- `liveTradingEnabled=true`
- `signingEnabled=true`
- `broadcastEnabled=false`
- `deploymentEnabled=false`
- `readinessLevel=signing-ready`
- `requireSimulation=true`
- `allowedCluster=mainnet-beta`
- `maxSolPerSwap=0.01`
- `maxUsdcPerSwap=5`
- `maxSlippageBps=100`

## Manual test script

1. Open `/profile` and complete operator login if required.
2. Open `/live-beta-test`.
3. Confirm the Live Beta Status card says A-profile / signing-ready.
4. Connect a Solana browser wallet.
5. Select the same wallet address in the project-wallet dropdown, or verify mismatch copy shows both addresses.
6. Enter a test mint.
7. Click **Quote preview only**.
8. Click **Build unsigned tx only**.
9. Click **Simulate unsigned tx only**.
10. If simulation passes, click **Sign in wallet** and approve/reject the wallet prompt.
11. Confirm **Broadcast disabled in A-profile** remains disabled and no submit call is made.

## Expected provider-limited behavior

Helius/RPC may be quota-limited during build-out. If simulation fails because the provider is degraded, the UI should show:

> Provider-limited: simulation may fail until RPC plan is upgraded/reset.

This is expected until the RPC plan resets/upgrades. Do not enable broadcast to work around provider limits.

## Safety invariants

- Browser-wallet signing only.
- Simulation must pass before signing eligibility.
- Broadcast is a separate disabled gate.
- Deployment is a separate disabled gate.
- No server custody or private-key handling.
- No funding, reward claims, payouts, or hidden swaps.

## Copy QA Report

Use **Copy QA Report** after a manual pass or failure. The report is intentionally sanitized and includes:

- timestamp and `/live-beta-test` path
- capability gate values
- operator auth state
- selected wallet short address
- connected signer short address
- wallet match state
- mint, side, amount, spend asset, and slippage
- quote/build/simulation/signer summaries
- broadcast-disabled confirmation
- provider-limited warning when observed
- local QA event log

The copied report intentionally omits:

- private keys or seed phrases
- full unsigned transaction base64
- full signed transaction bytes
- cookies, session secrets, auth tokens, or headers

## Recommended bug-report format

When filing a manual QA issue, paste the copied report and add:

1. Browser + wallet extension used.
2. Whether operator login was active.
3. Exact step that failed.
4. Screenshot if the UI state is confusing.
5. Whether the failure looked like provider/RPC degradation or app logic.

Do not paste transaction bytes, private keys, seed phrases, cookies, or auth tokens.

## Reset QA Session

Use **Reset QA Session** between test attempts. It clears quote/build/simulation/signer state and the local QA event log. It does not disconnect the browser wallet; disconnect or switch accounts from the wallet extension when needed.

## Safe test inputs

Use the harness presets before custom values:

- **SOL → USDC micro buy**: uses the canonical mainnet USDC mint (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), `Buy`, `SOL`, and `0.001` SOL so the test stays under the A-profile SOL cap.
- **Token → SOL sell rehearsal**: use only when you supply a token mint and the connected wallet actually holds that token. Sell rehearsal may fail if the token balance is missing.
- **Custom**: use for manual route testing after the preset path works.

Avoid SOL→SOL routes. Wrapped SOL as the output mint while spending SOL is not useful for QA and can create no-op or confusing quote behavior. The harness warns with:

> SOL-to-SOL route is not useful for QA. Use USDC mint or another token mint.

Stay under A-profile caps:

- max SOL per swap: `0.01`
- max USDC per swap: `5`
- max slippage: `100 bps`

The preflight card blocks quote/build when mint, amount, slippage, or profile caps are invalid. Build additionally requires operator auth, a connected browser wallet, and wallet match.

## Foundation state summary

Before running the manual QA cockpit, check the Foundation Status and Wallet Rail panels:

1. Foundation Status should show wallet identity via `/api/wallet-rail`.
2. Wallet Rail should show connected signer, selected wallet, Wallet Ops inventory, SOL balance status, token balance status, auth, and wallet mode.
3. If provider-limited, do not treat missing balances as empty balances.
4. If signer is not in Wallet Ops, add it as watch-only before match testing.
5. Terminal should only be used after the Live Beta Test harness confirms the A-profile signing path.
