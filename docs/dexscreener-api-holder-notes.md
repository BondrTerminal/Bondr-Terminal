# DexScreener API notes for holder analytics

_Last checked: 2026-07-22_

Official reference: https://docs.dexscreener.com/api/reference

## Finding

DexScreener's public API is useful for token/pool market context, but it does **not** expose a public token-holder list endpoint.

Available public surfaces include:

- token profiles / boosts / ads / community takeovers
- pair lookup: `/latest/dex/pairs/{chainId}/{pairId}`
- pair search: `/latest/dex/search`
- token pools: `/token-pairs/v1/{chainId}/{tokenAddress}`
- token/pair market fields: price, liquidity, FDV/market cap, volume, txns, pair age

## Holder terminal design

For Axiom/DexScreener-style holder presentation, use a composed holder snapshot:

- Holder wallets and token balances: Helius DAS/RPC/Pump.fun/RugCheck fallback stack
- Token value and market context: DexScreener price/liquidity/pair data
- Entry/exit/PnL: wallet trade tape from GeckoTerminal/Helius/Pump.fun when wallet rows match holder wallets
- Freshness/average hold time: Helius wallet history / signature ledger once configured

## Current Meridian implementation

- `/api/token-stats` holder source order:
  1. Helius DAS `getTokenAccounts` by mint when Helius key exists
  2. Solana RPC `getTokenLargestAccounts` + owner lookup
  3. Pump.fun top-holder endpoint
  4. RugCheck top holders
- `/api/token-pool-index` provides DexScreener price/liquidity/pool metadata.
- `/api/terminal-token-snapshot` enriches holder rows with:
  - `pctSupply`
  - `valueUsd`
  - `boughtTokens`
  - `soldTokens`
  - `avgEntryUsd`
  - `avgExitUsd`
  - `realizedPnlUsd`
  - `unrealizedPnlUsd`
  - `totalPnlUsd`
  - `pnlStatus`
  - `firstSeenAt`
  - `lastSeenAt`
  - `txCount`
  - `tags`
  - `dataSources`
- `TerminalInfoBooth` Holders tab renders a wide terminal holder table instead of the previous minimal owner/token-account/amount/rank table.

## Caveat

PnL is honest, not invented. If the wallet appears in the available trade tape, PnL is calculated as a trade-tape estimate. If not, the row stays balance/value-only and shows `need tape` / `trade-tape-needed` until Helius/history data is configured.
