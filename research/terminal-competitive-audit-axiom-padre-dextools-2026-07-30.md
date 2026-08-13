# Meridian Competitive Terminal Audit — Axiom, Padre/Terminal, DEXTools

Date: 2026-07-30  
Purpose: identify why Meridian does not yet feel like a traditional/high-speed crypto trading terminal, and map the missing workflow, information hierarchy, and endpoint/data backlog.

## Bottom line

Meridian currently has pieces of a terminal — token loading, paper quote flow, holder rows, risk/readiness panels, positions/orders, and provider health — but the experience is still organized like a set of research/debug panels rather than a single trading command center. Axiom and Padre win by compressing discovery → token assessment → execution controls → position/PnL into one fast workflow. DEXTools wins by making the pair/token page feel data-complete: chart, liquidity, trade tape, holders, contract/security, rankings, watchlists, and alerts all orbit the same pair explorer.

The next Meridian sprint should not be “more styling.” It should be a terminal reframe: build a unified token/pair explorer with a fixed order ticket, real chart area, live tape, holder/risk strip, wallet/position strip, and scanner/watchlist entry points.

---

## 1. Competitor workflow map

### Axiom

**Positioning:** Solana-first browser trading terminal for memecoin discovery, analysis, and fast execution.

**Primary workflow:**
1. Scan **Pulse / Explore Tokens**.
2. Filter by age, market cap, volume, liquidity, holders, top-holder %, dev %, snipers, insiders, bundlers, pro/smart traders.
3. Quick-buy from token rows or open token page.
4. Token page shows chart, market stats, recent trades, holder/security signals, socials, and buy/sell controls.
5. Configure slippage, priority fee, MEV mode, bribe/Jito tip.
6. Manage open positions, realized/unrealized PnL, trade history, alerts, wallet tracking, tweet monitor.

**Key screens/panels:**
- Pulse: New Creations, Final Stretch, Recently Migrated.
- Explore Tokens: broad scanner / ranked filters.
- Token trading page: chart + order module + token stats + risk/holder/social/trade context.
- Portfolio: spot/perp PnL, open positions, history.
- Wallet Tracker: named tracked wallets + live activity alerts.
- Tweet Monitor: narrative/social feed.

**Important data fields to copy/adapt:**
- Age / creation time
- Launchpad / pool type
- Bonding and migration status
- Price, MC/FDV, liquidity, volume, price change
- Tx count, buys/sells
- Holders count
- Top 10 holders %
- Dev holding %
- Insider %, sniper %, bundler %
- Pro/smart trader count
- Social links
- Deployer reputation / prior launches
- Watchlist state
- Quick action controls

**Sources:**
- Axiom docs: https://docs.axiom.trade/
- Pulse docs: https://docs.axiom.trade/axiom/finding-tokens/pulse
- Explore docs: https://docs.axiom.trade/axiom/finding-tokens/explore-tokens
- Portfolio docs: https://docs.axiom.trade/axiom/portfolio
- Instant Trade docs: https://docs.axiom.trade/axiom/swap/instant-trade
- Migration actions docs: https://docs.axiom.trade/axiom/swap/migration-actions
- Solana fees / MEV docs: https://docs.axiom.trade/getting-started/fees/solana-fees
- Tweet Monitor docs: https://docs.axiom.trade/tweet-monitor
- Wallet tracking docs: https://docs.axiom.trade/wallet-tracking/adding-wallets
- Axiom-style data API reference: https://docs.mobula.io/cookbooks/axiom-data-api

### Padre / Terminal

**Positioning:** fast browser-based multi-chain memecoin terminal; now branded as Terminal after Pump.fun acquisition.

**Primary workflow:**
1. Use discovery/trenches/alpha tracker to find tokens.
2. Search ticker/name/contract.
3. Open token page with chart, token stats, buy/sell form, holders/security/social/trader context.
4. Execute market/limit/stop/take-profit/trailing/buy-dip/TWAP-style actions.
5. Track positions, wallet balances, historical PnL, and order history.

**Key screens/panels:**
- Trenches / discovery feed
- Token chart + stats page
- Order ticket with slippage, priority fee, tip, MEV controls
- Open orders / order history
- Positions / PnL / balances
- Wallet tracking feed
- Holder distribution
- Security/rug indicators
- Social links
- Top traders / KOL wallet activity

**Important controls to copy/adapt:**
- Market order
- Limit order
- Stop loss
- Take profit
- Trailing stop loss
- Buy-dip automation
- TWAP
- Slippage
- Priority fee
- Tip/bribe
- MEV protection mode
- Dedicated hot-wallet warning and clear execution state

