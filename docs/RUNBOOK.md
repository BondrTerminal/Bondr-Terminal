# Runbook

## Phase 0 — no installs yet

Current state: files only, no `node_modules`, no lockfile, no live execution.

Validate static files:

```bash
python3 -m json.tool package.json >/dev/null
python3 -m json.tool tsconfig.json >/dev/null
python3 -m json.tool config/market-maker.example.json >/dev/null
```

## Phase 1 — install dependencies after approval

```bash
cd /Users/yakuzamoto/.openclaw/workspace/projects/solana-spl-market-maker
./scripts/install-approved.sh
```

This runs:

1. `pnpm install`
2. `pnpm doctor`
3. `pnpm check`
4. `pnpm test`

## Phase 2 — configure read-only observation

1. Copy env:

```bash
cp .env.example .env
```

2. Copy config:

```bash
cp config/market-maker.example.json config/market-maker.local.json
```

3. Edit only public values first:

- `tokenMint`
- wallet public keys only
- conservative `maxTradeSol`
- mode stays `dry-run`

4. Run read-only observer:

```bash
pnpm observe -- config/market-maker.local.json
```

Expected output:

- token mint decimals/supply
- SOL balances
- target SPL balances
- Jupiter quote-derived market snapshot

No tx signing. No live orders.

## Phase 3 — dry-run decision ledger

```bash
pnpm dry-run -- config/market-maker.local.json
```

Expected output:

- a decision per wallet
- `logs/decisions.ndjson`

## Phase 4 — runtime state and paper mode

Runtime state persistence now exists as safe helpers, not a daemon:

- `src/runtime/loop.ts` runs one deterministic dry-run/paper-safe step.
- `src/runtime/state.ts` summarizes the latest step into whitelisted JSON state.
- Runtime events can be appended as NDJSON.
- Persisted state excludes raw config, env names, API keys, private keys, signer info, and browser secrets.

Paper quote placement now exists as safe helpers, not a daemon:

- `src/runtime/paper-quotes.ts` converts quote levels into paper order records.
- Only explicit `placePaperOrder(...)` methods are used.
- Unsupported venues such as Jupiter/Raydium/Orca/Meteora are skipped for orderbook paper placement.
- Live-shaped `placeOrder(...)` / `cancelOrder(...)` methods remain disabled and unused.

Paper fill simulation now exists as safe helpers, not a daemon:

- `src/runtime/paper-fills.ts` simulates fills for placed paper orders.
- Buy paper orders fill when order price is at or above the market reference price.
- Sell paper orders fill when order price is at or below the market reference price.
- Configurable partial fill ratio supports full or partial paper fills.
- `src/runtime/paper-fees.ts` calculates deterministic paper fee/slippage attribution.
- Filled paper orders can carry quoted price, executed price, gross notional, net notional, fee amount, slippage amount, maker/taker fee bps, liquidity role, fill count, and last fill timestamp.
- Live-shaped venue methods remain disabled and unused.

Paper open-order persistence and cancel/replace now exist as safe helpers, not a daemon:

- `src/runtime/open-orders.ts` persists whitelisted paper order fields only.
- Missing open-order files return an empty list.
- Corrupt open-order JSON fails with a clear error.
- `src/runtime/cancel-replace.ts` expires stale paper orders, cancels bad/wrong-wallet orders, removes terminal orders from active state, places replacement paper quotes, simulates fills, and writes updated paper open-order state.
- `runPaperRuntimeCycle(...)` represents one explicit deterministic paper cycle.
- Live-shaped venue methods remain disabled and unused.

Paper PnL accounting now exists as safe helpers, not a daemon:

- `src/runtime/paper-pnl.ts` summarizes filled buy/sell volume, open bid/ask notional, realized PnL, unrealized PnL, total paper PnL, marked paper portfolio value, drawdown bps, active open-order count, and filled-order count.
- When paper fill accounting is present, PnL uses fee-adjusted net buy costs and net sell proceeds, while separately reporting gross filled volume, total paper fees, and total paper slippage attribution.
- Mark-to-market fields return `null` when the market reference price is unavailable instead of inventing certainty.
- `runPaperRuntimeCycle(...)` returns `paperPnl` alongside runtime state, cancel/replace, fills, and final paper orders.
- Returned paper PnL summaries include `paperOnly: true` and `liveExecution: false`.
- No raw config, env names, private keys, API keys, signers, swaps, or venue live methods are used.

Paper risk gates now exist as safe helpers, not live risk controls:

- `src/runtime/paper-risk.ts` consumes `PaperPnlSummary` from `src/runtime/paper-pnl.ts`.
- It evaluates paper drawdown and daily-loss limits using the configured `globalRisk` thresholds.
- Unmarked paper portfolio values, null paper PnL, or null paper drawdown block safely instead of inventing certainty.
- Returned paper risk summaries include `paperOnly: true`, `liveExecution: false`, and `source: 'paper-pnl'`.
- No raw config, env names, RPC URLs, API keys, private keys, signers, swaps, or venue live methods are returned.

Bounded paper sessions now exist as safe helpers, not a daemon:

