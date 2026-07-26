# Solana SPL Market Maker

Dry-run-first foundation for a Solana SPL-token market-making bot.

## Current state

This repo is a starter scaffold. It does **not** send live transactions yet.

It includes:

- TypeScript project manifest
- Config schema
- Risk checks
- Mock market/wallet snapshots
- Dry-run decision loop
- NDJSON decision ledger
- Package list for Solana/Jupiter/DEX integrations
- Safety and architecture docs

## Install

Do not run until the operator approves package installation.

```bash
pnpm install
```

## Run dry-run pass

```bash
cp .env.example .env
pnpm dry-run
```

Expected behavior:

- Loads `config/market-maker.example.json`
- Uses mock market/wallet data
- Produces a buy/sell/wait decision
- Writes `logs/decisions.ndjson`
- Does not send transactions

## Doctor

```bash
pnpm doctor
```

## Build check

```bash
pnpm check
pnpm test
```

## Read-only observation

After dependency install and local config setup:

```bash
pnpm observe -- config/market-maker.local.json
```

This is designed to read token metadata, wallet balances, and Jupiter quotes without signing transactions.

## OpenBook v2 market fee decode

After choosing a specific OpenBook v2 market account, decode its public fee fields:

```bash
pnpm openbook:market <OPENBOOK_V2_MARKET_PUBKEY>
```

This is read-only. It does not use private keys, sign transactions, place orders, cancel orders, swaps, or live execution.

## Next implementation steps

1. Run dependency install after explicit approval.
2. Fix any TypeScript compile issues from exact SDK types.
3. Smoke test read-only observation against a real token mint.
4. Add quote-to-decision math using spread/slippage/inventory skew.
5. Add paper-mode ledger for hypothetical fills.
6. Add HALT file kill switch.
7. Add live execution only after tests, simulation, signer policy, and explicit approval.

## Safety

Private keys never go in chat, git, `.env.example`, source files, or docs. Use local keypair files or a signer adapter only after explicit approval.

The bot must avoid wash trading, spoofing, self-trading, fake volume, and misleading claims.

## Meridian product direction

This repository now serves two connected tracks:

1. **Liquidity Engine foundation** — the original dry-run/paper-first Solana SPL market-maker/scalper engine with risk controls, observed-market reporting, paper order lifecycle, and tests.
2. **Meridian web command hub** — the Next.js app in `apps/web`, which presents the broader Solana operator platform: Project Management, Project Cockpit, Deployment planning, Wallet Ops, Sniper token intelligence, Project Dashboard accounting, Profile, GitHub/status, Whitepaper, and the flagship Liquidity Engine.

Current web preview boundaries:

- Project/wallet/deployment state is demo/local JSON-backed unless durable storage is connected.
- Vercel project creation is simulated and returns `persisted: false`.
- Token intelligence is read-only through DexScreener.
- Liquidity Engine is paper-first; live trading is disabled.
- No wallet creation, private-key import/export, funding, collecting, multisend, token deployment, pool creation, LP actions, swaps, signing, or live trading are enabled.

The intended competitive product shape is a coordinated Solana project command center, not a standalone deployer or standalone market-maker dashboard.
