# Trading Terminal Next Panel Upgrade Prompt — 2026-08-02

## Context

Meridian’s `/sniper` Trading Terminal has gone through several UI/layout passes:

1. Main checklist/readiness clutter was moved out of the main terminal flow into a temporary `Checklist` tab inside `TerminalInfoBooth`.
2. The terminal shell, graph area, live trade feed, and holder/info sections were enlarged.
3. `FastTradeFeed` received a stable empty/loading shell so the chart/live-feed area does not collapse before a contract is scanned.
4. `ExecutionDock` was redesigned from a loose vertical stack into a more structured trading ticket with sections:
   - Wallet routing
   - Direction
   - Size
   - Instant tools
   - Order controls
   - Action section
5. A final polish pass attempted to remove the trading panel’s main internal scrollbar and make the ticket denser.

Production URL:

- `https://solana-spl-market-maker.vercel.app/sniper`

Important files:

- `apps/web/app/sniper/components/ExecutionDock.tsx`
- `apps/web/app/sniper/components/TradingTokenLoader.tsx`
- `apps/web/app/sniper/components/FastTradeFeed.tsx`
- `apps/web/app/sniper/components/TerminalInfoBooth.tsx`
- `apps/web/app/sniper/page.tsx`
- `apps/web/app/globals.css`

## User Feedback

The user likes the direction somewhat, but the trading panel is still not professional enough. Specific feedback:

- The trading panel is still showing badly.
- It needs better buttons, boxes, outline structure, and content display.
- It should not require using a scrollbar inside a small box.
- Everything important should be visible up front and formatted properly.
- There is too much empty or awkward space when the layout is not balanced.
- Next pass should review real trading panels and make professional adjustments, not just stretch the current UI.

## Benchmark Direction

Use Axiom / Photon / BullX / Padre-style trading terminals as inspiration, but do not copy blindly.

Common high-quality pattern:

- One-glance order ticket.
- Wallet/status at the top.
- Dominant Buy/Sell segmented control.
- Amount input and quick presets immediately visible.
- Slippage / priority / MEV / mode controls compact but readable.
- Route/quote preview near the action buttons.
- Clear disabled/live gate state.
- No trapped main ticket scrollbar.
- Advanced or rarely used controls can be collapsed, popovered, or moved lower, but core trade controls must remain above the fold.

## Primary Objective

Refactor the trading panel into a professional no-inner-scroll order ticket that looks intentional, balanced, and usable at first glance.

This is a UI/UX/layout pass only unless a tiny local state/display change is required for presentation. Do not change execution semantics.

## Required Improvements

### 1. Remove the main boxed scrollbar completely

The main trading ticket itself must not be an independently scrollable box.

Allowed:

- Page scroll.
- Explicit dropdown/popover scroll when opened, such as wallet dropdown or preset editor.

Not allowed:

- `ExecutionDock`, `premiumOrderCard`, `axiomOrderTicket`, or `redesignedTradePanel` trapping the user in a mini scroll container.

Audit CSS conflicts carefully. There are many layered `!important` rules in `globals.css`; later overrides may be fighting older terminal CSS.

### 2. Reduce vertical bloat

The current section-card approach is better organized but may be too tall. Compress it into fewer, stronger groups:

Recommended structure:

1. Header/status row
   - Paper/live gate state
   - Selected wallet summary
   - Optional wallet dropdown button
2. Buy/Sell + amount block
   - Large Buy/Sell segmented control
   - Amount input
   - SOL/% toggle
   - Quick presets
3. Controls block
   - Market / Limit / TP / SL / Bundle
   - Slippage
   - Priority
   - MEV disabled/read-only indicator
   - Trigger price only when needed
4. Route/action block
   - Route/impact/tx window
   - Preview quote / paper preflight / store paper order button
   - Live disabled / no broadcast disabled button
   - Footer status: preview-only, no tx build, or quote result

Do not keep six equally large boxes if it makes the ticket too long.

### 3. Improve button hierarchy

Buttons should communicate priority visually:

- Buy/Sell: largest, highest contrast.
- Presets: compact chips/cards, clear selected state.
- Preview/paper action: primary CTA.
- Live disabled/no broadcast: visibly disabled and secondary.
- Wallet dropdown / instant trade: utility buttons, not competing with main CTA.

