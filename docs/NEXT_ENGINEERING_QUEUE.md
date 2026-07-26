# Next Engineering Queue

_Last updated: 2026-07-19 19:32 EDT_

## Current phase

We are in **post-install dry-run/read-only hardening**.

Dependencies are installed for the market-maker core and web scaffold, native builds are approved only where needed, TypeScript compiles, tests pass, SQLite loads, the Vercel web app builds, local config exists, read-only observation runs, and the beta dashboard reads safe status and paper-session report data. The generated fixture report and the real read-only observed paper report path both write safe dashboard artifacts. No live trading. No keys. No funded wallets.

## Added since the first status pass

- Fill ledger helpers in `src/ledger/fills.ts`.
- Fill ledger tests in `test/fills-ledger.test.ts`.
- Drawdown enforcement helpers in `src/risk/drawdown.ts`.
- Drawdown tests in `test/drawdown.test.ts`.
- Multi-level quote planner in `src/quote/levels.ts`.
- Quote level tests in `test/quote-levels.test.ts`.
- Deterministic one-step runtime loop in `src/runtime/loop.ts`.
- Runtime loop tests in `test/runtime-loop.test.ts`.
- Paper-only Phoenix/OpenBook adapters via `src/venue/phoenix-paper.ts`, `src/venue/openbook-paper.ts`, and shared `src/venue/paper-adapter.ts`.
- Paper adapter tests in `test/paper-venue-adapters.test.ts`.
- Runtime state persistence helpers in `src/runtime/state.ts`.
- Runtime state tests in `test/runtime-state.test.ts`.
- Paper quote placement helpers in `src/runtime/paper-quotes.ts`.
- Paper quote placement tests in `test/runtime-paper-quotes.test.ts`.
- Paper fill simulation helpers in `src/runtime/paper-fills.ts`.
- Paper fill simulation tests in `test/runtime-paper-fills.test.ts`.
- Persistent paper open-order state helpers in `src/runtime/open-orders.ts`.
- Open-order persistence tests in `test/open-orders.test.ts`.
- Paper cancel/replace cycle helpers in `src/runtime/cancel-replace.ts`.
- Cancel/replace tests in `test/cancel-replace.test.ts`.
- Paper PnL accounting helpers in `src/runtime/paper-pnl.ts`.
- Paper PnL tests in `test/runtime-paper-pnl.test.ts`.
- `runPaperRuntimeCycle(...)` now returns paper PnL summary alongside cancel/replace and fill summaries.
- Bounded paper runner helpers in `src/runtime/paper-runner.ts`.
- Bounded paper runner tests in `test/paper-runner.test.ts`.
- Cancel/replace no longer stacks new quotes when valid active paper orders are retained.
- Paper risk gates in `src/runtime/paper-risk.ts` consume paper PnL and evaluate paper drawdown/daily-loss limits.
- Paper risk tests in `test/paper-risk.test.ts`.
- `runPaperRuntimeCycle(...)` returns paper risk summary.
- Bounded paper runner stops by default on paper risk block/halt.
- Paper fee/slippage accounting in `src/runtime/paper-fees.ts`.
- Paper fill simulation now records quoted price, executed price, gross notional, net notional, fee amount, slippage attribution, fee bps, liquidity role, and fill count on paper orders.
- Paper PnL now consumes fee-adjusted net fill values when paper fill accounting is present, while preserving gross volumes and total fee/slippage summaries.
- Paper fee tests in `test/paper-fees.test.ts`, with runtime fill/PnL coverage for fee-adjusted accounting.
- Spread-capture accounting in `src/runtime/spread-capture.ts`.
- Bounded paper runner now exposes per-cycle and final spread-capture summaries.
- Spread-capture tests in `test/spread-capture.test.ts`, including matched buy/sell fills, fee-adjusted spread capture, unmatched inventory, empty fills, and secret/signer-shaped field checks.
- Safe paper session report export in `src/runtime/paper-session-report.ts`.
- Bounded paper runner accepts optional `reportPath` and writes a whitelisted paper session report JSON artifact.
- Paper session report tests in `test/paper-session-report.test.ts`, covering report creation, safe serialization, empty sessions, stopped sessions, reportPath wiring, missing files, and secret/signer-shaped field checks.
- Server-side web report reader and `/api/market-maker/report` route for latest safe paper session reports.
- Dashboard paper session report cards for paper PnL, paper risk, spread capture, fill counts, open orders, stop reason, and skipped reasons.
- Report dashboard preserves null fallback when no report exists and remains read-only.
- Paper-only venue fee presets in `src/runtime/paper-fee-presets.ts`.
- Bounded paper runner applies selected paper fee preset/overrides to simulated fill accounting.
- Paper fee preset tests in `test/paper-fee-presets.test.ts`, including preset selection, explicit overrides, invalid bps rejection, runner application, and secret/signer-shaped field checks.
- Deterministic local paper-session fixture generator in `src/runtime/paper-session-fixture.ts`.
- `pnpm paper:report` writes a safe local dashboard report to `runtime/paper-session-report.json` using fixture-specific state/open-order/event files.
- Runtime step summaries now use the input market snapshot timestamp for deterministic paper/replay reports.
- Observed paper-session helper in `src/runtime/observed-paper-session.ts` converts real read-only wallet/market snapshots into a one-cycle bounded paper report.
- Transaction retry/pass policy helper in `src/execution/transaction-retry.ts` classifies future transaction failures before deciding whether to retry or pass.
- `pnpm paper:observe-report -- --config=config/market-maker.local.json` now fetches token info, wallet balances, and Jupiter quote data, then writes `runtime/paper-session-report.json` plus dashboard status without signing or live venue calls.

