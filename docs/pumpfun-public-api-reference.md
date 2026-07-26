# Pump.fun Public/Unofficial API Reference for Meridian

_Last pulled: 2026-07-22_

Important: Pump.fun does **not** appear to provide a stable official public developer API spec. The usable docs are unofficial/reverse-engineered and many endpoints require a Pump.fun JWT. Treat these as opportunistic readers, not guaranteed infrastructure.

Sources:
- Endpoint catalog: https://github.com/BankkRoll/pumpfun-apis/blob/main/endpoints/INDEX.md
- OpenAPI spec: https://github.com/BankkRoll/pumpfun-apis/blob/main/frontend-api-v3.json
- Browseable docs: https://bankkroll-pumpfun-apis.mintlify.app/quickstart

## Env

- `PUMPFUN_JWT` or `PUMPFUN_API_TOKEN` — optional Bearer token for endpoints requiring auth.
- `PUMPFUN_FRONTEND_API_URL` — defaults to `https://frontend-api-v3.pump.fun`.
- `PUMPFUN_ADVANCED_API_URL` — defaults to `https://advanced-api-v2.pump.fun`.

## Useful endpoints pulled

| Purpose | Endpoint | Auth | Meridian route |
|---|---|---:|---|
| Coin metadata | `GET /coins/{mint}?sync=true` | sometimes/public varies | `/api/pumpfun/token?mint=<mint>` |
| Token trades | `GET /trades/all/{mint}?limit=50&offset=0&minimumSize=0` | sometimes/public varies | `/api/pumpfun/trades?mint=<mint>` |
| Graduated/migrated tokens | `GET /coins/graduated` on advanced API | usually JWT | `/api/pumpfun/migrations` |
| Creator/dev tokens | `GET /coins/user-created-coins/{userId}` | usually JWT | `/api/pumpfun/dev-tokens?creator=<id>` |
| Latest coin | `GET /coins/latest` | docs list, runtime may conflict/require auth | not wired yet |
| Top holders + SOL balance | `GET /coins/top-holders-and-sol-balance/{mint}` | varies | candidate future holder fallback |
| Candlesticks | `GET /candlesticks/{mint}` | varies | candidate chart fallback |

## Integration notes

- `apps/web/lib/indexers/pumpfun.ts` centralizes Pump.fun fetch/auth/header handling.
- `/api/token-transactions` now uses Pump.fun trades as a fallback after GeckoTerminal and Helius.
- `/api/terminal-token-snapshot` now includes `pumpfun: { token, migrations, devTokens }`.
- Terminal Migration tab reads Pump.fun migration state from snapshot.
- Terminal Dev Tokens tab reads Pump.fun creator-token history from snapshot.

## Caveats

- These endpoints can change without notice.
- Some require `Authorization: Bearer <JWT>` and `Origin: https://pump.fun`.
- Do not use Pump.fun internal endpoints for funded actions without explicit review. Current integration is read-only.
