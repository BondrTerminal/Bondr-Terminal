# Meridian Terminal Holder / Info Section Rebuild Prompt — 2026-08-02

You are working in `/Users/yakuzamoto/.openclaw/workspace/projects/solana-spl-market-maker`.

## Objective

Rebuild the weakest part of Meridian’s trading terminal: the holder/info section inside the Sniper / Trading Terminal. The target UX should feel structurally closer to Axiom’s token intelligence layout: compact tabbed sections for Positions, Orders, Holders, Top Traders, Dev Tokens, Only Tracked, Instant Trade, and Trades Table.

The current implementation in `apps/web/app/sniper/components/TerminalInfoBooth.tsx` is acceptable to completely wipe and rebuild if that is cleaner. This section is crucial because it is where an operator decides whether a token is safe, botted, bundled, dev-controlled, holder-concentrated, and worth acting on.

## Non-negotiable Safety Constraints

- Do **not** enable live trading.
- Keep `LIVE_TRADING_ENABLED=false` assumptions intact.
- Do **not** add server-side signing, private-key execution, wallet funding, swaps, broadcasts, or token launches.
- Any “Instant Trade” UI must remain preview/gated only unless existing safety gates already allow more. It should clearly say signing/broadcast is disabled until explicit live activation.
- Do not fake provider-backed confidence. If data is unavailable, rate-limited, modeled, estimated, or partial, label it honestly.
- GMGN remains read-only: no swap, no cooking, no private-key execution.
- Do not mutate Vercel env, production DB, wallet files, keys, funds, or provider settings.

## Current Files / Likely Targets

Start by inspecting these:

- `apps/web/app/sniper/components/TerminalInfoBooth.tsx`
- `apps/web/app/sniper/components/ExecutionDock.tsx`
- `apps/web/app/sniper/components/FastTradeFeed.tsx`
- `apps/web/app/sniper/components/TerminalTopBar.tsx`
- `apps/web/app/sniper/page.tsx`
- `apps/web/lib/terminal/contracts.ts`
- `apps/web/app/api/terminal/snapshot/route.ts`
- `apps/web/app/api/terminal-token-snapshot/route.ts`
- `apps/web/app/api/token-intel/route.ts`
- `apps/web/app/api/token-chart/route.ts`
- `apps/web/app/api/token-market-feed/route.ts`
- `apps/web/app/api/terminal/trade-feed/route.ts`
- `apps/web/app/api/terminal/live-readiness/route.ts`
- `apps/web/app/api/execution-capabilities/route.ts`
- `apps/web/app/api/execution-quote/route.ts`
- `apps/web/app/api/execution-swap/route.ts`
- `apps/web/app/api/send-signed-transaction/route.ts`

## Desired UX Structure

Replace the current broad tabs with a tighter Axiom-like intelligence panel:

1. **Positions**
   - Show tracked/operator wallet positions for the active mint.
   - Columns: wallet, role/tag, token amount, value, avg entry, avg exit, realized PnL, unrealized PnL, total PnL, last seen, source/confidence.
   - Include summary chips: tracked wallets, non-zero positions, total tokens, total value, realized PnL, unrealized PnL.
   - If no active mint or no tracked positions, show a clean empty state.

2. **Orders**
   - Show terminal orders/intents for the active mint.
   - Badge count in the tab label, e.g. `Orders 1`.
   - Columns/cards: side, kind, wallet, amount, trigger, status, last evaluation, lifecycle stage.
   - Must clearly mark orders as paper/gated unless existing contracts prove otherwise.

3. **Holders**
   - Tab label should include count, e.g. `Holders (175)` when total holder count is known.
   - This is the most important section.
   - Show top holder table with:
     - rank
     - owner wallet
     - token account if different/useful
     - amount
     - % supply
     - estimated value
     - SOL balance if available
     - bought tokens
     - sold tokens
     - net tokens
     - avg entry
     - avg exit
     - realized/unrealized/total PnL
     - tx count
     - first seen / last seen
     - tags: dev, sniper, bundle, fresh, whale, smart/KOL if available, risk labels
     - data source/confidence
   - Include top summary cards:
     - total holders
     - holders returned / coverage
     - top 10 concentration if computable
     - dev/insider tagged holders count if available
     - provider coverage label / pagination status
   - Make truncation obvious: if only 100 rows returned but 175 holders exist, show “100/175 loaded” and “provider-limited/read-only”.
   - Add search/filter controls locally:
     - wallet substring
     - only tagged/risky
     - only non-zero PnL
     - whales only
   - Sorting should support at minimum amount, % supply, value, PnL, tx count, last seen.

4. **Top Traders**
   - Show wallet-level realized/trade behavior from trade tape.
   - Columns: wallet, buys, sells, bought tokens, sold tokens, net tokens, buy volume, sell volume, total volume, avg entry, avg exit, realized PnL, unrealized PnL, total PnL, hold duration, last tx/time, tags/source.
   - Include summary chips: rows, total volume, winners/losers if computable, biggest PnL, highest volume trader.

