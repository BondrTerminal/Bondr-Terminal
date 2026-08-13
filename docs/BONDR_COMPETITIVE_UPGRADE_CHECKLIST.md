# BONDR Competitive Upgrade Checklist

_Last updated: 2026-08-13_

Goal: bring BONDR Terminal up to Axiom / Photon / Padre / BullX competitive quality while preserving BONDR's unique lane: **Solana launch + liquidity + intelligence command center**, not just an ape terminal clone.

Current baseline: production A-profile quote/build/simulation/browser-wallet signing has been user-verified. Broadcast and deployment remain disabled. Wallet Ops persistence is Postgres-backed in production, and `/api/wallet-rail` is the canonical runtime wallet source.

Core rules:
- No fake/demo/random metrics unless visibly degraded/unavailable.
- Preserve safety: browser-wallet signing only after simulation, no server custody, no hidden swaps, broadcast/deployment gated.
- Use canonical backend truth layers: `/api/wallet-rail` for runtime wallet identity and `/api/terminal/snapshot` plus normalized supporting routes for market data.
- Keep BONDR palette strict: black `#000000`, linen `#F9EBE0`, tangerine `#FF7F11`, ember `#BA1200`, emerald `#23CE6B`.
- Generic actions stay neutral; buy/pass/healthy = emerald; sell/fail/risk = ember.
- Batch changes, then verify with `pnpm web:check`, `pnpm web:build`, terminal snapshot contract, and hardwire check.
- Do not carry forward stale provider-limit language when QuickNode/current provider checks succeed.

---

## Phase 0 — Baseline audit and protection

- [ ] Capture current production screenshots/pages: `/`, `/sniper`, `/wallets`, `/projects`, `/project-dashboard`, `/deployment`, `/token-analyzer`.
- [ ] Run and save baseline checks:
  - [ ] `pnpm web:check`
  - [ ] `pnpm web:build`
  - [ ] `pnpm --filter @soulana/market-maker-web check:terminal-snapshot`
  - [ ] `node scripts/check-terminal-hardwire.mjs`
- [ ] Pick 2 active Solana token mints for repeatable production/local testing.
- [ ] Verify current production `/api/provider-readiness` and `/api/terminal/snapshot?mint=<ACTIVE_MINT>`.
- [ ] Confirm no secrets are exposed in provider-readiness or snapshot responses.
- [ ] Confirm A-profile signing path still works in production.
- [ ] Confirm broadcast remains disabled.
- [ ] Confirm deployment remains disabled.
- [ ] Confirm `/api/wallet-rail` is the displayed runtime wallet source.
- [ ] Confirm `pnpm web:check`; known risk is `apps/web/app/api/projects/route.ts` unless already fixed.

Deliverable: baseline note in `docs/BONDR_COMPETITIVE_UPGRADE_LOG.md`.

---

## Phase 1 — Terminal cockpit header

Build a dense, trader-native token cockpit at the top of `/sniper`.

Required fields:
- [x] Token logo/avatar fallback.
- [x] Symbol/name.
- [x] Mint with copy button.
- [x] Pair/dex label.
- [x] Price USD.
- [x] Market cap / FDV.
- [x] Liquidity.
- [ ] 5m / 1h / 24h change. _(24h implemented in cockpit; 5m/1h needs snapshot fields/provider support.)_
- [x] 24h volume.
- [x] Buys/sells.
- [x] Holder count.
- [x] Top 10 holder %.
- [x] LP status.
- [x] Risk badge.
- [x] Provider source/degraded badge.

Backend requirements:
- [x] Read from canonical normalized snapshot.
- [x] Prefer Solana Tracker where available, fallback safely.
- [x] Do not render invented values; use `—` plus source status.

UX requirements:
- [x] One-screen readable on desktop.
- [x] Clean compressed mobile/tablet state.
- [x] Active token clearly visible at all times.

---

## Phase 2 — Execution dock to trader-grade controls, still gated

Upgrade `/sniper` execution panel so it feels competitive while preserving safety.

