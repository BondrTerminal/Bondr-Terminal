# Meridian Terminal Tab Backend Wiring Prompt — 2026-08-02

You are working in `/Users/yakuzamoto/.openclaw/workspace/projects/solana-spl-market-maker`.

## Context

The terminal UI shell has been rebuilt into a compact Axiom-style intelligence panel in `apps/web/app/sniper/components/TerminalInfoBooth.tsx`. The current tabs are:

- Positions
- Orders
- Holders
- Top Traders
- Dev Tokens
- Only Tracked
- Instant Trade

The `Trades Table` tab was intentionally removed because the trade tape should live in the separate live trade feed, with an eventual open/close button like Axiom rather than a duplicated tab.

The next job is to plug real API/CLI/provider-backed data into each tab while preserving honest labels and live-safety gates.

## Non-negotiable Safety Constraints

- Do **not** enable live trading.
- Keep `LIVE_TRADING_ENABLED=false` unless the operator explicitly performs a final activation ceremony later.
- Do **not** add server-side signing, private-key execution, wallet funding, swaps, broadcasts, or token launches.
- Instant Trade remains quote-preview/gated only.
- GMGN remains read-only: no swap, no cooking, no private-key execution.
- Do not mutate Vercel env, production DB, wallets, keys, funds, provider settings, or on-chain state.
- If a metric is missing/partial/provider-limited, label it honestly instead of fabricating it.

## Primary Files to Inspect

UI:

- `apps/web/app/sniper/components/TerminalInfoBooth.tsx`
- `apps/web/app/sniper/components/FastTradeFeed.tsx`
- `apps/web/app/sniper/components/ExecutionDock.tsx`
- `apps/web/app/sniper/components/TradingTokenLoader.tsx`
- `apps/web/app/sniper/page.tsx`
- `apps/web/app/globals.css`

Contracts and aggregators:

- `apps/web/lib/terminal/contracts.ts`
- `apps/web/app/api/terminal/snapshot/route.ts`
- `apps/web/app/api/terminal-token-snapshot/route.ts`
- `apps/web/app/api/terminal/trade-feed/route.ts`
- `apps/web/app/api/terminal/live-readiness/route.ts`
- `apps/web/app/api/terminal/provider-env-audit/route.ts`
- `apps/web/lib/gmgn.ts`
- `apps/web/app/api/gmgn/query/route.ts`

Existing read-only backends to reuse:

- `GET /api/token-intel`
- `GET /api/token-market-feed`
- `GET /api/token-chart`
- `GET /api/readers/token-accounts`
- `GET /api/readers/trade-tape`
- `GET /api/readers/wallet-history`
- `GET /api/wallet-token-balances`
- `GET /api/wallet-balances`
- `GET /api/wallet-graph-insider-index`
- `GET /api/fresh-wallet-classifier`
- `GET /api/bundle-clustering-index`
- `GET /api/dev-sold-classifier`
- `GET /api/pumpfun/token`
- `GET /api/pumpfun/dev-tokens`
- `GET /api/pumpfun/trades`
- `GET /api/pumpfun/migrations`
- `GET /api/gmgn/readiness`
- `POST /api/gmgn/query` for read-only GMGN commands only
- `POST /api/execution-quote`
- `GET /api/execution-capabilities`
- `GET/POST /api/paper-ledger`
- `GET/POST /api/terminal-order-engine`

## Desired Backend Contract

Make `/api/terminal/snapshot` the canonical server-side aggregation route for the terminal tabs. The UI should mostly consume `TerminalTokenSnapshot` and should not independently invent data.

Extend `apps/web/lib/terminal/contracts.ts` if needed so the snapshot cleanly exposes these typed sections:

```ts
type TerminalTokenSnapshot = {
  positions?: { rows: TerminalPositionRow[]; summary: TerminalPositionSummary; sourceStatus: TerminalSectionSource };
  orders?: { rows: TerminalOrderRow[]; summary: TerminalOrderSummary; sourceStatus: TerminalSectionSource };
  holders?: TerminalHoldersSnapshot;
  trades?: { rows: TerminalTradeEvent[]; topTraders: TerminalTopTrader[]; summary?: Record<string, unknown>; sourceStatus?: TerminalSectionSource };
  devTokens?: { rows: TerminalDevTokenRow[]; wallets?: Record<string, unknown>[]; classifier?: Record<string, unknown>; sourceStatus: TerminalSectionSource };
  tracked?: { positions: TerminalPositionRow[]; holders: TerminalHolderAccount[]; trades: TerminalTradeEvent[]; orders: TerminalOrderRow[]; sourceStatus: TerminalSectionSource };
  instantTrade?: { capabilities: ExecutionCapabilitiesSummary; defaultQuoteRequest: Record<string, unknown>; sourceStatus: TerminalSectionSource };
};
```

Names can differ, but the UI must receive stable typed rows for each tab.

## Tab-by-Tab Backend Wiring

### 1. Positions

Goal: answer “What do our tracked/operator wallets hold for this mint?”

Data sources:

- `/api/wallet-token-balances`
- `/api/wallet-balances`
- local Meridian wallet list/project wallet group
- trade tape or wallet history for avg entry/PnL if available

