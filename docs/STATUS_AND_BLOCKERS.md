# Current Status and Blockers

_Last updated: 2026-07-19 19:32 EDT_

## 1. Memory/search state

Status:

- OpenClaw CLI memory index is complete in FTS-only mode.
- In-chat `memory_search` still errors because this session expects `text-embedding-3-small` while index provider is `none`.

Evidence:

- `openclaw memory status --index` reports: provider `none`, FTS ready, semantic vectors disabled.

Needed:

- Reconcile OpenClaw memory search settings or rebuild index under the expected provider.
- Not required for the market-maker code to work.

## 2. Git/GitHub state

Status:

- `gh` is installed at `/opt/homebrew/bin/gh`.
- Current OpenClaw shell PATH does not include `/opt/homebrew/bin`, so plain `gh` fails here.
- `/opt/homebrew/bin/gh auth status` works and reports not logged in.
- Workspace and project are not git repos yet.

Needed:

- Decide whether to initialize git.
- Login with GitHub CLI when ready.
- Optional PATH fix requires shell config edit approval.

## 3. Dependency install state

Status:

- `node_modules` present.
- `pnpm-lock.yaml` present.
- Dependencies installed with `/opt/homebrew/bin/pnpm install`.
- Native build scripts approved and completed for:
  - `better-sqlite3`
  - `bigint-buffer`
  - `bufferutil`
  - `esbuild`
  - `protobufjs`
  - `utf-8-validate`

Verified:

```bash
export PATH="/opt/homebrew/bin:/Users/yakuzamoto/.cargo/bin:$PATH"
pnpm --config.verify-deps-before-run=false check
pnpm --config.verify-deps-before-run=false test
pnpm --config.verify-deps-before-run=false doctor
```

Additional verification:

- TypeScript compile passes.
- Test suite passes: 148/148.
- Doctor passes with corrected PATH.
- `better-sqlite3` loads successfully via in-memory SQLite smoke test.

## 4. Config state

Status:

- `.env.example` cleaned.
- `config/market-maker.example.json` intentionally contains placeholders.
- `config/market-maker.local.json` exists and uses public keys only.
- Current local config targets USDC/SOL on mainnet-beta in dry-run mode.

Needed:

- Keep private keys out of config/chat/repo.
- Use only explicit approval for any funded-wallet, signer, or live-trading step.

## 5. RPC/Jupiter state

Status:

- Solana read-only RPC methods documented in `docs/RPC_METHODS.md`.
- Wallet balance reader now correctly uses:
  - `getBalance(owner)` for SOL
  - ATA derivation
  - `getTokenAccountBalance(tokenAccount)`
  - `getTokenAccountsByOwner(owner, { mint })` fallback
- Jupiter quote URL updated from legacy `quote-api.jup.ag/v6/quote` to `https://api.jup.ag/swap/v1/quote`.
- Optional `JUPITER_API_KEY` and `JUPITER_QUOTE_URL` env vars added.

Still needed:

- Confirm quote endpoint works after dependency install / real config.
- Consider Swap v2 later; v1 quote is enough for read-only observation.

## 6. Market-maker functionality state

Working as scaffold/code:

