# Public Market Maker Benchmark

_Last checked: 2026-07-05_

This benchmarks our Solana SPL market-maker scaffold against public market-maker code/docs. It does not cover private institutional stacks except by high-level architecture patterns.

## Public references inspected

### Hummingbot

- Site: https://hummingbot.org/
- Avellaneda strategy docs: https://hummingbot.org/strategies/v1-strategies/avellaneda-market-making/
- Inventory-risk article: https://hummingbot.org/blog/what-is-inventory-risk/
- Strategy source path: https://github.com/hummingbot/hummingbot/tree/master/hummingbot/strategy/avellaneda_market_making

Key lessons:

- Serious MM logic is inventory-first.
- Avellaneda-Stoikov style models adjust reservation price and spread using inventory, volatility, liquidity/order intensity, time horizon, and risk aversion.
- Production bots need order refresh times, filled-order delays, hanging/ping-pong behavior, inventory target percentages, multi-level quoting, and min spread controls.

### OpenBook v2

- Repo: https://github.com/openbook-dex/openbook-v2

Key lessons:

- OpenBook is a central-limit order-book venue, not a full MM bot.
- It supplies the Solana orderbook program and TypeScript client foundation.
- Useful when we graduate from aggregator swaps into real resting-limit-order market making.

### skynetcap/openbook-mm

- Repo: https://github.com/skynetcap/openbook-mm
- Setup: https://raw.githubusercontent.com/skynetcap/openbook-mm/main/docs/SETUP.md
- Example strategy: https://raw.githubusercontent.com/skynetcap/openbook-mm/main/src/main/java/com/mmorrell/strategies/openbook/sol/OpenBookSolUsdc.java

Key lessons:

- It is a Java/Spring HFT OpenBook client.
- It uses paid RPC/data RPC, private key file, Open Orders accounts, Pyth pricing, priority fees, many executor threads, orderbook inspection, cancel/replace loops, spread multipliers, cross-detection, and adversarial top-of-book handling.
- It is closer to a real HFT quoting bot than our scaffold, but it is also venue-specific and much riskier to run casually.

### Phoenix Legacy

- Repo: https://github.com/Ellipsis-Labs/phoenix-v1
- Market-maker overview: https://ellipsis-labs.gitbook.io/phoenix-dex/tRIkEFlLUzWK9uKO3W2V/getting-started/market-maker-overview.md

Key lessons:

- Phoenix is a crankless on-chain orderbook with atomic settlement.
- Market makers need to claim a seat, fund base/quote assets, and use Phoenix SDKs.
- Maker fees can be 0 bps on some markets; taker fees vary by market.
- Phoenix is a natural future venue if we want real limit orders on Solana.

### Drift keeper/JIT maker bots

- Repo seen through GitHub redirect: https://github.com/drift-labs/keeper-bots-v2
- DriftPy: https://github.com/drift-labs/driftpy

Key lessons:

- Higher-level protocol bots are not just market makers. They include fillers, liquidators, JIT makers, collateral management, subaccounts, config files, metrics, websocket modes, run-once modes, dry-run flags, and Prometheus metrics.
- JIT making is latency-sensitive and requires collateral/risk management.
- Errors like “outcompeted” are expected in competitive markets.

### Mango v4

- Repo: https://github.com/blockworks-foundation/mango-v4

Key lessons:

- Mango is a full margin/trading protocol with program, TS client, and py client.
- Useful as a reference for account/risk/margin architecture, not as a simple SPL-token MM starter.

## Our scaffold today

Current project: `projects/solana-spl-market-maker`

We currently have:

- TypeScript scaffold
- package manifest
- config schema
- env loader
- Solana RPC connection
- SPL mint reader
- wallet balance reader using `getBalance`, ATA lookup, `getTokenAccountBalance`, and `getTokenAccountsByOwner`
- Jupiter quote reader
- mock market reader
- mock wallets
- inventory-aware decision function
- trade-size clamp helper
- basic risk checks
- self-trade guard
- HALT file guard
- dry-run executor
- paper-fill simulator
- NDJSON ledger
- SQLite schema/writer
- doctor/observe scripts
- tests for risk, self-trade, sizing, and paper fills
- documentation for architecture, packages, runbook, RPC methods, strategy, references

What we intentionally do not have yet:

- installed dependencies
- live signing
- private keys
- funded wallets
- real order placement
- cancel/replace engine
- orderbook venue integration
- websocket stream processing
- priority-fee/Jito submission
- Prometheus metrics
- backtester
- formal PnL engine

## Comparison table