- `src/runtime/paper-runner.ts` runs a finite list of explicit paper cycle inputs, capped by `maxCycles`.
- There are no sleeps, timers, cron behavior, websocket subscriptions, or infinite loops.
- The runner stops by default on HALT, runtime risk block, runtime drawdown block/halt, or paper risk block/halt.
- The runner writes normal safe runtime state/events through the existing paper cycle path.
- The runner includes per-cycle and final spread-capture summaries from `src/runtime/spread-capture.ts`.
- Spread capture reports matched buy/sell size, unmatched inventory, quoted spread, executed spread, gross spread captured, fee-adjusted spread captured, fees, and slippage attribution.
- `src/runtime/paper-session-report.ts` turns bounded runner results into whitelisted JSON review artifacts.
- `runBoundedPaperRunner(...)` accepts optional `reportPath` and writes a safe paper session report when provided.
- Paper session reports include executed cycles, stop reason, paper PnL, paper risk, spread capture, fill counts, open-order counts, and skipped reasons.
- Returned summaries include `paperOnly: true` and `liveExecution: false`.
- Cancel/replace avoids stacking fresh quotes when valid active paper orders are already retained.

Dashboard paper report viewing now exists as a read-only surface:

- `apps/web/lib/status.ts` reads safe paper session reports server-side.
- Report source order is `MARKET_MAKER_REPORT_URL`, then `MARKET_MAKER_REPORT_FILE` defaulting to `runtime/paper-session-report.json`, then `{ source: 'fallback', report: null }`.
- `/api/market-maker/report` returns only parsed whitelisted report data or the null fallback.
- The web dashboard renders paper PnL, paper risk, spread capture, fill/open-order counts, stop reason, and skipped reasons.
- No wallet signing, live trading, swaps, auth dependency, or mutating control was added.

Paper fee presets now exist as paper-only assumptions:

- `src/runtime/paper-fee-presets.ts` defines deterministic paper fee presets.
- Current presets are `zero`, `openbook-v2-default`, and `phoenix-default`.
- OpenBook/Phoenix presets are explicit placeholders until the target venue/market fee schedule is verified.
- OpenBook v2 fees are market-specific `maker_fee` and `taker_fee` fields on the Market account. Raw OpenBook fee units convert to bps by dividing by 100; negative maker values represent maker rebates.
- `runPaperRuntimeCycle(...)` selects a paper fee preset after paper venue selection and applies the resulting maker/taker bps to simulated fills.
- `runBoundedPaperRunner(...)` accepts `paperFeePresetName`, `makerFeeBps`, and `takerFeeBps`; explicit bps override preset values.
- Fee presets are not live config, do not sign, do not place orders, and preserve `paperOnly: true` / `liveExecution: false`.

### Decode an OpenBook v2 market fee schedule

Use this read-only helper only after selecting a specific OpenBook v2 market account:

```bash
pnpm openbook:market <OPENBOOK_V2_MARKET_PUBKEY>
```

The command fetches the public market account and decodes only safe market metadata/fee fields:

- market pubkey
- program id
- market name
- base/quote mint public keys
- raw `makerFee` / `takerFee`
- converted maker/taker bps
- maker rebate bps when `makerFee` is negative
- `paperOnly: true`
- `liveExecution: false`

It does **not** use private keys, sign, send transactions, place orders, cancel orders, or approve live execution. A decoded fee schedule can be used to improve paper assumptions, but it is not a live-readiness approval by itself.

Generate a local paper-session report fixture for dashboard review:

```bash
pnpm paper:report
```

This writes:

- `runtime/paper-session-report.json` — dashboard-readable safe paper report
- `runtime/paper-session-fixture-state.json` — fixture runtime summary only
- `runtime/paper-session-fixture-open-orders.json` — fixture paper open orders only
- `runtime/paper-session-fixture-events.ndjson` — fixture runtime events only

The fixture uses prepared market/wallet snapshots, paper-only adapters, and deterministic timestamps. It does not use RPC, private keys, signing, swaps, live venue calls, or browser secrets.

Dashboard artifact lookup note:

- Relative `MARKET_MAKER_STATUS_FILE` and `MARKET_MAKER_REPORT_FILE` paths are checked from the web app working directory and the repo root.
- This lets `pnpm web:dev` run from the Next app package while still reading repo-root runtime artifacts such as `runtime/paper-session-report.json`.

Paper mode is still not live execution. Next paper-mode work should:

- continue using `pnpm paper:report` plus the read-only dashboard/API smoke as the local report review gate
- verify placeholder Phoenix/OpenBook fee assumptions once a target venue/market is chosen
- consume real market snapshots later, after paper accounting is richer
- write safe runtime state/events
- never sign transactions

## Phase 5 — live mode prerequisites

Do not implement live mode until all are done:

- signer adapter chosen
- private-key policy documented
- tx simulation added
- priority fee policy added
- kill switch added
- self-trade guard tested
- max daily loss tested
- per-wallet reserve tested
- venue-specific failure handling tested
- operator explicitly approves live trading

## Emergency stop design

Before live mode, add a local halt file check:

```text
HALT file exists → no trade
```

Suggested path:

```text
./HALT
```

If `HALT` exists, the bot may observe/log but cannot execute.
