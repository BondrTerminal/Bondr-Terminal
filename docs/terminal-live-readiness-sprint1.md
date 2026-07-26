# Meridian Terminal Live-Readiness Sprint 1

_Last checked: 2026-07-26_

## Objective

Graduate the Meridian terminal from prototype-only scanning toward a live-read terminal that can observe real token activity, surface risk, preview paper decisions, and keep live execution disabled.

## Production reference

- Canonical URL: https://solana-spl-market-maker.vercel.app/sniper?mint=ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82
- Smoke mint: `ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82`
- Production smoke: page HTTP 200, API HTTP 200, no Vercel auth block.

## Successful live terminal criteria

| Area | Requirement | Sprint 1 status | Evidence |
| --- | --- | --- | --- |
| Live data truth | Token identity, market, supply, holder rows | PASS | `/api/terminal/snapshot?...&profile=live-read` returns status `ok`, 20 holder rows. |
| Trade tape | Nonzero recent buy/sell rows | PASS | 300 trade rows from `geckoterminal` on smoke mint. |
| Holder/wallet attribution | Holder SOL/token/% supply/value, lifecycle where possible | PARTIAL | Holder rows are present; lifecycle/PNL still depends on Helius/Birdeye/wallet-attributed tape. |
| Provider clarity | Provider/source/status/gap labels visible | PASS | Snapshot includes tradeTape blockers/gaps, holder source, profile, readiness checklist. |
| UX truthfulness | Prototype/live-read/skipped/parser-pending labels | PASS | UI now requests `profile=live-read`; prototype remains available via query for safe scans. |
| Risk scanner | One clear risk verdict | PASS/PARTIAL | `riskVerdict.status` returns `SAFE_TO_WATCH/HIGH_RISK/DO_NOT_TRADE`; deeper bundle/dev-sold remains provider/parser dependent. |
| Paper trading | Quote-only decision panel | PASS | Paper tab uses `/api/execution-quote`; returns Jupiter quote only, no build/sign/send. |
| Execution gates | Live trading disabled | PASS | `liveTradingEnabled: false`, execution `quote-only` / `paper-only-no-sign-no-send`. |
| Reliability | Build/check/smoke | PASS | `pnpm web:check`, `pnpm web:build`, local and production smoke passed. |

## What Sprint 1 implemented

- Added `profile=live-read` terminal snapshot mode with bounded but real trade/market/risk reads.
- Kept `profile=prototype` for fast safe scans that intentionally skip heavy provider calls.
- Added snapshot-level `liveReadiness` checklist.
- Added snapshot-level `riskVerdict` with `SAFE_TO_WATCH`, `HIGH_RISK`, or `DO_NOT_TRADE`.
- Added snapshot-level `paperTradeDecision` contract.
- Updated terminal UI to request `profile=live-read` by default for real live-read testing.
- Added a Paper tab with quote-only preview through `/api/execution-quote`.
- Updated Risk tab to show verdict, reasons, and checklist evidence.
- Kept all live signing/trading disabled.

## Production smoke result

```json
{
  "page": { "http": 200, "meridian": true, "authBlocked": false },
  "snapshot": { "http": 200, "status": "ok", "profile": "live-read", "holders": 20, "trades": 300, "risk": "SAFE_TO_WATCH", "ready": "partial", "paper": "quote-required" },
  "quote": { "http": 200, "status": "ok", "execution": "quote-only", "liveTradingEnabled": false, "routePlanLength": 1 }
}
```

## Still blocking live trading

1. Wallet-attributed trade tape is not high-confidence enough yet.
   - Current nonzero tape works through GeckoTerminal.
   - Need Birdeye/Helius/Solscan enrichment for stronger wallet attribution, entry/exit, and PnL.
2. Provider credentials/readiness must be verified in Vercel.
   - Helius/private RPC, Birdeye, Solscan are the next high-value keys.
3. Risk verdict needs deeper parser-backed checks.
   - Bundle clustering, fresh-wallet classification, dev-sold, insider graph, and LP lock/burn need live-read provider coverage.
4. Paper trading needs durable paper position logs.
   - Quote preview works, but position logging/accounting is not yet a durable paper-trading ledger.
5. Execution gates are intentionally disabled.
   - Real live trading requires signer dry-run, transaction simulation, authenticated durable intent storage, human confirmation, per-trade/daily limits, and kill switch.

## Next exact sprint

**Sprint 2 — Wallet-attributed live tape + paper ledger**

1. Add a provider-prioritized trade tape adapter contract: Birdeye → Helius → Solscan → GeckoTerminal fallback.
2. Normalize wallet-attributed trade rows into one shape with source confidence.
3. Add source confidence to holder PnL: `trade-tape-priced`, `transfer-only`, `balance-only`, `provider-limited`.
4. Add paper position ledger: quote → paper entry → paper exit → PnL history.
5. Add provider env audit route for Vercel that reports configured/missing without exposing secrets.
6. Keep live execution disabled.