### 4. Make boxes look like a polished product, not debug panels

Use fewer borders, stronger grouping, tighter spacing, and consistent radii.

Avoid:

- Too many nested boxes.
- Too many numbered mini headers if they create visual noise.
- Huge empty card surfaces.
- Controls that look disconnected from their labels.

Prefer:

- One strong card shell.
- 3–4 internal zones.
- Clear typography hierarchy.
- Compact labels.
- Stable alignment.

### 5. Preserve graph/live-feed balance

The chart, side live-feed shell, and trading panel should feel like one cockpit.

Check:

- `/sniper` before token is scanned.
- `/sniper` after token is loaded.
- A public mint such as `So11111111111111111111111111111111111111112` for route/feed smoke.

The feed shell should still reserve space before data is loaded.

### 6. Avoid backend/provider wiring in this pass

Do not implement new trading backend behavior in this upgrade. Backend/provider wiring is a separate future prompt:

- `docs/TERMINAL_TAB_BACKEND_WIRING_PROMPT_2026-08-02.md`

## Safety Constraints

Absolutely preserve:

- `LIVE_TRADING_ENABLED=false` unless separately and explicitly approved.
- No live signing.
- No swap build activation.
- No transaction broadcast.
- No wallet funding or key mutation.
- No env/secret mutation.
- No GMGN swap/cooking/private-key paths.
- GMGN remains read-only: `read-only-cli-adapter-no-swap-no-cooking`.
- Honest live state labels: paper-only, quote-preview, no signing, no broadcast.

Do not weaken:

- browser-wallet signing gate
- explicit broadcast gate
- same-origin/mutation-disable/operator-auth gates
- `/api/execution-capabilities` live disabled behavior
- `/api/pre-live-resolution` read-only safety contract

## Verification Required

After changes, run:

```bash
pnpm web:check
pnpm web:build
```

If the change unexpectedly touches shared types or backend code, also run:

```bash
pnpm check
pnpm test
```

Before deployment, verify source expectations:

- `ExecutionDock.tsx` still has the live-disabled button disabled.
- No new live signing/swap/broadcast logic was added.
- `FastTradeFeed` still uses read-only `/api/terminal/trade-feed`.
- `TerminalInfoBooth` still has `Checklist` and does not re-add `Trades Table`.

If deploying to Vercel, smoke-check production:

```bash
BASE='https://solana-spl-market-maker.vercel.app'
curl -sS -o /tmp/sniper.html -w '%{http_code}\n' "$BASE/sniper"
curl -sS "$BASE/api/execution-capabilities" | jq '{liveTradingEnabled, disabledReason}'
curl -sS "$BASE/api/pre-live-resolution" | jq '{liveExecutionAllowed, execution, status}'
curl -sS "$BASE/api/terminal/trade-feed?mint=So11111111111111111111111111111111111111112&limit=5" | jq '{status, execution, rows: (.rows | length)}'
```

Expected safety smoke:

- `/sniper` returns 200.
- `liveTradingEnabled:false`.
- `liveExecutionAllowed:false`.
- `/api/pre-live-resolution.execution` is `read-only-resolution-matrix-no-signing-no-swaps-no-broadcasts`.
- Trade feed execution is `read-only-trade-feed-no-trading`.

## Suggested Implementation Approach

1. First inspect current `ExecutionDock.tsx` and all relevant CSS around:
   - `.premiumExecutionDock`
   - `.premiumOrderCard`
   - `.axiomOrderTicket`
   - `.terminalTradeOnlyPanel`
   - `.redesignedTradePanel`
   - `.tradePanelSection`
   - `.compactTradeGrid .premiumExecutionDock`
2. Identify conflicting old scroll/max-height rules in `globals.css`.
3. Prefer replacing/overriding the panel with a compact 3–4 zone system rather than adding more nested styling.
4. Keep the main CTA and live-disabled button visible without internal scrolling.
5. Test at wide desktop and narrower desktop breakpoints.
6. Deploy only after explicit user approval.

## Success Definition

The next version should feel like a real professional trading ticket:

- no awkward internal scrollbar,
- no debug-card feel,
- strong Buy/Sell and action hierarchy,
- all critical controls visible upfront,
- balanced next to the enlarged graph/live-feed area,
- live safety unchanged.