Controls:
- [ ] Buy/Sell tab selector.
- [ ] Amount presets: `0.1`, `0.25`, `0.5`, `1`, custom SOL/USDC.
- [ ] Percent sell presets: `25%`, `50%`, `75%`, `100%`.
- [ ] Slippage input/presets.
- [ ] Priority fee input/presets.
- [ ] Route/quote preview.
- [ ] Price impact.
- [ ] Estimated receive.
- [ ] Wallet selector using `/api/wallet-rail` as runtime truth.
- [ ] A-profile signing/broadcast-disabled mode badge.
- [ ] Required gate checklist.
- [ ] Disabled broadcast state with exact reason.
- [ ] Paper execute button where safe.

Backend/API:
- [x] `/api/execution-quote` supports normalized quote preview in the proven A-profile path.
- [x] `/api/execution-capabilities` exposes signing enabled / broadcast disabled / deployment disabled gates.
- [ ] `/api/terminal/live-readiness` feeds live gate UI everywhere.
- [ ] Terminal repeats the proven quote → unsigned build → simulation → browser-wallet sign path.
- [ ] No broadcast unless future B-profile gate is explicitly approved.

---

## Phase 3 — Trade feed and chart polish

Trade feed:
- [ ] Real-time-looking compact rows.
- [ ] Buy rows emerald, sell rows ember.
- [ ] Columns: age, side, size, USD, price, wallet, tx.
- [ ] Source/provider confidence visible.
- [ ] Net flow summary: buy volume, sell volume, net.
- [ ] Whale trade highlight.
- [ ] Empty/degraded state explains provider gap.

Chart:
- [ ] Confirm current chart provider behavior.
- [ ] Add timeframe controls: 1m / 5m / 15m / 1h / 4h.
- [ ] Show provider degraded state.
- [ ] Avoid fake candles.

Backend:
- [ ] Improve `/api/terminal/trade-feed` freshness/status.
- [ ] Add Solana Tracker trades if endpoint is confirmed.
- [ ] Keep Birdeye/Helius/Pump.fun/Gecko fallbacks.

---

## Phase 4 — Intelligence tabs: holders, traders, risk, liquidity

Tabs/panels:
- [ ] Overview.
- [ ] Holders.
- [ ] Top traders.
- [ ] Dev wallet.
- [ ] Snipers/bundles.
- [ ] LP/liquidity.
- [ ] Provider/system.

Holders:
- [ ] Ranked holders table.
- [ ] Concentration stats.
- [ ] Top 10/20/50 %.
- [ ] Dev/KOL/risk tags.
- [ ] Holder source/degraded status.

Top traders:
- [ ] Buy/sell counts.
- [ ] Volume.
- [ ] Estimated PnL where provider-backed.
- [ ] Fresh wallet labels.
- [ ] Copy wallet/address actions.

Risk:
- [ ] One clear verdict: Pass / Watch / Risk / Avoid.
- [ ] Reasons list.
- [ ] Dev sold.
- [ ] LP lock/burn/model status.
- [ ] Bundler/sniper estimate.
- [ ] Insider wallet graph confidence.

Liquidity:
- [ ] Pool model: CPMM / CLMM / DLMM.
- [ ] Liquidity USD.
- [ ] LP lock/burn if applicable.
- [ ] Position-owner concentration if position model.
- [ ] Pool age/migration context.

---

## Phase 5 — Discovery layer

Competitors win because users see opportunities immediately. BONDR needs a discovery surface.

Add/upgrade Hub or dedicated Discover module:
- [ ] Trending tokens.
- [ ] Hot searches.
- [ ] New launches.
- [ ] Pump.fun migrations/final stretch.
- [ ] Recently scanned.
- [ ] Watchlist/favorites.
- [ ] Risk-filtered candidates.
- [ ] Active volume spikes.
- [ ] Liquidity-added tokens.

Filters:
- [ ] Chain/source.
- [ ] Market cap range.
- [ ] Liquidity range.
- [ ] Age.
- [ ] Volume.
- [ ] Holder concentration.
- [x] LP status.
- [ ] Dev sold/no dev sold.

Backend:
- [ ] Use GMGN + Solana Tracker + existing providers where available.
- [ ] Cache/rate-limit discovery responses.
- [ ] No recommendation without risk status.

---

## Phase 6 — Real favorites, alerts, and recents

