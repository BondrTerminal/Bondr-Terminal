# BONDR Terminal UI / Routing / Front-End Audit

_Last updated: 2026-08-13_

## Objective

Make BONDR Terminal easier to understand and safer to operate: fewer misleading action labels, less repeated wallet clutter, clearer route hierarchy, and honest beta-state copy.

Core UX rule for this pass: **if it is confusing, it is hard to use**. Every primary surface should make the next safe action obvious.

## Safety Constraints Preserved

- Turnkey remains account/auth only.
- Browser wallet remains the signing wallet.
- Simulation remains required before signing tests.
- Broadcast remains disabled.
- Deployment remains disabled.
- Funding, claims, payouts, server signing, live swaps, and private-key custody remain disabled.
- Logged-out app shell remains gated; `/whitepaper` remains public.

## Pages Audited

| Route | Result | Notes |
| --- | --- | --- |
| `/` | Cleaned | Hub labels now use live-data / execution-gated language instead of live-operation wording. Dead social placeholders removed. |
| `/sniper` | Cleaned | Product-facing language favors Terminal, Quote Preview, Build + simulate, Local sign test. Broadcast submit remains disabled. |
| `/liquidity` | Reviewed | Still the flagship intelligence surface; avoid implying autonomous funded execution until gates change. |
| `/deployment` | Reviewed / partially renamed | Shell and cross-links now call it Launch Prep to reduce live-deploy ambiguity. Existing route remains `/deployment`. |
| `/wallets` | Cleaned | Copy now separates Turnkey account login, browser-wallet signing, and watch-only public records. |
| `/projects` | Cleaned | Project CTAs now route to Launch Prep instead of saying Deploy. Realized PnL label changed to Stored net SOL. |
| `/portfolio` | Cleaned | Trade links now say Open Terminal. |
| `/token-analyzer` | Reviewed | Good due-diligence boundary; future actions should remain visually distinct from live controls. |
| `/project-dashboard` | Known issue | This route reuses the Projects page. Keep as compatibility route for now or build a real accounting surface later. |
| `/profile` | Reviewed | Working auth/session page. Future cleanup should make Identity / Operator session / Browser wallet a simple checklist. |
| `/whitepaper` | Public | Still allowed as logged-out public documentation. |

## Fixes Made

### Navigation / Routing Presentation

- Main nav reduced to clearer primary workflow labels:
  - Hub
  - Terminal
  - Liquidity
  - Launch Prep
  - Wallet Ops
  - Projects
  - Portfolio
- Removed duplicate Wallets / Wallet Ops emphasis from the header action area.
- Tools menu now carries secondary surfaces:
  - Token Analyzer
  - Project Dashboard
  - Whitepaper
- Cross-links that previously said `Deploy` now say `Launch Prep`.
- Portfolio and wallet-table links that previously said `Trade` now say `Open Terminal`.

### Wallet Ops Clarity

- Wallet page hero now states the actual custody model:
  - Turnkey = account login
  - Phantom/Solflare = browser signing
  - Wallet Ops = public watch-only records for matching/labels/balances
- Removed disabled `Create Local Wallet` and `Import Local Wallet` buttons from the Wallet Ops action bar.
- Renamed export action toward public record export instead of backup/private-key language.
- Compact wallet rail is now the default outside the live-beta test harness.
- Wallet rail default view shows the essential four items only:
  - Connected signer
  - Selected wallet
  - Connected SOL balance
  - Balance status
- Detailed wallet rail diagnostics remain available in the dedicated live-beta test surface.

### Misleading Execution Copy Reduced

- `Live operations` became `Live data, execution gated`.
- `Live wired` became `Data wired`.
- `Instant Trade` became `Quote Preview`.
- `Sign in wallet` became `Local sign test`.
- `Submit transaction` copy was softened where visible in disabled contexts.
- Project `Realized PnL` label became `Stored net SOL` because the current table is stored flow accounting, not full realized PnL.

## Remaining Known Issues / Follow-Up

1. `/project-dashboard` currently reuses `/projects`. Either remove it from secondary nav later or make it a true accounting dashboard.
2. `/deployment` still has many panels. A future pass should collapse deep monitors/logs/guardrails into accordions and make the primary flow: Project → Readiness → Config → Simulation Preview.
3. `/profile` should eventually become a simple checklist: Identity, Operator session, Browser wallet, Signing test.
4. Phantom wallet login with Turnkey remains non-blocking because email/passkey auth works; keep as dashboard/config follow-up, not critical path.
5. Manual browser QA is still required for true visual overlap/glitch validation across logged-in desktop/tablet/mobile states.

## Manual QA Checklist

- Logged out `/` shows public BONDR landing only.
- Logged out protected routes show landing, not app nav.
- Email login opens terminal shell and keeps nav stable on tab switch.
- Header nav does not wrap badly at desktop/tablet widths.
- Wallet rail compact view does not dominate pages.
- Wallet Ops does not present private-key custody as an available beta path.
- Deployment/Launch Prep does not imply live launch execution.
- Terminal actions read as preview/simulate/local signing, not live swap/broadcast.
- No debug auth panel appears unless `?debugAuth=1` is present.
