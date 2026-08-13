# TradingView-style Portfolio / Realized PnL Graph Integration

_Date: 2026-08-01 EDT_

## Bottom line

For Meridian, the best near-term implementation is **TradingView Lightweight Charts™**, not the proprietary full Charting Library. It is open-source, small, React/Next-friendly, and designed for custom time-series data like cumulative realized PnL, daily PnL bars, balance curves, and token OHLCV panels. The full Advanced Charts / Trading Platform products are useful later if Meridian needs full TradingView terminal behavior: indicators, drawings, account/position tracking, order overlays, DOM, custom order dialogs, etc.

Axiom appears to use the same product pattern: a portfolio page with separated spot/perps PnL, total PnL, trade counts, active positions, and activity/history. We can replicate the UX value without needing Axiom's internals by feeding Meridian's own accounting and wallet history into TradingView-compatible chart components.

## What TradingView actually offers

### 1. Lightweight Charts™ — recommended first

- Official npm package: `lightweight-charts`.
- Official docs say it is a **client-side** library, installed via `npm install --save lightweight-charts`, with TypeScript declarations included.
- Supports `Area`, `Bar`, `Baseline`, `Candlestick`, `Histogram`, and `Line` series.
- Data is supplied by us with `series.setData([...])` and updated with `series.update(...)`.
- TradingView advertises it as around **35 KB** and open-source / Apache 2.0.
- Requires TradingView attribution notice/link on a public page/app.

Sources:
- https://tradingview.github.io/lightweight-charts/docs
- https://www.tradingview.com/lightweight-charts/
- https://www.tradingview.com/free-charting-libraries/

### 2. Advanced Charts / Charting Library — later, license-gated

- Proprietary TradingView product.
- Heavier than Lightweight Charts; TradingView comparison page lists Advanced Charts around **670 KB**.
- Built for full technical-analysis charts: indicators, drawings, symbol search, custom intervals, multiple scales, templates, etc.
- Does **not** include market data automatically. We must provide data via either:
  - UDF-compatible endpoint; or
  - custom JavaScript Datafeed API.
- Datafeed API methods include `onReady`, `searchSymbols`, `resolveSymbol`, `getBars`, and realtime subscription methods.

Sources:
- https://www.tradingview.com/free-charting-libraries/
- https://www.tradingview.com/charting-library-docs/latest/connecting_data/Datafeed-API/

### 3. Trading Platform — not needed yet

- Proprietary, heavier terminal product; comparison page lists around **900 KB**.
- Adds chart trading, order/position display on chart, trading history on chart, custom order dialogs, account/position tracking, DOM, bracket orders, watchlists, etc.
- This becomes relevant only once Meridian has explicit live execution and wants TradingView-like order UI.

Source:
- https://www.tradingview.com/free-charting-libraries/

## What Axiom is doing conceptually

Axiom's public docs describe a portfolio product with:

- Separate spot and perpetuals portfolios.
- Balance / account value sections.
- PnL chart tracking performance trends.
- Metrics like total PnL and transaction counts.
- Active positions and activity / trade history.

Source:
- https://docs.axiom.trade/axiom/portfolio

Important: I did not verify Axiom's exact frontend bundle or license usage from their production app in this pass. The decision-critical point is not whether they use Lightweight Charts or full Charting Library; it is that their portfolio UX is a time-series accounting layer, and TradingView's chart libraries are a clean way for us to render that layer.

## Meridian current fit

Current portfolio page already has:

- `/portfolio` with Spot and Wallets views.
- `/api/portfolio` returning `portfolio-v1` snapshot.
- Performance fields: `totalValueUsd`, `tradeableBalanceUsd`, `realizedPnlUsd`, `unrealizedPnlUsd`, `totalPnlUsd`, `totalTxns`, buys/sells, PnL buckets, status/confidence/history coverage.
- Activity/history rows from `meridian-flow-events`.
- Placeholder UI: `portfolioChartPlaceholder` currently displays `Realized PNL` with status text.
- `/api/token-chart` already returns OHLCV candles from DexScreener + GeckoTerminal for token charts.

Relevant files:
- `apps/web/app/portfolio/page.tsx`
- `apps/web/app/api/portfolio/route.ts`
- `apps/web/lib/portfolio-snapshot.ts`
- `apps/web/app/api/token-chart/route.ts`

## Recommended product implementation

### Phase 1 — Replace placeholder with Lightweight PnL chart

Add `lightweight-charts` to `@soulana/market-maker-web` / root dependency set.

Create a client component:

- `apps/web/app/portfolio/components/PortfolioPnlChart.tsx`

Render:

1. **Cumulative realized PnL line/area**
   - Series type: `AreaSeries` or `LineSeries`.
   - Data: `{ time, value }`.
   - Derived from historical closed sell/realized events.