| Capability | Our scaffold | Hummingbot | OpenBook/MM examples | Phoenix | Drift/Mango style |
|---|---:|---:|---:|---:|---:|
| Dry-run first | yes | yes/sim modes | limited/repo-specific | SDK-level | configs often include dry-run/run-once |
| Paper fill sim | basic | stronger | limited | not main focus | protocol-specific |
| Inventory target | basic token target | mature target % | hand-tuned | custom | account/collateral aware |
| Spread model | not yet | mature Avellaneda/min spread | hand-tuned multipliers | custom | auction/venue-specific |
| Volatility model | not yet | yes | Pyth/confidence heuristics | custom | oracle/market aware |
| Liquidity/order-intensity model | not yet | yes | orderbook top-of-book | orderbook native | DLOB/auction native |
| Real orderbook quotes | no | yes on supported venues | yes | yes | yes |
| Jupiter aggregator | read-only quotes | connector-dependent | not core | not core | derisking sometimes uses Jupiter |
| Wallet balance reading | yes | yes | yes | yes | yes |
| Self-trade guard | basic controlled-wallet set | exchange/connector dependent | venue behavior/config | venue behavior | protocol controls |
| Kill switch | HALT file | operational controls | not clearly generalized | custom | config/process controls |
| Ledger | basic NDJSON/SQLite | rich history | logs | custom | metrics/logs |
| Metrics | no | yes-ish client/history | logs | custom | Prometheus in keeper bots |
| Websocket data | no | yes/connectors | yes/data RPC likely | SDK dependent | yes |
| Priority fees | no | connector-dependent | yes | transaction-level | yes/competitive execution |
| Backtesting | no | yes/framework support | no obvious | no obvious | protocol-specific tests/examples |
| Production readiness | no | yes-ish, mature framework | POC/HFT example | venue SDK/program | advanced protocol bots |

## Gap analysis

### Biggest strategic gap

We are currently closer to a **safe inventory/paper-trading starter** than a true market maker.

A true market maker places resting bid/ask quotes on an orderbook or responds to JIT auctions. Our v0 only decides buy/sell/wait using Jupiter quotes and wallet inventory. That is a safer foundation, but it is not yet top-of-book quoting.

### Biggest technical gaps

1. **No orderbook state**
   - Need OpenBook/Phoenix/Drift venue adapters.
   - Need best bid/ask, depth, own orders, fills, cancel/replace.

2. **No spread engine**
   - Need mid-price, reservation price, min spread, volatility widening, inventory skew.

3. **No event loop maturity**
   - Need websocket subscriptions, reconnect logic, stale-data detection, rate limiting, backoff.

4. **No execution simulator**
   - Current paper fill is simplistic.
   - Need order lifecycle sim: placed, partially filled, canceled, expired, rejected.

5. **No PnL/risk accounting**
   - Need mark-to-market inventory value, realized/unrealized PnL, fees, slippage, drawdown.

6. **No observability**
   - Need structured metrics, health endpoints, Prometheus/exported stats, alerting.

7. **No latency/priority-fee layer**
   - Higher-level Solana bots handle priority fees, Jito/fast senders, stale blockhashes, and outcompeted txs.

8. **No venue-specific live order safety**
   - Need preflight, order-cross checks, self-trade behavior, max open orders, max cancellation rate.

## Recommended upgrade path

### Phase 1: Make v0 honest and testable

- Install deps after approval.
- Fix type errors.
- Run tests.
- Run `doctor`.
- Run read-only `observe` against one SPL mint.
- Add PnL/accounting model.
- Add metrics/log summaries.

### Phase 2: Add real market data quality

- Websocket slot/health monitoring.
- Pyth/Switchboard/oracle adapter where relevant.
- Volatility estimator.
- Liquidity/depth estimator.
- Stale quote detection.

### Phase 3: Add strategy layer

- Inventory target as portfolio percentage, not just raw token target.
- Reservation price.
- Min spread.
- Volatility spread widening.
- Filled-order cooldown.
- Quote refresh tolerance.
- Multi-level quote plan.

### Phase 4: Add orderbook venue adapter in paper mode

Best candidates:

1. Phoenix first if available market/SDK fits: simpler crankless orderbook UX.
2. OpenBook v2 second: deeper traditional CLOB path.
3. Drift JIT later: advanced and collateral/risk-heavy.

Do not jump straight to live Jupiter swapping as “market making.” That becomes directional inventory rebalancing, not proper two-sided liquidity provision.

### Phase 5: Add guarded live mode

Only after paper mode proves stable:

- explicit config flag
- explicit operator approval
- local signer policy
- tiny size limits
- live preflight
- HALT check before every tx
- max daily loss
- max consecutive failures
- max position/inventory
- max open order count
- no self-trade/crossing own book

## Verdict

Our scaffold is pointed in the right direction for safety and learning. Compared with public top systems, it is missing the hard parts: orderbook event loop, spread model, quote lifecycle, latency handling, PnL/risk accounting, and observability.

The correct next move is not to copy an HFT bot. It is to keep our scaffold safe, install deps, validate observation, then add Hummingbot-style inventory/spread logic before adding Phoenix/OpenBook paper quoting.