- Config/env schemas
- Mock market/wallet loop
- Dry-run decision logging
- Risk checks
- Self-trade guard
- HALT-file guard
- Jupiter quote reader
- Solana token/wallet readers
- Paper-fill simulator
- Paper order lifecycle model
- Rate-limit helpers
- PnL/mark-to-market helpers
- Drawdown enforcement helpers
- Quote-plan builder
- Multi-level quote planner
- Deterministic one-step runtime loop
- Paper-only Phoenix/OpenBook adapter shapes
- Runtime state/event persistence helpers
- Paper quote placement from quote levels into paper-only adapters
- Paper fill simulation for placed paper orders
- Persistent paper open-order state
- Paper cancel/replace cycle for stale, bad, wrong-wallet, and terminal orders
- Paper PnL accounting for filled volume, open notional, realized/unrealized PnL, portfolio value, and drawdown
- Paper fee/slippage accounting for quoted price, executed price, gross notional, net notional, fee amount, slippage attribution, fee bps, liquidity role, and fill count
- Paper PnL consumes fee-adjusted net values when paper fill accounting is attached, and separately reports gross volumes, fees, and slippage
- Spread-capture accounting for matched buy/sell paper fills, quoted spread, executed spread, gross spread capture, fee-adjusted spread capture, unmatched inventory, fees, and slippage attribution
- Bounded paper runner includes per-cycle and final spread-capture summaries
- Safe paper session report export for bounded paper sessions
- Bounded paper runner optional `reportPath` writes whitelisted JSON reports under runtime paths
- Web dashboard server-side report reader for latest safe paper session reports
- Read-only dashboard report cards for paper PnL, paper risk, spread capture, fills, open orders, stop reason, and skipped reasons
- Local operator live-feed cockpit polls safe status/report/event artifacts every 3 seconds through `/api/market-maker/feed`
- Paper-only venue fee presets for deterministic paper fee assumptions
- OpenBook v2 fee-source finding documented: fees are market-specific Market account fields; raw units / 100 = bps; negative maker values represent maker rebates
- OpenBook v2 public market fee decoder added for specific market accounts; decoder remains read-only and paper-safe
- Bounded paper runner applies selected paper fee presets/overrides to simulated fills
- Deterministic local paper-session fixture generator for dashboard review
- `paper:report` script writes `runtime/paper-session-report.json` without RPC, signing, swaps, or live execution
- `paper:observe-report` script bridges real read-only RPC/Jupiter observations into a one-cycle paper-only OpenBook-style report, with no signing, swaps, live order placement, or cancels
- Runtime summaries use market snapshot timestamps for deterministic replay/report output
- Dashboard status/report file lookup handles both web-app cwd and repo-root runtime artifact paths
- Generated local paper-session report verified through the read-only report API and dashboard cards
- Paper risk gates that consume paper PnL and evaluate paper drawdown/daily-loss limits
- One explicit paper runtime cycle helper that returns paper PnL and paper risk summaries
- Bounded multi-step paper runner for finite explicit paper sessions with paper-risk stop behavior
- Cancel/replace quote stacking prevention when valid active paper orders are retained
- NDJSON ledger
- SQLite schema/writer for decisions and paper orders
- Transaction failure classifier and retry/pass decision helper for future live/preflight paths; transient network, rate limit, blockhash, and account-lock failures can retry within budget, while slippage/stale quotes, insufficient funds, signer/auth, risk/HALT, invalid transaction, and unknown failures pass safely instead of blind retrying
- Dashboard/operator feed accepts explicit `transaction_retry` and `transaction_pass` runtime events so the current paper trading cockpit can evolve into a real trading execution tape without changing its safety shape

Working after dependency install:

- TypeScript compile check
- Tests: 158/158 passing
- Doctor script execution through pnpm with corrected PATH
- Native SQLite smoke test

Read-only observation run:

- Config: `config/market-maker.local.json`
- RPC: Helius when `HELIUS_RPC_URL` or `HELIUS_API_KEY` is configured; public Solana RPC only as fallback
- Token: USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Quote: SOL `So11111111111111111111111111111111111111112`
- Public wallet: `8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz`
- Observed SOL balance: `0`
- Observed token balance: `0`
- Reference price from latest Jupiter read-only quote: `0.01328585853217835`
- Estimated slippage from latest quote: `0` bps
- Generated dashboard status file: `runtime/market-maker-status.local.json` (gitignored)
- Generated dashboard paper report file from read-only observed data: `runtime/paper-session-report.json` (gitignored)
- Current observed paper report stops safely because the public wallet has `0` SOL and `0` token balance
- Live trading: disabled

Web/dApp scaffold prepared and locally verified:

