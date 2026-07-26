# Strategy Notes

This bot should start as an inventory/risk manager, not an “AI trader.”

## v0 strategy: inventory-aware rebalancing

Goal: keep each wallet near a target token inventory while preserving SOL reserves.

Inputs:

- current SOL balance
- current token balance
- target token inventory
- max token inventory
- max SOL per trade
- Jupiter reference quote
- estimated slippage

Decision:

```text
if no reference price: wait
if token inventory < target: consider buy
if token inventory > target: consider sell
if at target: wait
if risk checks fail: wait
```

## Spread / skew idea

Inventory skew means the bot changes behavior depending on what it already holds.

- Too many tokens → wider buys, more willing to sell.
- Too few tokens → wider sells, more willing to buy.
- Volatile market → smaller size, wider spread, slower frequency.
- Thin liquidity → wait.

## Time sensitivity

A small, fast loop is safer than a huge black-box AI loop.

Recommended first timings:

- Observe every 5–15 seconds.
- Decide every 15–60 seconds.
- Execute at most 1–2 trades per minute in tiny size.
- Cool down after failures.

## Risk-off states

The bot should downgrade automatically:

| State | Meaning | Behavior |
|---|---|---|
| normal | conditions acceptable | dry-run/paper/live as configured |
| cautious | slippage/volatility elevated | reduce size, slow down |
| risk-off | limits close to breach | observe only, no new orders |
| halted | HALT file or drawdown triggered | no execution |

## Why not full AI yet

An AI that decides “how much, how fast, and when” without strict rails can create accidental manipulation, runaway losses, or incoherent execution.

Use AI later for parameter suggestions only:

- recommended spread range
- volatility regime classification
- summary of market state
- post-trade review

The deterministic risk engine remains final authority.