Header placeholders must become real or be clearly disabled.

Favorites:
- [ ] Persist favorite mints.
- [ ] Add/remove from token cockpit.
- [ ] Favorites dropdown/page.
- [ ] Store locally first, DB later.

Recents:
- [ ] Persist recently scanned tokens.
- [ ] Show on Hub/Terminal.

Alerts:
- [ ] Alert model: price, volume, liquidity, risk, migration, wallet activity.
- [ ] UI for create/list/delete alert.
- [ ] Local/paper alert state first.
- [ ] Backend durable alerts later, using Postgres-backed storage when promoted from local/paper state.
- [ ] No fake notification count.

---

## Phase 7 — Wallet/portfolio competitiveness

Wallets:
- [ ] Cleaner wallet table.
- [ ] Wallet labels/groups.
- [ ] Balances.
- [ ] Token holdings.
- [ ] Funding readiness.
- [ ] Copy address.
- [ ] Archive/active clarity.

Portfolio:
- [ ] Open positions.
- [ ] Realized PnL.
- [ ] Unrealized PnL.
- [ ] Trade history.
- [ ] Provider-backed confidence labels.
- [ ] PnL chart.
- [ ] Project-level portfolio view.

Backend:
- [ ] Strengthen provider-backed fills.
- [ ] Cache wallet fills safely.
- [ ] Distinguish modeled vs provider-backed PnL.

---

## Phase 8 — Project/deployment/operator fixes

User has separate fixes planned here. Preserve these for after terminal core unless a page breaks.

Areas:
- [ ] Operator auth/login state.
- [ ] Deployment page flow.
- [ ] Project create/edit flow.
- [ ] Project dashboard status model.
- [ ] Project-to-terminal context binding.
- [ ] Wallet group assignment.
- [ ] Asset/upload/token metadata workflow.
- [ ] Launch config readiness.

Principle: these are BONDR's moat. Competitors do not usually have this operator pipeline.

---

## Phase 9 — Backend capacity and reliability

Provider layer:
- [ ] Confirm current production provider stack and keys in Vercel, including QuickNode if configured.
- [ ] Remove stale Helius quota-limit assumptions when current provider checks succeed.
- [ ] Confirm Solana Tracker real API key/base URL in Vercel.
- [ ] Add endpoint-specific Solana Tracker support after docs verification.
- [ ] Add provider timeout normalization everywhere.
- [ ] Add sourceStatus to every major normalized section.

Caching:
- [ ] Cache token snapshot fragments.
- [ ] Cache provider readiness.
- [ ] Cache chart/trade feed responsibly.
- [ ] Avoid hammering providers.

Durability:
- [ ] DB-backed favorites.
- [ ] DB-backed alerts.
- [ ] DB-backed orders/intents/audit logs.
- [ ] DB-backed paper ledger.

Observability:
- [ ] API error logging.
- [ ] Provider latency summaries.
- [ ] Degraded provider dashboard.
- [ ] Smoke route for active mint.

Security:
- [ ] No secret exposure.
- [ ] Operator auth required for mutations.
- [ ] Live execution gated.
- [ ] Mutation audit logs.
- [ ] Transaction intent hash checks.

---

## Phase 10 — Final competitive polish

- [ ] Consistent dense spacing.
- [ ] No old Meridian blue/gold/purple/gradients.
- [ ] Better active nav/tab states.
- [ ] Better skeletons/loading states.
- [ ] Better empty/degraded states.
- [ ] Mobile layout sanity.
- [ ] Keyboard shortcuts.
- [ ] Copy/share token report.
- [ ] One-click open Solscan/DexScreener/GMGN links.
- [ ] App-wide command/search bar.
- [ ] Final production smoke and visual QA.

---

## Suggested execution order

1. Terminal cockpit header.
2. Execution dock controls.
3. Trade feed/chart polish.
4. Intelligence tabs.
5. Discovery layer.
6. Favorites/alerts/recents.
7. Wallet/portfolio polish.
8. Operator/deployment/project/dashboard fixes.
9. Backend reliability and durability.
10. Final polish.

This order makes BONDR feel competitive fastest while preserving the deeper operator moat.