2. **Daily realized PnL histogram**
   - Series type: `HistogramSeries`.
   - Positive bars green, negative bars red.
   - Data: one bar per day/session.

3. **Zero baseline**
   - Use `BaselineSeries` if we want automatic positive/negative coloring around zero.
   - Or draw a constant zero line as a second line series.

4. **Range selector**
   - Existing UI already has `1d / 7d / 30d / Max`; wire it to query params or client state.

### Phase 2 — Add `/api/portfolio/timeseries`

Do not overload `/api/portfolio`; keep snapshot and chart data separate.

Suggested contract:

```json
{
  "contract": "portfolio-timeseries-v1",
  "status": "ok|partial|unavailable",
  "observedAt": "ISO timestamp",
  "range": "1d|7d|30d|max",
  "currency": "USD",
  "source": "meridian-flow-events|provider-wallet-history|mixed",
  "confidence": "modeled|estimated|high",
  "series": {
    "cumulativeRealizedPnl": [
      { "time": "2026-08-01", "value": 123.45 }
    ],
    "dailyRealizedPnl": [
      { "time": "2026-08-01", "value": 20.12, "color": "#24d18f" }
    ],
    "portfolioValue": [
      { "time": "2026-08-01", "value": 1000.00 }
    ]
  },
  "gaps": []
}
```

Data derivation now:

- Use `store.flowEvents` for modeled/accounting PnL.
- Convert SOL amounts to USD using the current SOL price, or better: persist historical SOL/USD price at event time later.
- Sort ascending by timestamp.
- Aggregate by day for histogram.
- Accumulate realized PnL for line/area.

Data derivation later:

- Upgrade to wallet-attributed trade fills from Helius/Birdeye/Shyft/Bitquery/etc.
- Persist normalized fills in a database table.
- Compute realized PnL using FIFO or weighted-average cost basis.
- Mark confidence high only when we have full wallet trade history and price-at-fill.

### Phase 3 — Token OHLCV chart parity

Use Lightweight Charts `CandlestickSeries` for `/api/token-chart` data:

- `candles[]` already maps to `{ timestamp, open, high, low, close, volume }`.
- Convert to TradingView format: `{ time: unixSeconds, open, high, low, close }`.
- Add volume histogram in the same chart/pane.
- This gives the Terminal more Axiom-like price chart polish without license friction.

### Phase 4 — Only consider full Advanced Charts if needed

Use proprietary TradingView Charting Library only if we need:

- Drawing tools and 100+ indicators.
- Full symbol search/timeframe framework.
- Saved chart layouts/templates.
- Custom studies.
- Multi-pane professional chart UX.

If we do, Meridian must implement the TradingView Datafeed API:

- `onReady` — supported resolutions/symbol types.
- `searchSymbols` — token/mint/project search.
- `resolveSymbol` — mint/pair metadata, decimals, session, pricescale.
- `getBars` — OHLCV from GeckoTerminal/Birdeye/our stored candles.
- `subscribeBars` / `unsubscribeBars` — realtime websocket/polling updates.

## Why this improves Meridian

1. **Portfolio stops feeling like a static admin table.** A real curve creates immediate trader feedback: am I up, down, improving, decaying?
2. **Axiom parity for the wallet/portfolio surface.** PnL chart + active positions + history is the minimum expectation for a serious trading terminal.
3. **Better trust model.** We can label every chart as `modeled`, `estimated`, or `high confidence`, instead of pretending partial wallet history is perfect.
4. **Reusable chart core.** Same chart wrapper can power portfolio PnL, token OHLCV, paper-runner equity curve, spread capture, volume, inventory, and drawdown.
5. **Dry-run-first alignment.** This improves the product/read layer without touching live execution or money movement.

## Risks / gotchas

- Lightweight Charts is client-side only; use a Next client component with dynamic import if SSR causes issues.
- Time format matters: Lightweight Charts accepts business-day strings like `YYYY-MM-DD` or unix timestamps depending on series needs.
- PnL quality is only as good as our fills. Local flow events are not the same as full wallet-attributed realized PnL.
- Current code converts using current SOL price; high-confidence historical PnL needs event-time pricing.
- Need TradingView attribution for Lightweight Charts.
- Full Charting Library / Trading Platform is proprietary; do not assume we can bundle it like an npm package without license/access.

## Concrete next step

Implement Phase 1 + 2:

1. Add `lightweight-charts`.
2. Create `/api/portfolio/timeseries` from `store.flowEvents`.
3. Create `PortfolioPnlChart.tsx` client component.
4. Replace `portfolioChartPlaceholder` in `portfolio/page.tsx`.
5. Add tests for timeseries aggregation and run `pnpm web:check` + `pnpm web:build`.

This is the highest-leverage improvement: visually large product upgrade, low execution risk, no live-trading risk, and directly aligned with Axiom-style portfolio UX.
