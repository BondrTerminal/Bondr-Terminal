# Meridian Trading Terminal Layout / Resizing Prompt — 2026-08-02

You are working in `/Users/yakuzamoto/.openclaw/workspace/projects/solana-spl-market-maker`.

## Objective

This is **not** a feature-change session and **not** a backend-wiring session. This is a layout, sizing, organization, and navigation QA task for the Trading Terminal page.

The terminal formatting is now directionally good, especially the new Axiom-style info tabs. The next job is to make the terminal feel like a full-page trading cockpit instead of a page with multiple checklist/info blocks stacked above and around it.

Primary goals:

1. Remove/reorganize useless repeated checklist/readiness sections from the main Trading Terminal view.
2. Create a temporary **Checklist** tab/panel for activation/readiness information. This can be deleted later when the project is complete.
3. Resize/restructure the terminal so the chart, live trade feed, execution dock, and holder/info tabs use more of the viewport.
4. Give more room to live data and the Holder section.
5. Enlarge the live trade feed so numbers/letters are easier to read.
6. Check whether key buttons/links work and point to correct paths.
7. Preserve all existing safety gates and live-disabled behavior.

## Non-negotiable Safety Constraints

- Do **not** enable live trading.
- Do **not** add signing, swap execution, broadcast, wallet funding, token deployment, provider/env mutation, or wallet/key mutation.
- Keep `LIVE_TRADING_ENABLED=false` behavior intact.
- Instant Trade remains quote-preview/gated only.
- This pass is layout/organization/button-routing QA only.
- Do not remove safety information entirely; move it into a temporary Checklist tab/panel.

## Current Situation / My Overview

Current `/sniper` page still contains several high-level sections before the actual terminal surface:

- Project terminal handoff banner.
- `MeridianStatusBadge`.
- Terminal live-readiness banner/grid.
- Pre-live activation checklist block with many rows.
- Then chart/token loader + execution dock.
- Then `TerminalInfoBooth` tabs.

This creates two problems:

1. **The real terminal starts too low.** The operator has to scroll past readiness/admin information before getting to the trading cockpit.
2. **The terminal is vertically compressed.** The live feed, chart, and holders area do not get enough visual priority.

The right organization is:

- Main `/sniper` view should prioritize the trading cockpit.
- Checklist/readiness should be available, but hidden in a dedicated temporary Checklist tab/panel.
- The operator should immediately see: token loader/chart area, live trade feed, execution dock, and the Axiom-style info tabs.

## Main Files to Inspect

- `apps/web/app/sniper/page.tsx`
- `apps/web/app/sniper/components/TerminalInfoBooth.tsx`
- `apps/web/app/sniper/components/TradingTokenLoader.tsx`
- `apps/web/app/sniper/components/FastTradeFeed.tsx`
- `apps/web/app/sniper/components/ExecutionDock.tsx`
- `apps/web/app/sniper/components/TerminalTopBar.tsx`
- `apps/web/app/sniper/components/PreLiveDryRunAction.tsx`
- `apps/web/app/components/MeridianStatusBadge.tsx`
- `apps/web/app/globals.css`

## Desired Page Structure

### 1. Make `/sniper` a true full-page terminal

Restructure the page so the main trading UI occupies the page immediately.

Recommended hierarchy:

```tsx
<main className="terminalMainSurface">
  <div className="terminalFullscreenShell">
    <TerminalTopBar / compact project + status strip />
    <section className="terminalWorkspaceGrid">
      <section className="terminalMarketColumn">
        <TradingTokenLoader />
      </section>
      <aside className="terminalExecutionColumn">
        <ExecutionDock />
      </aside>
    </section>
    <TerminalInfoBooth />
  </div>
</main>
```

The top project/status strip should be compact — one row if possible — not large cards.

### 2. Move readiness/checklist into a temporary Checklist panel/tab

Remove the large activation/checklist sections from the main visible page flow:

- `MeridianStatusBadge` can become compact top-strip info or move into Checklist.
- Terminal live-readiness banner can move into Checklist.
- Pre-live activation checklist rows can move into Checklist.
- `PreLiveDryRunAction` can move into Checklist.

Create either:

Option A — preferred if simple:
- Add `Checklist` as a tab inside `TerminalInfoBooth`.
- This tab shows the readiness/checklist/dry-run information.
- It should be marked temporary: “Temporary pre-live checklist — remove when product is complete.”

Option B:
- Add a collapsible right/top drawer named `Checklist`.
- Default collapsed.
- Opens on button click.

Recommendation: **Option A**, because the info tab system already exists.

Suggested final tabs:

- Positions
- Orders
- Holders
- Top Traders
- Dev Tokens
- Only Tracked
- Instant Trade
- Checklist

Do not re-add `Trades Table` as a tab. Live trade feed is separate.

### 3. Resize the terminal workspace

Current terminal should fulfill more of the viewport without causing overflow bugs.

Targets:

- Main shell width: use nearly full viewport, e.g. `width: min(100%, 1880px)` or similar.
- Reduce excessive margins/padding around `/sniper`.
- Use `min-height: calc(100vh - headerOffset)` for the terminal shell where safe.
- Prevent horizontal page overflow.
- All tables/buttons/tabs must remain usable at desktop and laptop widths.
- Mobile can horizontally scroll dense tables; desktop should feel spacious.