**Sources:**
- Padre/Terminal site: https://www.padre.gg/ and https://trade.padre.gg/
- Rebrand/acquisition coverage: https://phemex.com/news/article/padre-rebrands-to-terminal-following-acquisition-by-pumpfun-32914
- CoinMarketCap profile: https://coinmarketcap.com/currencies/padre/
- Review/tutorial: https://solanatradingbots.com/padre-gg-how-to-use/
- Review/tutorial: https://uwuu.ai/blog/padre-terminal-review
- Tool profile: https://theterminalroom.com/tool/padre-terminal
- Review/tutorial: https://crowinvesting.com/trading-solana-bots/padre-terminal-review/

**Caveat:** official docs at `docs.padre.gg` surfaced in search, but direct fetch was blocked / unavailable during this pass. Treat third-party Padre claims as medium confidence until verified against live docs or screenshots.

### DEXTools

**Positioning:** DeFi pair explorer / analytics terminal with direct swap integration, rankings, safety data, charts, and alerts.

**Primary workflow:**
1. Search token/pair by contract/name/symbol.
2. Open Pair Explorer.
3. Inspect TradingView chart, live tape, liquidity, volume, DEXT Score, contract audit, holders/distribution, links, and pair/pool details.
4. Use rankings/new pairs/gainers/losers/big swaps as research queues.
5. Favorite/watchlist, set alerts, and trade through DEXTSwap/aggregator.

**Key screens/panels:**
- Pair Explorer
- Live New Pairs
- DEXTBoard rankings
- Gainers/Losers
- Big Swap Explorer
- Multi-chart
- Favorites/watchlists
- Alerts
- Token Safety Checker

**Important data/features to copy/adapt:**
- TradingView-grade chart
- Pair/pool context, not only token context
- Liquidity and lock status as first-class safety/execution metrics
- Live buys/sells tape with wallet links
- Big swap / whale flow
- Token safety checker: honeypot, taxes, mintability, ownership, blacklist/modifiable tax risk, contract verification, DEXT Score
- Rankings as research queues, not buy recommendations
- Watchlist + alerts for price/volume/liquidity/security changes

**Sources:**
- DEXTools app: https://www.dextools.io/app/
- Beginner guide: https://www.dextools.io/tutorials/how-to-use-dextools-beginners-guide
- Pair Explorer tutorial: https://www.dextools.io/tutorials/dextools-tutorial-beginner-alpha
- Token Safety Checker: https://www.dextools.io/tutorials/token-safety-checker
- Gainers/Losers guide: https://www.dextools.io/tutorials/dextools-gainers-losers-ranking-guide-2026
- Bitstamp DEXTools overview: https://www.bitstamp.net/en-gb/learn/blockchain/how-to-use-dextools/
- Developer portal: https://developer.dextools.io/
- Chart widget: https://github.com/dextools-io/chart-widget
- Public API wrapper category list: https://github.com/alb2001/dextools-python

---

## 2. What “traditional terminal feel” actually means

A traditional terminal is not just dark UI and tables. It has a **persistent trading layout** where the user can answer these questions without hunting:

1. What am I looking at? — token/pair identity, CA, chain, venue, age.
2. What is the market doing now? — price, chart, candle, tape, volume, liquidity.
3. Can I safely trade it? — holder concentration, dev %, taxes, freeze/mint, LP lock, honeypot, pool depth, migration stage.
4. Who is involved? — top holders, smart wallets, snipers, insiders, bundlers, dev wallet, whales/KOLs.
5. What is my exposure? — balances, position size, entry, PnL, open orders.
6. What can I do immediately? — buy, sell, limit, stop, TP, paper mode, refresh, watchlist, alert.
7. What changed? — alerts, tape deltas, wallet events, liquidity add/remove, holder changes, migration events.

Meridian feels less terminal-like because these answers are split across collapsible panels and backend/status language. The user sees “enrichment,” “provider,” “snapshot,” “partial,” and “readiness” before they see a fast trader’s command surface.

---

## 3. Meridian gap analysis

### Already present / partially present

- Token loading by mint
- Read-only execution safety gates
- Paper quote preview
- Paper ledger / PnL path
- Holder rows and holder coverage metadata
- Trades/top traders path
- Positions/open orders path
- Bundle clustering / migration / signals panels
- Provider health/readiness panels
- Pump.fun migration/dev token hooks
- Risk verdict and live-readiness guardrails

### Missing or too weak

#### P0 gaps — blocks “real terminal” feel

1. **No dominant chart workspace**
   - A real terminal’s center of gravity is chart + tape + order ticket.
   - Meridian’s current chart/market panel is not visually/functionally dominant enough.

2. **No fixed right-side order ticket**
   - Buy/sell controls should be persistent while switching data tabs.
   - Include paper/live-disabled state, slippage, priority fee, tip, route preview, amount presets, wallet selector.