5. **Dev Tokens**
   - Tab label should include count, e.g. `Dev Tokens (2)` when known.
   - Show tokens connected to deployer/dev wallets/classifier.
   - Columns/cards: token, mint, launch time, ATH/market cap if available, liquidity/migration status, current status, risk notes, source.
   - If current token’s dev wallet has no history, say so clearly.

6. **Only Tracked**
   - Toggle/tab that narrows view to operator/tracked wallets only.
   - Should combine tracked positions, tracked holder rows, tracked trade rows, and order state.
   - Use this to answer: “What do our wallets hold and what are our pending actions?”

7. **Instant Trade**
   - Keep this as a compact gated action panel, not a giant control surface.
   - Show selected wallet, side, amount, quote preview, slippage, and explicit safety gate state.
   - If live trading disabled, button copy should be preview/dry-run oriented, not “Buy now”.
   - It must use existing execution capability/quote routes and preserve browser-wallet signing + broadcast gate architecture.

8. **Trades Table**
   - Full trade tape table.
   - Columns: time, side, wallet, amount, price, volume, tx, source.
   - Filters: buys/sells/all, wallet search, min volume if easy.
   - Clearly label if feed is DexScreener-only, Helius/Birdeye-backed, cached, partial, or unavailable.

## Visual / Formatting Requirements

- Design should be dense, fast, and trader-grade — not marketing-card heavy.
- Use compact tabs with count badges.
- Use sticky/consistent section header with active mint, token symbol/name if available, price, mcap/liquidity, and data freshness.
- Tables should fit inside the terminal without turning into huge vertical cards.
- Use horizontal scrolling on mobile/narrow widths if needed.
- PnL colors:
  - green positive
  - red negative
  - neutral gray unavailable/modeled
- Risk labels should be visible but not noisy.
- Empty states should teach what is missing: “Load token”, “provider unavailable”, “no tracked wallets”, “trade tape required for PnL”, etc.
- Include data-source chips on each tab/section.

## Data Contract Rules

Use existing `TerminalTokenSnapshot` shape from `apps/web/lib/terminal/contracts.ts` as the main input. Reuse/extend these if needed:

- `snapshot.holders.rows`
- `snapshot.holders.totalHolders`
- `snapshot.holders.returnedRows`
- `snapshot.holders.coverageLabel`
- `snapshot.holders.paginationStatus`
- `snapshot.trades.rows`
- `snapshot.trades.topTraders`
- `snapshot.positions.rows`
- `snapshot.devTokens.classifier`
- `snapshot.devTokens.wallets`
- `snapshot.terminal.execution.terminalOrders.orders`
- `snapshot.sources`
- `snapshot.*.sourceStatus`

If more data is needed, prefer adding typed fields to `apps/web/lib/terminal/contracts.ts` and populate them in existing read-only snapshot routes. Do not invent fake data in the UI. If a metric cannot be computed, show `—` with a source/confidence note.

## Implementation Guidance

- It is acceptable to split `TerminalInfoBooth.tsx` into smaller components under `apps/web/app/sniper/components/terminal-info/` if that makes the rebuild cleaner.
- Recommended components:
  - `TerminalIntelPanel.tsx`
  - `TerminalIntelTabs.tsx`
  - `PositionsTab.tsx`
  - `OrdersTab.tsx`
  - `HoldersTab.tsx`
  - `TopTradersTab.tsx`
  - `DevTokensTab.tsx`
  - `OnlyTrackedTab.tsx`
  - `InstantTradeTab.tsx`
  - `TradesTableTab.tsx`
  - shared `formatters.ts` / `terminalIntelTypes.ts` if useful.
- Keep state simple: active tab, sort key, filter/search string, selected wallet, selected side/amount for preview.
- Do not create a giant untestable component if splitting is easy.
- Preserve existing token-load behavior from `meridian-token-loaded` and refresh behavior from `meridian-terminal-refresh`.
- Preserve snapshot fetch behavior from `/api/terminal/snapshot` unless there is a clear bug.
- Preserve optional stream behavior if currently useful.

## Acceptance Criteria

1. `/sniper` shows an Axiom-style compact tabbed intelligence section with tabs:
   - Positions
   - Orders with count
   - Holders with count
   - Top Traders
   - Dev Tokens with count
   - Only Tracked
   - Instant Trade
   - Trades Table
2. Holder section is no longer the weakest part:
   - shows holder rows with concentration, PnL/trade context when available, tags, source/confidence, coverage/truncation.
3. Data honesty is preserved:
   - modeled/partial/unavailable/provider-limited labels shown clearly.
4. Live safety preserved:
   - no live trading enabled
   - no signing/broadcasting/server key execution added
   - Instant Trade remains gated/preview-first.
5. TypeScript passes:
   - `pnpm check`
   - `pnpm web:check`
6. Tests/build pass:
   - `pnpm test`
   - `pnpm web:build`
7. If production deployment is requested separately, deploy only after explicit confirmation and smoke-check:
   - `/sniper`
   - `/api/terminal/snapshot?mint=<known mint>`
   - `/api/execution-capabilities`
   - `/api/pre-live-resolution`

## Final Summary Required

When done, report:

- Files changed
- What was rebuilt
- Which data is provider-backed vs modeled/partial
- Safety gates preserved
- Verification command results
- Whether it was deployed or not
