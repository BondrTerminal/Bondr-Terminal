# Meridian Web

Vercel-ready dApp shell for the Solana SPL market-maker project.

## Safety model

- Browser receives public status and whitelisted paper-session reports only.
- No private keys, seed phrases, or RPC secrets in `NEXT_PUBLIC_*` variables.
- Live trading remains disabled by design.
- API routes may read server-side status and whitelisted paper-session reports, but must not expose execution controls until explicit approval and auth are implemented.

## Local commands

From repo root after dependency install approval:

```bash
export PATH="/opt/homebrew/bin:/Users/yakuzamoto/.cargo/bin:$PATH"
pnpm --filter @soulana/market-maker-web dev
pnpm --filter @soulana/market-maker-web check
pnpm --filter @soulana/market-maker-web build
```

## Status data

The dashboard reads status server-side in this order:

1. `MARKET_MAKER_STATUS_URL`
2. `MARKET_MAKER_STATUS_FILE` / `runtime/market-maker-status.local.json`
3. bundled fallback data in `apps/web/data/fallback-status.json`

Generate local read-only status from repo root:

```bash
pnpm observe -- config/market-maker.local.json
```

This writes `runtime/market-maker-status.local.json`, which is gitignored.

## Paper session report data

The dashboard reads reports server-side in this order:

1. `MARKET_MAKER_REPORT_URL`
2. `MARKET_MAKER_REPORT_FILE` / `runtime/paper-session-report.json`
3. null fallback: `{ source: 'fallback', report: null }`

The report panel is read-only and renders paper PnL, paper risk, spread capture, fill/open-order counts, stop reason, and skipped reasons from whitelisted report JSON only.

Generate a deterministic local report fixture from repo root:

```bash
pnpm paper:report
pnpm web:dev
```

`paper:report` writes `runtime/paper-session-report.json` from prepared snapshots. It does not use RPC, private keys, wallet signing, swaps, or live execution.

Relative status/report file paths are resolved from both the web app working directory and the repo root, so the default `runtime/paper-session-report.json` works when Next runs inside `apps/web`.

## Environment

Copy `.env.example` to `.env.local` for local app settings. Keep secrets server-side only.

## Meridian web app scope

The web app is the presentation and operator layer for Meridian. It now includes:

- `/` public hub page
- `/projects` project index, draft creation, readiness, next actions, event history
- `/projects/[id]` unified project cockpit
- `/deployment` launch planning/preflight/monitoring scaffold
- `/wallets` active/archive wallet dashboard, wallet groups, balances, readiness, feed
- `/project-dashboard` net SOL flow accounting: sells minus buys, held tokens excluded
- `/sniper` read-only DexScreener token/pair intelligence
- `/liquidity` paper-first Liquidity Engine cockpit
- `/whitepaper`, `/profile`, `/profile`

Preview limitations:

- Local JSON/demo state is used for project/wallet/deployment surfaces.
- Serverless Vercel writes are simulated until durable storage is connected.
- All money/key/signing/execution actions are intentionally disabled.