3. **No scanner/watchlist entry point**
   - Axiom has Pulse/Explore; DEXTools has New Pairs/Rankings; Padre has Trenches.
   - Meridian needs a left rail scanner: loaded token, watchlist, recent mints, new pairs, migration queue.

4. **Token/pair identity strip is incomplete**
   - Need chain, CA copy, pair/pool, DEX, launchpad, age, migration status, pool age source, links, socials.

5. **Risk data is not trader-readable enough**
   - Replace backend-ish labels with clear pills: Mint revoked, Freeze revoked, LP locked/burned, Top10 %, Dev %, Snipers %, Insiders %, Bundlers %, Taxes, Honeypot, Liquidity depth.

6. **Holders/wallet intelligence is not visually compressed**
   - Need top-holder concentration strip + table + bubble/cluster placeholder + dev/team wallet labels.

7. **No watchlist/alerts loop**
   - Need favorites and alerts for price, volume, liquidity, holder %, dev sell, wallet buys, migration.

8. **Positions/PnL are not first-class enough**
   - Need always-visible current position card: size, avg entry, current price, unrealized/realized PnL, open orders.

#### P1 gaps — needed after layout reframe

9. **No live-new-pairs / migration scanner**
   - Build equivalent of Pulse: New Creations, Final Stretch, Recently Migrated.

10. **No wallet/social monitor**
   - Axiom has Wallet Tracker + Tweet Monitor; Meridian should have read-only tracked wallets and X/account signal panel.

11. **No Big Swap / whale tape**
   - Label large buys/sells and repeated micro-buys/sells.

12. **No rankings as research queues**
   - Hot pairs, gainers/losers, volume spikes, liquidity additions/removals.

13. **No customizable terminal layout**
   - Later: draggable/resizable modules, multi-chart, saved layouts.

#### P2 gaps — power-user polish

14. **Multi-chart mode**
15. **Shareable chart/snapshot links**
16. **Advanced alert delivery**
17. **Deployer reputation page**
18. **Historical holder/concentration change tracking**
19. **Route/depth simulation beyond quote preview**

---

## 4. Endpoint/data backlog

### Market + pair data
- Pair search by token/CA
- Best pair selection with explainable reason
- OHLCV candles
- Recent trades by pair/token
- Liquidity depth and pool reserves
- Pool age / pair creation
- Volume by timeframe
- Price change by timeframe
- FDV / market cap

Candidate providers:
- DexScreener API: https://docs.dexscreener.com/api/reference
- Birdeye API: https://docs.birdeye.so/docs/premium-apis-1
- DEXTools API: https://developer.dextools.io/
- GeckoTerminal API for OHLCV/pool fallback

### Safety/security
- Mint/freeze authority
- Honeypot / sellability
- Buy/sell taxes where applicable
- Ownership / mutable settings
- LP lock/burn
- Liquidity concentration
- Holder concentration
- RugCheck/GoPlus/Birdeye-style token security

Candidate providers:
- RugCheck
- GoPlus
- Birdeye token security
- Helius/RPC token program/account reads
- DEXTools token audit categories

### Wallet intelligence
- Top holders > 20 / > 100 coverage
- Holder lifecycle
- Dev wallet balance and transfers
- Sniper detection
- Insider graph
- Bundler/same-slot clusters
- Smart/pro trader participation
- Top traders
- Wallet labels / saved tracked wallets

Candidate providers:
- Helius DAS + enhanced transactions
- Birdeye holders/top traders/trades
- GMGN APIs/CLI where available
- Mobula Axiom-style streams
- Solscan Pro

### Discovery/scanner
- New pairs
- Pump.fun creations
- Bonding curve progress
- Final stretch migration candidates
- Recently migrated pools
- Hot pairs / trending / gainers / losers
- Boosted/paid attention flags
- Social/profile completeness

Candidate providers:
- Pump.fun endpoints/indexer
- DexScreener token profiles/latest boosts/orders
- Birdeye new listings/trending
- DEXTools rankings/hot pools
- Mobula Pulse-style streams

### Execution/paper terminal
- Persistent paper order ticket
- Market quote
- Limit order store/evaluator
- Stop loss / take profit / trailing order models
- Priority fee/tip simulation labels
- Slippage/price impact receipt
- Open orders
- Order history
- Position/PnL
- Wallet balances

Keep current guardrail: no real signing/broadcasting until explicitly approved in a separate live-execution sprint.

---

## 5. Recommended terminal layout

### Left rail — Discovery
- Search CA/name/ticker
- Watchlist
- Recent loaded tokens
- New pairs
- Final stretch / migrations
- Hot/trending
- Tracked wallets
- Alerts

### Center — Pair Explorer
- Header: token image/name/ticker, CA copy, chain, DEX, pair, launchpad, age, migration status, social links
- Chart: TradingView/lightweight chart, timeframe buttons, volume
- Bottom tabs: Tape, Holders, Orders, Positions, Wallet Flow, Security, Social, Dev History

