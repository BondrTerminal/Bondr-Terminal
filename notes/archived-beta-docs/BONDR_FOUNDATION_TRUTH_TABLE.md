# BONDR Foundation Truth Table

_Last updated: 2026-08-13_

## Foundation diagnosis

Foundation state: **A-profile signing rehearsal proven; broadcast/deployment still gated**.

Production has been user-verified through quote → unsigned build → simulation → browser-wallet sign. That proves the A-profile local signing rehearsal and wallet rail are viable. It does **not** prove live broadcast, real swap settlement, token deployment, rewards payout, or server custody.

The canonical wallet identity path is `/api/wallet-rail` + `WalletRailStatus`. Wallet Ops persistence is now Postgres-backed in production, but Wallet Ops records remain public-address inventory/matching records unless matched to the connected browser signer. Portfolio and market routes remain reporting/read rails.

Top current truths:

1. `/api/wallet-rail` is the canonical runtime wallet source.
2. Browser signer state is client-only; server pages must render honest “connect wallet/checking” state before hydration.
3. Wallet Ops inventory records are not signers; they become executable only when the selected wallet matches the connected browser signer.
4. Production Wallet Ops persistence is Postgres-backed, not ephemeral local-only storage.
5. Broadcast and deployment remain disabled by policy/env gates.
6. Provider status must come from current runtime checks; remove stale Helius quota-limit assumptions when QuickNode or another provider is succeeding.

Canonical sources by category:

| Category | Canonical source | Notes |
| --- | --- | --- |
| runtime wallet identity | `/api/wallet-rail` | connected signer, selected wallet, inventory match, wallet mode |
| wallet inventory | `/api/wallets` | Postgres-backed in production; public records only; watch-only is not signing custody |
| SOL balance | `/api/wallet-rail` for runtime wallet; `/api/wallet-balances` for inventory table | source must show live/modelled/provider-limited |
| token balance | `/api/wallet-rail?mint=` for active runtime wallet; `/api/wallet-token-balances` for Terminal inventory table | provider-limited is not zero |
| auth | `/api/execution-capabilities`, `/api/wallet-rail` authState | operator session required where configured |
| execution capability | `/api/execution-capabilities` | A-profile signing true, broadcast/deploy false |
| portfolio holdings | `/api/portfolio` | reporting rail, not signer readiness |
| terminal market data | `/api/terminal/snapshot` and market routes | market/read rail, not wallet signer truth |

## Page truth table

| Page | Needs | Current source(s) | Data class | Uses wallet rail | A-profile status | Blockers / caveats |
| --- | --- | --- | --- | --- | --- | --- |
| `/profile` | auth, browser signer, wallet rail, test entry | `LiveBetaStatus`, `WalletRailStatus`, `TurnkeyProfileLogin` | live/provider/status | yes | proven entry surface | wallet extension/auth/provider state |
| `/wallets` | inventory, balances, readiness, wallet rail | `/api/wallets`, `hydrateWalletBalances`, `WalletRailStatus` | Postgres inventory + live/modelled balances | yes | inventory/match prep | watch-only is not custody; modeled fallback must be labeled |
| `/live-beta-test` | capabilities, signer, selected wallet, preflight, quote/build/sim/sign | `/api/execution-capabilities`, `/api/wallets`, `/api/wallet-rail`, quote/swap/sim routes | live/client local | yes | production user-verified through sign | broadcast disabled; repeatability/provider health still required |
| `/sniper` | terminal market data, wallet routing, token balances, signing ladder | server props, `/api/wallet-token-balances`, `WalletRailStatus`, execution routes | mixed live/modelled/market | yes | should follow same A-profile ladder | mismatch, simulation, provider state, no broadcast |
| `/portfolio` | reporting holdings, PnL, rewards, wallet status | `/api/portfolio`, store snapshots, `WalletRailStatus` | reporting/snapshot + rail | yes | no direct signing | provider-limited vs reporting clarity; not payout truth |
| `/deployment` | project wallet assignment, deployment readiness, adapter status | project context, `WalletRailStatus`, deployment components | config/reporting + rail | yes | readiness only | deployment disabled by gate |
| `/projects` | project list/context | project APIs / Postgres-backed app storage where configured | store/config | no direct rail needed | none | local TypeScript check may fail in `apps/web/app/api/projects/route.ts` unless fixed |
| `/liquidity` | liquidity engine status, execution gates | liquidity probes, live beta status | research/reporting | no direct rail currently | no signing | future AMM/DLMM path |

