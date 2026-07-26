# Meridian market-data providers

Meridian stays read-only unless `LIVE_TRADING_ENABLED=true` is explicitly approved. These providers only improve market data, trade tape, holders, history, and confidence. Do not put real secrets in docs or commits.

## Environment variables

```env
# Parsed Solana transaction history + holder/history support
HELIUS_API_KEY=
HELIUS_RPC_URL=

# Preferred wallet-attributed token trade tape and price/history enrichment
BIRDEYE_API_KEY=

# Optional deep pool-age / same-block / clustering research
BITQUERY_API_KEY=

# Optional stable active-token test fixture. If unset, /api/market-data/probe-token searches DexScreener read-only.
RECOMMENDED_PROBE_MINT=
```

## What each provider unlocks

| Provider | Powers | Missing impact | Blocking? |
| --- | --- | --- | --- |
| DexScreener | pool discovery, price, liquidity, volume, venue context, active-token probe candidates | trade tape can still be empty because DexScreener is not wallet-attributed transaction history | Not blocking |
| Jupiter | quote/route checks and route labels | quote preview degrades | Not blocking while live disabled |
| Birdeye | preferred token trade tape, wallet-attributed token history, richer PnL confidence | trade tape degraded, wallet history degraded, PnL confidence reduced | Confidence-reducing |
| Helius | parsed transactions, token transfers, holders/RPC enrichment, wallet history fallback | trade tape fallback degraded, holders/history/PnL confidence reduced | Confidence-reducing; private RPC is required before live |
| Pump.fun | bonding/pump-token trade feed | only useful for pump/bonding tokens; 404 usually means not a pump token | Not blocking |
| GeckoTerminal | best-effort pool trades | may rate-limit; no longer blocks terminal loading | Not blocking |
| Bitquery | pool age, deeper historical DEX/same-block analysis | pool age/clustering confidence reduced | Optional |

## Testing guidance

Do not use USDC as the main memecoin tape test. USDC is liquid but not representative of pump/memecoin wallet-tape behavior. Use:

1. `/api/market-data/probe-token` to get a currently active Solana pool candidate.
2. `/api/token-transactions?mint=<recommendedProbeMint>&limit=40` to inspect `tradeTape`.
3. `/api/terminal/snapshot?mint=<recommendedProbeMint>` to confirm the terminal remains usable even if trade rows are empty.

Expected safe behavior:

- Empty trade tape must not break market feed, price, liquidity, holders, positions, or provider readiness.
- Missing Helius/Birdeye should be marked as confidence-reducing, not a fatal app failure.
- GeckoTerminal 429 should become `rate-limited`, not a hard snapshot failure.
- Pump.fun 404 should be treated as `not-pump-token`, not a scary outage.