### 4. Give live data / holder section more room

The holder/info tab area is critical. Increase its available height/width.

Requirements:

- `TerminalInfoBooth` should feel like a major panel, not a footer.
- Holders table should have more vertical space before scrolling.
- Keep sticky table headers if possible.
- Keep tab buttons stable — no wrapping/overlapping.
- If needed, split terminal into:
  - top row: chart + execution dock
  - bottom row: large info booth
- Bottom info booth should likely take 45–55% of the vertical space on large screens.

### 5. Enlarge live trade feed

The live trade feed is currently too small: numbers/letters are hard to read.

In `FastTradeFeed.tsx` / CSS:

- Increase row font size slightly.
- Increase row height/padding.
- Increase max-height of feed table.
- Make columns easier to read: Age, Side, Size, USD, Price, Wallet, Tx.
- Make buy/sell color coding stronger but not obnoxious.
- Keep compact mode if used, but compact should still be readable.
- Do not duplicate the feed in an info tab.
- If implementing open/close behavior, do it as a future-safe toggle/button, but do not spend too much time. User said as long as live trade feed works, separate Trades Table tab is unnecessary.

### 6. Button/link routing QA

Do an overview of buttons and links on `/sniper` and make sure they work or are honestly disabled.

Check at minimum:

Page-level links:
- Open Deployment → `/deployment?project=<id>` when project exists.
- Manage wallets → `/wallets?project=<id>` when project exists.
- View Portfolio → `/portfolio?project=<id>&mint=<mint>` when mint exists.

Token loader buttons:
- Load token should fetch token intel/market/feed/snapshot and emit `meridian-token-loaded`.
- Copy mint should work if present.
- External links should open correct DexScreener/Solscan URLs.

Live feed:
- Refresh/polling should continue working.
- Tx links should open Solscan tx URLs.

Execution dock / Instant Trade:
- Preview quote should call `/api/execution-quote` only.
- Disabled/live gate copy must remain clear.
- No button should imply real “Buy now” while live disabled.

Terminal info tabs:
- All tabs clickable.
- Holder filters/search/sort work locally.
- Instant Trade tab quote preview works.
- Checklist tab opens and contains moved readiness information.

If a button cannot function yet because backend/provider is missing, make it disabled or label it “coming soon/read-only/provider required” rather than leaving a broken CTA.

## Specific Layout Recommendations

CSS/classes may differ, but target behavior should be:

- `.terminalMainSurface` — less vertical padding, full-width terminal background.
- `.premiumTerminalShell` / new `.terminalFullscreenShell` — wider max-width and tighter gaps.
- `.compactTradeGrid` / `.terminalWorkspaceGrid` — chart/feed column should be larger than execution dock.
- `.terminalChartColumn` — allow chart + live feed to breathe; do not cap live feed at tiny height.
- `.liveTradeFeedBox` / `.axiomTapeTable` — larger font and max-height.
- `.axiomIntelBooth` — more vertical room and not visually buried.
- `.axiomIntelTabs` — 8 columns if Checklist is added; responsive fallback at narrower widths.
- `.axiomIntelTableWrap` — sensible max-height with scroll inside table, not full page overflow.

Avoid fragile fixed heights everywhere. Prefer:

- `minmax()`
- `clamp()`
- `calc(100vh - Xpx)`
- `overflow: auto` on inner panels
- `min-width: 0` on grid children

## Checklist Tab Content

The temporary Checklist tab should include compact versions of:

- Project context / selected project / selected mint.
- `MeridianStatusBadge` information or equivalent state.
- Wallet live readiness summary.
- RPC/auth/live signing status.
- Pre-live checklist rows.
- `PreLiveDryRunAction`.
- Link to `/api/pre-live-resolution`.

It should explicitly say:

> Temporary pre-live checklist. Keep until Meridian is fully complete; remove once all live readiness surfaces are relocated or no longer needed.

## Acceptance Criteria

1. `/sniper` opens directly into a spacious trading terminal, not a stack of readiness cards.
2. Activation/pre-live checklist info is still accessible in a temporary Checklist tab/panel.
3. Terminal uses more of the viewport width and height without horizontal page overflow.
4. Live trade feed is visibly larger and easier to read.
5. Holder/info section has more space and remains stable.
6. Tabs/buttons do not overlap, wrap badly, or become unclickable.
7. Key buttons/links route correctly or are clearly disabled/marked read-only.
8. No live trading/signing/swap/broadcast behavior is added.
9. Verification passes:
   - `pnpm check`
   - `pnpm web:check`
   - `pnpm test`
   - `pnpm web:build`
10. If production deploy is requested separately, smoke-check:
   - `/sniper`
   - `/api/execution-capabilities`
   - `/api/pre-live-resolution`
   - live feed route `/api/terminal/trade-feed?mint=<known mint>` if a known mint is available.

## Final Report Required

Report:

- Files changed.
- What was moved out of the main page flow.
- Where the temporary Checklist tab/panel lives.
- What sizing/layout changes were made.
- Button/link QA findings.
- Safety gates preserved.
- Verification results.
- Deployment status.
