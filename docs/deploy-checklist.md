# Meridian Deploy Checklist

Use this every time before saying Vercel is up to date.

## 1. Local source checkpoint

```bash
git status --short
pnpm web:check
pnpm web:build
```

If files changed, commit before deployment.

## 2. Local smoke routes

Use an active token, not SOL/USDC. Current probe route:

```bash
curl http://localhost:3011/api/market-data/probe-token
```

Then check:

```bash
curl http://localhost:3011/api/provider-readiness
curl 'http://localhost:3011/api/token-stats?mint=<ACTIVE_MINT>&holderListLimit=25'
curl 'http://localhost:3011/api/token-transactions?mint=<ACTIVE_MINT>&limit=25'
curl 'http://localhost:3011/api/terminal/snapshot?mint=<ACTIVE_MINT>&holderLimit=25&limit=25'
```

Required smoke result:

- provider readiness route returns JSON
- terminal snapshot route returns JSON
- holder rows exist or a clear provider status explains why they do not
- no route returns HTML/404

## 3. Env vars before production deploy

Server-only only. Never `NEXT_PUBLIC_*` for secrets.

Recommended:

```env
HELIUS_API_KEY=
BIRDEYE_API_KEY=
SOLSCAN_API_KEY=
# or SOLSCAN_PRO_API_KEY=
```

Optional private RPC:

```env
HELIUS_RPC_URL=
# or QUICKNODE_RPC_URL=
# or TRITON_RPC_URL=
# or SOLANA_RPC_URL=
```

Optional analytics:

```env
BITQUERY_API_KEY=
JUPITER_API_KEY=
```

## 4. Deploy path

Preferred long-term path:

1. Commit local changes.
2. Push to GitHub repo connected to Vercel.
3. Vercel auto-builds from the commit.
4. Verify production routes.

Fallback path:

1. Use Vercel CLI from this repo.
2. Deploy production.
3. Verify production routes.

## 5. Production smoke

```bash
curl https://web-seven-black-1mmddd4fwu.vercel.app/api/provider-readiness
curl 'https://web-seven-black-1mmddd4fwu.vercel.app/api/terminal/snapshot?mint=<ACTIVE_MINT>&holderLimit=25&limit=25'
```

Required production result:

- no 404
- provider readiness includes current provider matrix
- terminal snapshot includes holder rows with latest fields
- Vercel env status matches expected keys

## 6. Report format

Every deployment report must include:

- commit hash
- local check/build result
- local smoke route result
- deploy method
- production URL
- production provider readiness summary
- production terminal snapshot summary
- remaining blockers