Required fields:

- wallet address
- wallet id/role
- token amount
- SOL balance
- value USD if price available
- avg entry/exit if trade tape/history available
- realized/unrealized/total PnL if safely computed
- tx count/last seen if available
- `status`: `provider-backed`, `balance-only`, `modeled`, `unavailable`, etc.
- `source`: array of data providers/routes used

Do not show PnL as high confidence unless buys/sells are matched to provider-backed trade/history data.

### 2. Orders

Goal: answer “What pending/intended actions exist for this token?”

Data sources:

- `/api/terminal-order-engine`
- `/api/terminal/intents`
- `/api/routers/order/evaluate` only for explicit evaluation actions

Required fields:

- id
- createdAt
- side
- kind
- wallet
- amount/spend asset
- trigger price/direction
- status
- lifecycle stage
- last evaluation price/time
- execution label

Must clearly mark all orders as paper/gated unless live contracts explicitly prove otherwise. Do not create real orders or broadcasts.

### 3. Holders

Goal: make this the strongest section. It should answer “Is this holder structure safe, botted, bundled, dev-controlled, or concentrated?”

Data sources:

- `/api/readers/token-accounts`
- Helius/Birdeye token account or holder data if available
- GMGN read-only `token-holders` if configured and useful
- `/api/wallet-graph-insider-index`
- `/api/fresh-wallet-classifier`
- `/api/bundle-clustering-index`
- trade tape for holder buy/sell/PnL context

Required fields per holder row:

- rank
- owner wallet
- token account
- amount
- % supply
- estimated value
- SOL balance if available
- bought tokens
- sold tokens
- net tokens
- avg entry
- avg exit
- realized/unrealized/total PnL when safe
- tx count
- first seen / last seen
- tags: dev, insider, sniper, bundle, fresh, whale, smart/KOL if available
- data source/confidence

Required summary:

- total holders
- returned holders / total holders coverage
- top 10 concentration
- top 1 concentration
- 5%+ wallet count
- dev/insider tagged holder count
- provider coverage label
- pagination/truncation state

If provider returns only 100/175 holders, expose exactly `100/175 loaded` and label `provider-limited/read-only`.

### 4. Top Traders

Goal: answer “Who made money, who is dumping, and who drove volume?”

Data sources:

- `/api/readers/trade-tape`
- Helius/Birdeye wallet-attributed swaps if available
- GMGN read-only `token-traders` if configured and useful
- `/api/pumpfun/trades` for pump.fun style tokens if relevant

Required fields:

- wallet
- buys/sells
- bought/sold/net tokens
- buy/sell/total volume USD
- avg entry/avg exit
- realized/unrealized/total PnL where safely computed
- hold duration
- last tx/time
- tags/source

### 5. Dev Tokens

Goal: answer “What else has this dev/deployer launched?”

Data sources:

- `/api/pumpfun/dev-tokens`
- GMGN read-only token/dev data if available
- local dev wallet classifier

Required fields:

- token name/symbol
- mint
- launch time
- ATH market cap if available
- current market cap if available
- liquidity
- migration/pool status
- current status
- risk note/source

### 6. Only Tracked

Goal: answer “What do our wallets hold and what pending actions/activity do we have?”

Data sources:

- derived from Positions + Holders + Trades + Orders
- tracked wallets from selected project wallet group

Required fields:

- tracked positions
- tracked holder rows
- tracked trade rows
- tracked orders
- summary counts

This should be a derived section, not a separate provider call if existing sections already contain enough data.

### 7. Instant Trade

Goal: quote-preview only.

Data sources:

- `/api/execution-capabilities`
- `/api/execution-quote`

Required behavior:

- selected wallet
- side
- amount
- slippage
- quote preview
- route labels/impact/out amount
- explicit live-disabled reason
- browser-wallet signer requirement label
- broadcaster disabled until signed payload

No swap build/sign/broadcast should be triggered by this tab.

## Implementation Requirements

- Prefer server-side aggregation in `/api/terminal/snapshot`; keep UI as a typed renderer.
- Add source/confidence metadata per tab.
- Add graceful fallback order: provider-backed -> read-only CLI -> local/modeled -> unavailable.
- Avoid waterfalls in the browser. Fetch snapshot once and render tabs from it.
- If adding GMGN calls, keep allowlist read-only commands only: token-info, token-security, token-pool, token-holders, token-traders, market-trending, hot-searches.
- Batch provider calls where reasonable; enforce timeouts and partial responses.
- Make failures section-local. One provider failure should not blank the whole terminal.

## Validation

Run:

```bash
pnpm check
pnpm web:check
pnpm test
pnpm web:build
```

Then smoke locally/production only if deployment is explicitly requested:

- `/sniper`
- `/api/terminal/snapshot?mint=<known active mint>&holderLimit=175&limit=175&profile=live-read&fastPrimary=1`
- `/api/execution-capabilities`
- `/api/gmgn/readiness`
- `/api/pre-live-resolution`

## Final Report

Report:

- Files changed
- Routes/providers wired per tab
- Which fields are provider-backed vs modeled/partial/unavailable
- Safety gates preserved
- Verification results
- Deployment status