- `apps/web` Next.js app shell for Vercel.
- Beta dashboard now shows mode, source, wallet, balances, token/quote mints, market reference price, slippage, volatility placeholder, supply, risk limits, operator notes, latest safe paper-session report cards, and a live operator feed/tape.
- Server-side status adapter reads `MARKET_MAKER_STATUS_URL`, then `runtime/market-maker-status.local.json`, then bundled fallback data.
- Server-side report adapter reads `MARKET_MAKER_REPORT_URL`, then `runtime/paper-session-report.json`, then a null fallback.
- `/api/market-maker/report` exposes only parsed whitelisted paper report data or `{ source: 'fallback', report: null }`.
- `vercel.json` deployment config.
- `docs/WEB_APP_PLAN.md` architecture/safety plan.
- `docs/webflow/WEBFLOW_HANDOFF.md` Webflow handoff.
- Protected dashboard auth/control design documented in `docs/WEB_APP_PLAN.md`; design only, no auth dependencies added.
- Web dependencies installed after approval.
- `pnpm web:check` passed.
- `pnpm web:build` passed.
- Wallet-adapter dependencies were deferred to avoid unnecessary hardware-wallet/native build chains.
- `sharp` build script was not approved; the app still typechecked and built successfully without running that script.
- Live trading remains disabled and no secrets belong in browser env vars.

Not built yet:

- Live trading
- Signer/key management
- Transaction simulation/preflight
- Real swap execution
- Real orderbook placement
- Live OpenBook/Phoenix adapter
- Websocket market data
- Priority-fee/Jito layer
- Metrics/Prometheus
- Full PnL ledger

## 7. Strategy gap versus serious market makers

Current paper scaffold can now model:

```text
observe -> quote bid/ask -> place paper orders -> persist open orders -> cancel/replace -> simulate fills -> paper PnL -> paper risk gates -> bounded paper sessions
```

Now complete in the paper/review path:

```text
safe report fixture generation -> venue fee presets -> read-only dashboard/API review
```

Needed for real MM:

- Orderbook venue adapter: Phoenix or OpenBook first.
- Spread engine: reservation price, min/max spread, volatility widening.
- Inventory engine: target portfolio %, not only raw token count.
- Event loop: websocket, reconnects, stale-data detection.
- Quote lifecycle: place, cancel, partial fill, expire, replace.
- Risk/accounting: paper PnL, paper drawdown/daily-loss gates, fee/slippage detail, and spread-capture metrics now exist in the paper path.
- Reporting: safe paper session report export and dashboard consumption now exist.

Strategic expansion after the orderbook engine:

- AMM/CLMM liquidity management: Raydium, Orca, and similar pool/range systems.
- DLMM/bin liquidity management: Meteora-style bin placement and rebalancing.
- Memecoin and pump-fun-style liquidity support: post-bonding pool analysis, transparent liquidity support, risk-controlled LP deployment, and scam/red-flag filtering.
- This is a later track, not a replacement for the current orderbook milestone. Finish the Phoenix/OpenBook-style paper engine first, then reuse the accounting/risk/reporting foundation for pools.
- Guardrail: do not build wash trading, self-trading, spoofing, fake volume, misleading floor/backing claims, or hidden manipulation into the memecoin liquidity path.

## 8. External research not finished

Still incomplete:

- Exact Black Bull / ANSEM deployer verification.
- Exact 7-day SOL inflow/outflow for verified deployer wallet.
- Deep inspection of Phoenix SDK examples.
- Deep inspection of OpenBook v2 TS client examples.
- Raydium/Orca/Meteora LP automation comparisons.
- Pump-fun/pump-swap and migrated-pool liquidity mechanics comparison.
- Memecoin LP safety policy: holder concentration, LP ownership/lock/burn status, creator wallet behavior, route quality, pool depth, and launch-stage rules.

## 9. Next safe coding tasks

Highest-priority safe code tasks:

- Select a target OpenBook/Phoenix market account, decode/verify its fee schedule, and then replace paper placeholder fee assumptions.
- Keep AMM/DLMM and memecoin liquidity research queued as the next major track after the orderbook paper engine is strong.
- Choose dashboard auth/session strategy before any protected route implementation.
- Add protected read-only routes before mutating operator controls.
- Keep live execution disabled until signer/key management, transaction simulation, live venue adapters, kill-switches, and explicit approval exist.
