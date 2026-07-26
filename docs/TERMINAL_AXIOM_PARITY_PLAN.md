# Terminal Axiom-Parity Wiring Plan

_Last updated: 2026-07-22_

## Goal
Build Meridian's trading terminal around real backend primitives instead of UI-only tab patches. Axiom itself does not appear to expose official public developer API docs; use public/user-facing Axiom docs and observable feature sets only as product references, then implement our own clean data stack using Solana RPC, Helius, Bitquery, DexScreener/GeckoTerminal, Jupiter, persistent local storage, and browser-wallet/Turnkey-style signing gates.

## Product surface to support

### Token context
- Pair/venue discovery: DexScreener primary, optional Bitquery earliest DEX trade for pool age.
- Chart/ohlcv: GeckoTerminal OHLCV.
- Live trade tape: GeckoTerminal/Birdeye when available, Helius parsed token transfers fallback.
- Market aggregates: buys/sells, volume, liquidity, mcap, price, pair age, pool route.

### Holders
- RPC token-account reader required.
- Output real token accounts: token account, owner, amount, pct of supply, rank.
- Full scan via `getParsedProgramAccounts` when RPC allows it.
- Fallback via `getTokenLargestAccounts + getParsedAccountInfo` owner resolution.

### Top traders
- Aggregate trade tape by wallet.
- Metrics: buys, sells, buy volume, sell volume, net flow, last tx, first seen, source.
- Helius fallback must still produce wallet rows even when price/volume is unavailable.

### Dev tokens / developer wallet reputation
- Dev/team wallets from project store + explicit query.
- Holdings: `getParsedTokenAccountsByOwner` per dev wallet.
- Sold classifier: Helius parsed token transfers out of dev/team wallets.
- Future: dev wallet previous token deployments/created mints via Helius/Bitquery when available.

### Fresh / snipers
- Requires wallet activity/funding history.
- Helius parsed address history preferred.
- RPC signature fallback can classify activity count/age but not funding source detail.
- Output wallet rows, not just summary: wallet, firstSeenAt, txCountSampled, funding source rows, trade count, fresh flag, reason.

### Bundles
- Helius parsed transaction rows: group by slot/time, fee payer, token-transfer wallets, transaction count, wallet count, token amount.
- Bitquery can improve same-block DEX trade analysis when configured.
- RPC fallback is signature/slot-only and must be labeled limited.

### Orders / execution
- Market quote: Jupiter quote route.
- Market build: Jupiter swap builder gated by `LIVE_TRADING_ENABLED` + browser-wallet signer.
- Limit/TP/SL: persistent local order store with evaluation route.
- Signed tx broadcast: separate route. Server never stores private keys.

### Signatures / signer model
- Browser wallet first for v0.
- Turnkey public config can be read client-side, but no server private-key custody.
- Server builds unsigned/base64 transactions only under live gates.
- Browser signs, then `/api/send-signed-transaction` broadcasts.

## Backend contract to build

### Unified token terminal snapshot
`GET /api/terminal-token-snapshot?mint=<mint>&project=<id>&holderLimit=100`

Should aggregate:
- health/capabilities
- pool index + Bitquery age status
- token stats + holder rows
- token transactions + top trader rows
- fresh/sniper wallet classifier rows
- bundle cluster rows
- dev sold/holdings rows
- wallet token balances
- terminal orders

This becomes the bottom-tab source of truth instead of each tab reimplementing fetch logic.

### Reader routes
- `/api/readers/token-accounts?mint=<mint>&limit=<n>`
- `/api/readers/trade-tape?mint=<mint>&limit=<n>`
- `/api/readers/wallet-history?wallet=<wallet>&limit=<n>`
- `/api/readers/pool-age?mint=<mint>`

### Router routes
- `/api/routers/jupiter/quote`
- `/api/routers/jupiter/build-swap`
- `/api/routers/bundle/preflight`
- `/api/routers/order/evaluate`

For now these can wrap existing routes, but the terminal should consume the normalized snapshot contract.

## Immediate implementation sequence
1. Add `lib/terminal-index-contract.ts` shared types/normalizers.
2. Add `/api/terminal-token-snapshot` aggregator route.
3. Move bottom tabs to consume snapshot first, old individual fetches only as fallbacks.
4. Add route smoke script that asserts real arrays exist for holders/topTraders/freshWallets/bundles/devWallets/orders.
5. Only then continue UI polish.

## Pump.fun public/unofficial API reference

Pulled Pump.fun endpoint catalog for migration/dev-token/trade fallback implementation:

- Reference: `docs/pumpfun-public-api-reference.md`
- Main source: https://github.com/BankkRoll/pumpfun-apis/blob/main/endpoints/INDEX.md
- Important caveat: Pump.fun does not appear to publish stable official public API docs; many endpoints are unofficial/reverse-engineered and require `PUMPFUN_JWT`.

Implemented read-only wrappers:

- `/api/pumpfun/token?mint=<mint>`
- `/api/pumpfun/trades?mint=<mint>`
- `/api/pumpfun/migrations`
- `/api/pumpfun/dev-tokens?creator=<id>`

## Solana RPC method reference

Pulled official Solana HTTP JSON-RPC method set for future terminal/indexer implementation:

- Prose reference: `docs/solana-free-rpc-methods.md`
- Machine-readable reference: `docs/solana-free-rpc-methods.json`
- Official source: https://solana.com/docs/rpc/http

Current docs list 52 HTTP methods, not 48. Most relevant groups for the terminal are holder readers, wallet/position readers, signature/trade indexing, execution lifecycle, and RPC health.
