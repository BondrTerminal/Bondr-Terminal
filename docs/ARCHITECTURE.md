# Architecture

The first version is intentionally boring and safe: observe, decide, log. No live tx sending.

## Loop

```text
load config
  ↓
read balances + market data
  ↓
compute inventory delta
  ↓
run risk checks
  ↓
produce decision: buy / sell / wait
  ↓
dry-run execution stub
  ↓
append ledger record
```

## Why dry-run first

A market maker that cannot explain its decisions should not be allowed to touch funds. The foundation bot should generate a clean ledger of observations and proposed actions before it ever signs a transaction.

## Live trading gates

Before adding live tx sending, require:

1. Real wallet balance reader.
2. Real Jupiter quote reader.
3. Simulation/preflight layer.
4. Max trade size and max daily loss tests.
5. Kill switch.
6. No self-trade guard across controlled wallets.
7. Operator review of venue and token.

## Design boundaries

Allowed:

- Inventory rebalancing.
- Two-sided liquidity provision on real venues.
- Transparent treasury execution.
- Risk-managed buybacks/sells.

Not allowed:

- Wash trading.
- Self-trading.
- Spoof orders.
- Fake volume.
- Misleading floor/backing claims.
- Trading third-party funds without explicit consent/legal structure.

## Venue roadmap

The first completed engine should remain a traditional orderbook-style market maker:

```text
Phoenix/OpenBook-style venue
  ↓
explicit bid/ask quotes
  ↓
cancel/replace discipline
  ↓
paper fills + PnL + risk gates
```

After that foundation is strong, the next major direction is decentralized liquidity management for memecoins and pump-fun-style tokens:

```text
AMM / CLMM pools
  Raydium, Orca, similar range/pool venues

DLMM / bin pools
  Meteora-style active-bin liquidity

Memecoin launch liquidity
  pump-fun/pump-swap or migrated pools, only with strict risk and transparency rules
```

The AMM/DLMM track is not just “place orders somewhere else.” It needs separate accounting for LP shares, pool fees, impermanent loss, active ranges/bins, deposit/withdraw costs, migration risk, and rug/scam filters.

Safety rule: AMM/DLMM and memecoin liquidity support must inherit the same posture as the orderbook engine — dry-run first, explicit paper accounting, bounded sessions, red-flag rejection, no fake volume, and no live signing without explicit approval.
