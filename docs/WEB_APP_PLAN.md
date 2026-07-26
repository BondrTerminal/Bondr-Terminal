# Web App / dApp Build Plan

_Last updated: 2026-07-11_

## Goal

Build a public website + protected dashboard for the Solana SPL market-maker foundation.

Use:

- **Webflow** for public marketing/landing pages.
- **Vercel + Next.js** for the dApp/dashboard/control surface.

## Architecture

```text
Webflow public site
  ├─ landing pages, docs, brand, waitlist
  └─ links to app subdomain

Vercel Next.js app
  ├─ public dashboard shell
  ├─ read-only status API
  ├─ read-only paper-session report API
  ├─ wallet connect later
  └─ protected operator controls later

Market-maker runtime
  ├─ local/server process
  ├─ dry-run/paper/live-disabled modes
  ├─ SQLite/JSON ledger
  └─ status endpoint in a later phase
```

## Safety boundaries

The web app must not:

- contain private keys,
- expose RPC secrets in browser env vars,
- trigger live trades from public routes,
- bypass HALT/self-trade/risk gates,
- run live mode before explicit approval.

The browser is never the trusted execution environment. Any future operator action must be an authenticated request to a backend service that owns policy checks, audit logging, HALT enforcement, risk enforcement, simulation/preflight, and signer isolation. Browser routes may request intent; they must not hold secrets, sign transactions, or directly place orders.

The browser can safely show:

- mode,
- health,
- cluster,
- venue,
- last observation timestamp,
- dry-run/paper metrics,
- paper-session reports,
- read-only wallet/public token information.

## Protected operator controls design

Status: design only. Do not add wallet-adapter/auth dependencies until the permission model is chosen.

Recommended phases:

1. **Read-only public beta** — current state. Public dashboard can show sanitized status, public wallet addresses, balances, risk limits, and dry-run/paper notes.
2. **Authenticated operator read view** — login/session layer gates private operational details such as ledger paths, runtime host labels, and internal diagnostics. Still no controls.
3. **Intent-only controls** — authenticated operator may submit requests like pause paper loop, resume paper loop, rotate status source, or create a manual HALT. Backend validates role, writes an audit event, then applies the change. No live trading.
4. **Live-control review gate** — only after signer isolation, transaction simulation, venue adapters, drawdown/HALT/self-trade enforcement, and explicit approval. Even then, UI submits intents; backend decides and signs if allowed.

Minimum controls model before implementation:

- session auth with CSRF protection,
- role separation: viewer / operator / admin,
- per-action audit logs,
- backend-owned permission checks,
- no browser secrets or signer material,
- no public route mutations,
- all mutating controls disabled when HALT exists,
- explicit dry-run/paper/live mode banner on every protected screen.

## Beta dashboard status

The dashboard now displays:

- mode / health / source,
- public wallet address,
- SOL and token balances,
- token and quote mints,
- Jupiter reference price,
- slippage and volatility placeholders,
- configured risk limits,
- latest safe paper-session report cards,
- paper PnL, paper risk, spread capture, fill/open-order counts, stop reason, and skipped reasons,
- operator safety notes.

Server-side status source order:

1. `MARKET_MAKER_STATUS_URL` if configured.
2. `MARKET_MAKER_STATUS_FILE`, defaulting to `runtime/market-maker-status.local.json`.
3. bundled fallback mock data at `apps/web/data/fallback-status.json`.

`pnpm observe -- config/market-maker.local.json` writes safe public observation output to `runtime/market-maker-status.local.json`.

Server-side paper report source order:

1. `MARKET_MAKER_REPORT_URL` if configured.
2. `MARKET_MAKER_REPORT_FILE`, defaulting to `runtime/paper-session-report.json`.
3. Null fallback: `{ source: 'fallback', report: null }`.

The paper report API is `/api/market-maker/report`. It returns only parsed whitelisted paper report fields and never exposes raw config, env names, RPC URLs, API keys, private keys, signers, browser secrets, swaps, or live execution controls.

## Current scaffold

Created:

- `apps/web/package.json`
- `apps/web/app/page.tsx`
- `apps/web/app/api/health/route.ts`
- `apps/web/app/api/market-maker/status/route.ts`
- `apps/web/app/api/market-maker/report/route.ts`
- `apps/web/lib/status.ts`
- `apps/web/app/components/StatusPanel.tsx`
- `apps/web/data/fallback-status.json`
- `runtime/market-maker-status.example.json`
- `apps/web/.env.example`
- `vercel.json`
- `docs/webflow/WEBFLOW_HANDOFF.md`

## Next steps

1. Create Webflow landing copy and visual sections.
2. Choose deployment shape:
   - `domain.com` = Webflow, `app.domain.com` = Vercel, or
   - `domain.com` = Vercel, `/marketing`/subdomain = Webflow.
3. Finalize auth/permission model before any private operator controls.
4. Add protected operator read routes before adding mutating controls.
5. Add a local/server status endpoint from the market-maker runtime if the JSON-file bridge becomes insufficient.