## API truth table

| API | Purpose | Data class | Canonical for | Notes/blockers |
| --- | --- | --- | --- | --- |
| `/api/wallet-rail` | runtime wallet identity/balance rail | live/provider-limited/not-connected | connected signer, selected wallet, wallet mode, runtime balances | canonical runtime wallet source; read-only; no signing/broadcast |
| `/api/wallets` | Wallet Ops inventory CRUD | Postgres-backed inventory + hydrated consumers | wallet inventory | watch-only public records are not custody |
| `/api/wallet-balances` | hydrate stored inventory SOL balances | live or modeled fallback | inventory balance table | modeled must be labeled |
| `/api/wallet-token-balances` | inventory token balances for mint | live/provider-limited | Terminal inventory token rows | not browser signer canonical unless address is in inventory |
| `/api/wallet-live-readiness` | vault/managed-local readiness | setup/readiness | vault/inventory setup only | not A-profile signing capability |
| `/api/execution-capabilities` | live gate contract | gate/auth/provider | A-profile execution gates | signing true, broadcast/deploy false |
| `/api/execution-quote` | quote preview | route/provider | quote phase | proven in production A-profile path; still provider-dependent |
| `/api/execution-swap` | build unsigned transaction | unsigned build | build phase | no server signing; broadcast off |
| `/api/terminal/signer-dry-run` | simulate unsigned/signed tx | simulation | simulation phase | must pass before local signing |
| `/api/send-signed-transaction` | guarded broadcast | execution gate | future B-profile broadcast only | remains gate-protected; not live |
| `/api/portfolio` | portfolio reporting | reporting/snapshot | holdings/PnL view | not signer readiness or payout truth |
| `/api/terminal/snapshot` | terminal market snapshot | market/read | market data | not wallet identity |

## A-profile signing path

1. Profile: connect browser wallet and operator auth.
2. Wallet rail: confirm connected signer, selected wallet, Wallet Ops inventory, SOL/token balance status.
3. If signer is not in Wallet Ops: add connected signer as watch-only wallet by explicit click.
4. Live Beta Test: preflight mint/amount/slippage/auth/wallet match.
5. Quote preview: `/api/execution-quote`.
6. Build unsigned transaction: `/api/execution-swap`.
7. Simulate unsigned transaction: `/api/terminal/signer-dry-run`.
8. Sign locally in browser wallet only after simulation passes.
9. Broadcast remains disabled in A-profile.

## Data honesty rules

- Provider-limited does **not** mean empty, but stale provider-limit notes must be removed when current runtime provider checks succeed.
- Modeled Meridian/store balance is not live wallet balance.
- Watch-only inventory address is not a signer.
- Vault readiness is not A-profile signing capability.
- Portfolio/reporting data is not execution readiness or payout truth.
- Broadcast disabled in A-profile is intentional.
- Deployment disabled is intentional.

## Next unlock criteria before B-profile broadcast

1. Production A-profile sign path remains repeatable on current deployment.
2. Current provider readiness is healthy for quote/build/simulation; QuickNode success supersedes old Helius-limit blocker language.
3. Signed transaction intent matching and policy checks are manually tested with real browser-wallet signatures while broadcast remains off.
4. Terminal proves quote → unsigned build → simulation → local sign on a matched watch-only/browser signer wallet.
5. Portfolio/PnL keeps modeled/provider-limited labels visible and is not used as payout truth.
6. No route silently falls back to public RPC for broadcast.
7. Broadcast gate receives separate approval.

## Next unlock criteria before deployment activation

1. Pump.fun, Raydium, Meteora, and Bonk need unsigned deployment builders.
2. Deployment preflights/simulations must exist and pass before signing.
3. Funding model must be explicit and approved.
4. Deployment must stay separate from wallet-balance readiness.
5. Broadcast/deploy require separate B/C-profile approval.