- Config-level `maxMarketDataAgeMs`.
- Risk check blocks stale market data.
- Config schema rejects `live` mode in foundation v0.
- Config schema rejects `maxTradeSol > maxTotalSolExposure`.
- Quote-plan builder for bid/ask planning without placement.
- PnL/portfolio mark helpers.
- Rate-limit helpers.
- Paper order lifecycle model.
- Metrics snapshot builder.
- Venue adapter types.
- Disabled Phoenix/OpenBook-style orderbook adapter stubs.
- USDC/SOL read-only example config.
- Beta dashboard status/report cards and fallback data.
- Observe script writes `runtime/market-maker-status.local.json` for dashboard consumption.
- Token/RPC/Jupiter options doc.
- `.gitignore` should ignore local config and secret-ish runtime files.

## Highest-priority next steps

1. Verify and replace placeholder Phoenix/OpenBook fee assumptions once the target venue/market is chosen.
2. Decide the protected dashboard auth/session model before adding private operator routes.
3. Keep live execution disabled until the full safety path exists and Yakuzamoto explicitly approves it.
4. Select/fund only a public paper-observation wallet or lower reserve assumptions if we want observed paper reports to place paper quotes instead of stopping at risk gates.

## Strategic expansion path after the orderbook engine

Complete the Phoenix/OpenBook-style orderbook market-maker first. This is the foundation because it teaches the system explicit quoting, cancel/replace discipline, inventory skew, fill accounting, and risk stops.

After the orderbook core is solid, expand into decentralized liquidity management for Solana memecoins and pump-fun-style launches:

1. **AMM / CLMM liquidity pools**
   - Raydium, Orca, and similar pools.
   - Focus: range selection, LP deposit/withdraw/rebalance, fee accrual, impermanent-loss accounting, and safe exits.

2. **DLMM / bin-based liquidity pools**
   - Meteora DLMM and similar bin/range systems.
   - Focus: bin placement, active-bin tracking, bin migration, fee capture, and volatility-aware rebalancing.

3. **Memecoin / pump-fun liquidity bot research track**
   - Focus: post-bonding liquidity support, early pool risk checks, LP lock/burn verification, holder concentration, creator/dev wallet behavior, pool depth, route quality, and transparent support mechanics.
   - Do not build wash-trading, fake-volume, spoofing, or deceptive support tools.

This expansion is deliberately sequenced after the orderbook paper engine so AMM/DLMM work inherits the same safety posture: dry-run first, deterministic accounting, explicit risk gates, safe reports, and no live signing without approval.

## Next safe code modules before live execution

1. Protected dashboard auth design implementation plan
   - Pick auth/session strategy.
   - Add read-only protected routes before mutating controls.
   - Keep browser secrets/signers out of scope.

2. Dashboard review pass
   - Completed locally: `pnpm paper:report`, local Next dev server, `/api/market-maker/report`, and dashboard report-card HTML were verified.
   - New read-only observed report gate: `pnpm paper:observe-report -- --config=config/market-maker.local.json` writes current safe status/report artifacts from real RPC/Jupiter reads.
   - Local operator live feed now exists on the dashboard: `/api/market-maker/feed` aggregates status, paper report, and runtime events; the React cockpit polls it every 3 seconds.
   - Keep future review local unless deploy/auth/public publishing is explicitly approved.

3. Venue fee preset verification
   - OpenBook v2 source confirms fees are market-specific Market account fields, not a global schedule. Raw OpenBook fee units convert to bps by dividing by 100; negative maker values are maker rebates.
   - OpenBook v2 market fee decoder now exists at `src/venue/openbook-market.ts`, with CLI `pnpm openbook:market <OPENBOOK_V2_MARKET_PUBKEY>` and deterministic tests in `test/openbook-market.test.ts`.
   - Replace placeholder Phoenix/OpenBook fee assumptions with decoded market-specific schedules once the target venue/market account is chosen.
   - Keep fees deterministic and paper-only until live-readiness review.

## Remaining blockers / missing inputs

- Vercel/Webflow auth/deploy not done; external account actions require approval.
- Wallet is unfunded for observation/trading tests: observed SOL balance `0`, token balance `0`.
- Real token target not selected beyond the USDC/SOL read-only example.
- Paid RPC not selected.
- Jupiter API key/plan not selected.
- Phoenix/OpenBook venue not chosen.
- AMM/DLMM expansion venues not chosen yet: Raydium, Orca, Meteora, pump-fun/Moonshot migration pools, or other Solana liquidity venues.
- Memecoin liquidity policy not defined yet: transparent support rules, max exposure, allowed launch stage, LP lock/burn requirements, and red-flag rejection criteria.
- Git repo not initialized.
- GitHub not authenticated.
- `gh` is installed but not on this shell PATH; full path works: `/opt/homebrew/bin/gh`.
- In-chat memory search still mismatched against current memory provider.

## Safety line

Do not add signing/live execution until:

- paper mode runs cleanly,
- PnL/drawdown limits remain wired into the runtime loop,
- HALT file is enforced everywhere an execution path can exist,
- self-trade/cross checks exist at venue level,
- operator explicitly approves live mode.
