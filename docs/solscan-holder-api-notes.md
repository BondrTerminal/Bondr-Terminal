# Solscan holder API notes

_Last checked: 2026-07-22_

Official Solscan Pro reference: https://pro-api.solscan.io/pro-api-docs/v2.0/reference/v2-token-holders

## Holder endpoint

`GET https://pro-api.solscan.io/v2.0/token/holders`

Required query params:

- `address` — token mint address

Optional query params:

- `page` — page number
- `page_size` — 10, 20, 30, or 40
- `from_amount` / `to_amount` — token amount filters
- `from_value` / `to_value` — USD value filters

Auth:

- Requires Solscan Pro API key.
- Meridian reads `SOLSCAN_API_KEY` or `SOLSCAN_PRO_API_KEY` and sends it in the `token` header.

Useful response fields:

- `total` — total holder count
- `items[].address` — token account
- `items[].owner` — holder wallet
- `items[].amount` / `amount_str`
- `items[].decimals`
- `items[].rank`
- `items[].value` — USD value
- `items[].percentage` — supply percent

## Meridian holder source order

`/api/token-stats` now attempts holder rows in this order:

1. Solscan Pro token holders (`SOLSCAN_API_KEY` / `SOLSCAN_PRO_API_KEY`)
2. Helius DAS `getTokenAccounts`
3. Solana RPC `getTokenLargestAccounts` + owner lookup
4. Pump.fun top holders
5. RugCheck top holders

DexScreener is not a holder API; it supplies pool/price/liquidity context used to value holder rows.
