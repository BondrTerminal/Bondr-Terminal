# Token, RPC, and API Options

_Last checked: 2026-07-05_

This file fills in public reference choices. It does **not** select a live trading target.

## Common mints

### Wrapped SOL / native SOL quote mint

```text
So11111111111111111111111111111111111111112
```

Use this when quoting token prices in SOL through Jupiter or other Solana tooling.

### Mainnet USDC mint

```text
EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Jupiter docs use this as the SOL/USDC example output mint.

## RPC configuration

Solana public RPC endpoints are useful for light read-only checks, but not for serious market making. The local bot and web API should prefer Helius when credentials are configured.

Preferred environment variables:

```bash
# Use either the full URL or just the API key. Keep these server-side/local only.
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=REPLACE_ME
# HELIUS_API_KEY=REPLACE_ME

# Public fallback only; not reliable enough for serious market making.
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

Runtime precedence:

1. `HELIUS_RPC_URL`
2. `HELIUS_API_KEY`
3. custom `SOLANA_RPC_URL`
4. public Solana RPC fallback

Notes:

- Public RPC can rate-limit quickly.
- Public RPC is not reliable enough for live quoting/execution.
- Use `confirmed` for fresher bot observation.
- Use `finalized` when stronger settlement certainty matters more than freshness.
- Never expose Helius credentials through `NEXT_PUBLIC_*` browser variables.

## Enhanced RPC providers to compare later

Candidates:

- Helius — current preferred provider once configured
- QuickNode
- Triton
- Alchemy Solana
- Ankr / Syndica / Chainstack style providers

Selection criteria:

| Requirement | Why it matters |
|---|---|
| Low-latency HTTP | Fast quote/balance/order queries |
| Reliable WebSocket | Orderbook/account subscription stability |
| High request limits | Avoid observation gaps/rate limiting |
| Historical tx support | PnL/accounting/debugging |
| Priority fee / send support | Transaction landing under congestion |
| Mainnet SLAs | Less downtime during volatile markets |

## Jupiter API

Current read-only quote endpoint in our code:

```text
https://api.jup.ag/swap/v1/quote
```

Environment knobs:

```bash
JUPITER_QUOTE_URL=https://api.jup.ag/swap/v1/quote
JUPITER_API_KEY=
```

Notes:

- `JUPITER_API_KEY` is optional in config but may be required depending on rate limits / portal plan.
- Never commit a real key.
- Swap v2 exists and should be evaluated later for execution/build flows.
- For v0, quote-only read path is enough.

## Suggested first dry-run local config target

For pure read-only observation, a conservative first target is:

```text
tokenMint = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v  # USDC
quoteMint = So11111111111111111111111111111111111111112   # SOL
```

Why:

- Highly liquid.
- Easy to sanity-check quotes.
- Lower chaos than a new memecoin.

This does **not** mean live trading USDC/SOL. It is only a safe observation target.

## What remains unchosen

- Actual token to support/market-make.
- Actual wallet public keys.
- RPC provider.
- Jupiter API key/plan.
- Orderbook venue: Phoenix vs OpenBook first.
- Risk limits for live capital.
