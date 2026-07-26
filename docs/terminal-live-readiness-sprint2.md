# Meridian Terminal Live-Readiness Sprint 2

_Last checked: 2026-07-26_

## Objective

Build provider-prioritized wallet-attributed trade tape, normalize trade confidence, add a paper-only ledger, and expose sanitized provider env audit without enabling live execution.

## Production reference

- URL: https://solana-spl-market-maker.vercel.app/sniper?mint=ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82
- Smoke mint: `ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82`

## Implemented

### Provider-prioritized trade tape

Priority order:

1. Birdeye
2. Helius
3. Solscan provider slot when usable/configured
4. Pump.fun for pump/bonding tokens
5. GeckoTerminal fallback

Every returned trade row now includes:

- `wallet`
- `side`
- `amount`
- `priceUsd`
- `volumeUsd`
- `timestamp`
- `txHash`
- `provider`
- `confidence`: `high | medium | low`
- `attributionStatus`: `wallet-attributed | transfer-inferred | pool-sender-only | unattributed`

GeckoTerminal fallback currently gives `confidence: medium` and `attributionStatus: pool-sender-only` because it identifies transaction sender, not necessarily final economic owner.

### Last-good tape fallback

If providers are missing/rate-limited and a previous successful tape exists, the terminal can use a stale-labeled last-good tape instead of collapsing to zero rows.

### Holder PnL labels

Holder PnL labels upgraded to:

- `trade-tape-priced`
- `transfer-only`
- `balance-only`
- `provider-limited`

### Paper ledger

Added `/api/paper-ledger`:

- `GET` lists paper entries and summary.
- `POST action=entry` records quote → paper entry.
- `POST action=exit` records paper exit and realized PnL.
- Execution is always `paper-only-no-sign-no-send`.
- `liveTradingEnabled: false`.

Important: production serverless uses `/tmp` for safety, so this is usable for smoke/paper workflow but not the final durable production DB. Real durable paper/live accounting still needs DB-backed storage.

### Provider env audit

Added `/api/terminal/provider-env-audit`:

- Reports only sanitized statuses:
  - `configured`
  - `missing`
  - `degraded`
  - `rate-limited`
  - `provider-ready`
- Does not expose secrets.
- Included in terminal snapshot and Risk panel.

## Production smoke result

```json
{
  "page": { "http": 200, "meridian": true, "authBlocked": false },
  "tradeTape": {
    "http": 200,
    "status": "ok",
    "rows": 300,
    "primary": "geckoterminal",
    "first": {
      "provider": "geckoterminal",
      "confidence": "medium",
      "attributionStatus": "pool-sender-only"
    }
  },
  "providerEnvAudit": {
    "status": "ok",
    "secretsExposed": false,
    "statuses": {
      "solanaRpc": "missing",
      "helius": "missing",
      "birdeye": "missing",
      "solscan": "missing",
      "jupiter": "configured",
      "geckoterminal": "configured"
    }
  },
  "paperLedger": {
    "quote": "ok",
    "entry": "ok",
    "entries": 1,
    "open": 1,
    "execution": "paper-only-no-sign-no-send",
    "liveTradingEnabled": false
  },
  "snapshot": {
    "http": 200,
    "status": "ok",
    "profile": "live-read",
    "holders": 20,
    "trades": 300,
    "primary": "geckoterminal",
    "tapeStatus": "ok",
    "risk": "SAFE_TO_WATCH",
    "ready": "partial",
    "paperEntries": 1,
    "envAudit": "ok"
  }
}
```

## Checklist

| Requirement | Status | Notes |
| --- | --- | --- |
| Birdeye-first provider slot | PASS | Implemented; currently missing key in production. |
| Helius second provider slot | PASS | Implemented; currently missing key in production. |
| Solscan third slot if usable | PASS/PARTIAL | Slot exists; endpoint remains provider-pending to avoid guessing paid API shape. |
| GeckoTerminal fallback | PASS | Returns 300 rows on smoke mint. |
| Normalized confidence fields | PASS | `provider`, `confidence`, `attributionStatus` included. |
| Holder PnL labels upgraded | PASS | New labels installed. |
| Durable paper ledger route | PASS/PARTIAL | Local JSON durable in local dev; Vercel is `/tmp` only until DB adapter. |
| Paper entry/exit API | PASS | Quote → entry, exit → PnL implemented. |
| Provider env audit | PASS | Sanitized, no secrets. |
| Live execution disabled | PASS | No signing/build/broadcast. |

## Still blocks live trading

1. Production provider keys are missing for the high-confidence tape stack:
   - private Solana RPC / Helius
   - Birdeye
   - Solscan
2. Current production tape is GeckoTerminal fallback, so wallet attribution is `pool-sender-only`, not high-confidence wallet owner attribution.
3. Paper ledger is not production-durable yet because no DB adapter is implemented.
4. Solscan trade endpoint must be verified against the real key/docs before using it.
5. Execution gates are still intentionally disabled: no real signing, transaction build, broadcast, durable live intent DB, auth policy, loss limits, or kill switch.

## Next exact sprint

**Sprint 3 — Provider credentials + high-confidence tape + durable paper DB**

1. Configure Vercel env for Helius/private RPC, Birdeye, and Solscan.
2. Re-run provider env audit until Helius/Birdeye/Solscan show configured/provider-ready.
3. Verify Birdeye trade endpoint returns wallet-attributed rows in production.
4. Verify Helius parsed transfer fallback and wallet lifecycle enrichment.
5. Confirm or reject Solscan trade endpoint using official docs/key scope.
6. Add DB-backed paper ledger adapter so paper entries survive serverless invocations/deploys.
7. Keep live execution disabled.
