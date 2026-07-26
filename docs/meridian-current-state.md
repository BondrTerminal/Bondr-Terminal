# Meridian Current State

_Last updated: 2026-07-25 23:56 EDT_

## Why this document exists

We were losing track of what is local-only, what is deployed to Vercel, what is actually wired, and what still needs provider credentials. This file is the working source of truth until the terminal is production-ready.

## Product goal

Meridian is the Solana trading / sniper / liquidity terminal for reading active tokens, showing market context, holder quality, wallet balances, trade flow, dev movement, bundle/fresh-wallet risk, and eventually gated execution.

Current priority: **terminal backend/read-data completeness before live trading.**

## Current confirmed local state

The local app has recently been patched to support:

- `/api/provider-readiness`
- `/api/token-stats`
- `/api/token-transactions`
- `/api/terminal-token-snapshot`
- `/api/terminal/snapshot`
- holder table enrichment in the sniper terminal UI
- server-only env loading from:
  - repo root `.env`
  - repo root `.env.local`
  - `apps/web/.env`
  - `apps/web/.env.local`

Local checks passed after the patch:

- `pnpm web:check`
- `pnpm web:build`

## Important deployment warning

The Vercel URL may be behind local code. The latest local changes are not guaranteed to be deployed.

Known likely problem:

- local files were patched after the deployed Vercel build existed
- Vercel CLI is not installed globally on this machine based on prior tool checks
- `.vercel/project.json` exists, so the project is linked, but deployment still requires either Vercel CLI/auth or GitHub/Vercel integration

## Provider credential state

The code expects the following server-only environment variables.

### Strongly recommended

```env
HELIUS_API_KEY=
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
BIRDEYE_API_KEY=
SOLSCAN_API_KEY=
# or
SOLSCAN_PRO_API_KEY=
```

### Optional private RPC alternatives

```env
QUICKNODE_RPC_URL=
# or
TRITON_RPC_URL=
# or
SOLANA_RPC_URL=
```

### Optional deeper analytics

```env
BITQUERY_API_KEY=
JUPITER_API_KEY=
```

Do not put secrets in `NEXT_PUBLIC_*` values. Do not commit secrets.

## Provider behavior by source

### Helius / Helius RPC

Purpose:

- parsed wallet history
- holder lifecycle enrichment
- token transfers
- fresh-wallet classifier quality
- private RPC if `HELIUS_RPC_URL` is set

Without Helius:

- holder entry/exit data is limited
- wallet lifecycle status should show `not-configured`
- PnL coverage is partial/best-effort

### Birdeye

Purpose:

- preferred wallet-attributed token trade tape
- better priced trade history
- stronger holder/trader PnL estimates

Without Birdeye:

- GeckoTerminal/Dex/Pump.fun may still provide trade rows
- wallet-level PnL confidence is lower

### Solscan

Purpose:

- ranked holder list
- holder-count cross-check

Without Solscan:

- holder rows fall back to Helius DAS, Solana RPC largest accounts, Pump.fun, then RugCheck

### RugCheck

Purpose:

- risk fallback
- top-holder fallback
- holder/rug hints
- insider/locker summary where available

RugCheck is no-key and should remain available when its API is up.

### DexScreener / GeckoTerminal / Jupiter

Purpose:

- market data
- pools/liquidity/volume
- chart/trades fallback
- route preview

These mostly work without private keys, but rate limits and incomplete wallet attribution are expected.

## Holder table target behavior

Holder rows should show:

- rank
- holder wallet
- token account
- SOL wallet balance
- token holding
- % supply
- USD value
- bought tokens
- sold tokens
- entry price or first-entry timestamp
- exit price or last-exit timestamp
- PnL estimate when enough priced tape exists
- last active
- lifecycle/provider status

## What is done

- Local backend routes are wired together.
- Terminal holder rows have fields for balance, entry, exit, PnL, lifecycle status, and source.
- Provider readiness includes Helius, Birdeye, Solscan, Bitquery, RugCheck, DexScreener, Jupiter, and Solana RPC status.
- Local TypeScript/build passed after recent wiring.

## What is not done / not confirmed

- Vercel deployment is not confirmed to include the latest local changes.
- Vercel production env vars are not confirmed.
- Local `.env.local` provider keys are not confirmed present.
- Full Helius/Birdeye/Solscan coverage cannot be confirmed until real keys are added server-side.
- Live trading remains gated and should stay disabled until read-data quality and safety gates are complete.

## Immediate next steps

### Step 1 — Confirm deploy path

Pick one:

1. Install/use Vercel CLI and deploy from this repo.
2. Confirm GitHub repo + branch connected to Vercel, then push/trigger deploy.
3. Use Vercel dashboard manually to redeploy latest source.

Do not deploy secrets. Env vars must be server-side Vercel env only.

### Step 2 — Add provider env vars

Add provider keys to:

- local: `apps/web/.env.local` or root `.env.local`
- production: Vercel Project Settings → Environment Variables

Minimum useful production set:

```env
HELIUS_API_KEY=
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
BIRDEYE_API_KEY=
SOLSCAN_API_KEY=
```

If Solscan Pro is used instead:

```env
SOLSCAN_PRO_API_KEY=
```

### Step 3 — Verify local

Run:

```bash
pnpm web:check
pnpm web:build
```

Then verify active-token routes:

```bash
/api/provider-readiness
/api/token-stats?mint=<ACTIVE_MINT>&holderListLimit=25
/api/token-transactions?mint=<ACTIVE_MINT>&limit=25
/api/terminal/snapshot?mint=<ACTIVE_MINT>&holderLimit=25&limit=25
```

Expected improvement after keys:

- Helius status should become configured/ok
- Solscan should become configured/ok if key is valid
- Birdeye should become configured/ok if key is valid
- holder lifecycle should no longer be universally `not-configured`
- holder entry/exit/PnL coverage should increase

### Step 4 — Verify Vercel

Against the production URL, check:

```bash
https://web-seven-black-1mmddd4fwu.vercel.app/api/provider-readiness
https://web-seven-black-1mmddd4fwu.vercel.app/api/terminal/snapshot?mint=<ACTIVE_MINT>&holderLimit=25&limit=25
```

Expected production result:

- provider readiness matches local provider state
- holder table fields appear in JSON
- UI shows latest holder columns and statuses

## Operating rule going forward

After every meaningful terminal/backend change:

1. Update this file.
2. Run local check/build.
3. Verify one active-token route.
4. Deploy or explicitly mark local-only.
5. Verify production route after deploy.

If a change is not deployed, label it **LOCAL ONLY** in the chat summary.