### Right rail — Trading / Position
- Persistent paper order ticket
- Buy/sell toggle
- Amount presets
- Slippage
- Priority fee
- Tip / MEV mode as disabled or paper-estimated controls
- Quote preview receipt
- Current position card
- Open orders
- PnL card

### Top strip — Risk + Market quick read
- Price
- MC/FDV
- Liquidity
- Volume
- Buys/Sells
- Holders
- Top10 %
- Dev %
- Snipers %
- Insiders %
- Bundlers %
- LP lock/burn
- Mint/freeze status

This is the smallest layout that will feel like Axiom/Padre/DEXTools rather than a dashboard.

---

## 6. Prioritized build backlog

### Sprint 1 — Terminal shell reframe

1. Build persistent 3-column terminal shell: discovery rail, pair explorer, order/position rail.
2. Move paper order ticket into fixed right rail.
3. Create token identity/market/risk top strip.
4. Make chart the dominant center panel.
5. Move provider/system/debug panels behind a small “System” drawer.
6. Convert holder/risk wording from backend metadata into trader pills.

### Sprint 2 — Pair Explorer completeness

1. Add OHLCV chart endpoint/provider fallback.
2. Add live tape with buy/sell/whale/micro-buy labels.
3. Add liquidity/pool panel: reserves, pool age, DEX, LP lock/burn.
4. Add holder distribution panel with coverage label and top concentration.
5. Add token safety checklist: authorities, taxes/honeypot where available, LP, holder concentration, dev wallet.

### Sprint 3 — Scanner / watchlist

1. Add local watchlist/favorites.
2. Add scanner tabs: New Pairs, Pump.fun, Final Stretch, Recently Migrated, Trending.
3. Add alert model: price, volume, liquidity, whale trade, holder concentration, dev sell, migration.
4. Add saved tracked wallets.

### Sprint 4 — Advanced trading workflow, still paper-only

1. Add limit/stop/take-profit/trailing paper order creation from right rail.
2. Add route receipt with price impact/slippage/liquidity warnings.
3. Add order lifecycle timeline.
4. Add position card with entry/current/PnL/exit action.
5. Add trade journal/export.

---

## 7. What not to copy blindly

- Do not copy wallet-key custody flows yet. Keep Meridian paper/read-only until execution is explicitly scoped.
- Do not claim complete holder coverage when provider only returns top 20/100.
- Do not use rankings as recommendations; label them as research queues.
- Do not hide provider gaps. Axiom/Padre can abstract them because they run production data infra; Meridian should show source status honestly.
- Do not overbuild customizable layouts before the default terminal layout feels right.

---

## 8. Next build-agent prompt

```text
You are working in `/Users/yakuzamoto/.openclaw/workspace/projects/solana-spl-market-maker`.

Read `research/terminal-competitive-audit-axiom-padre-dextools-2026-07-30.md` first.

Objective:
Reframe Meridian from a dashboard/debug panel into a traditional Solana memecoin trading terminal inspired by Axiom, Padre/Terminal, and DEXTools. Keep all execution paper-only/read-only: no real swaps, no signing, no wallet mutation, no private keys, no live trading.

Priority Sprint 1:
1. Build a 3-column terminal shell on the sniper/trading terminal page:
   - left rail: discovery/search/watchlist placeholders backed by real loaded-token state where available
   - center: pair/token explorer with dominant chart area and bottom data tabs
   - right rail: persistent paper order ticket + current position/PnL/open orders
2. Add a trader-readable top strip:
   - price, MC/FDV, liquidity, 24h volume, buys/sells, holders, top10 %, dev %, sniper %, insider %, bundler %, LP lock/burn, mint/freeze status
3. Move provider/system/debug language into a collapsed System drawer.
4. Keep risk and holder coverage honest:
   - show `coverageLabel`, `walletCountReturned`, `walletLimit`, `isTruncated`
   - never imply complete holder coverage when provider is capped
5. Make the chart visually dominant even if OHLCV provider is partial; show source/placeholder honestly.
6. Keep the right-side order ticket paper-only:
   - buy/sell toggle, amount, slippage, priority fee/tip fields as paper controls, quote preview receipt, record paper entry, open position/PnL summary
7. Reuse existing APIs/components when possible; do not rewrite the whole app.
8. Run verification:
   - `pnpm web:check`
   - `pnpm web:build`
   - load `/sniper` locally and inspect that the first screen now reads like a trading terminal, not a debug dashboard.

Deliverables:
- files changed
- what changed visually/workflow-wise
- which competitor workflows were copied/adapted
- verification commands/results
- remaining endpoint/provider gaps for Sprint 2
```
