# Package / Program Manifest

_Last checked: 2026-07-05_

## Already installed locally

| Program | Version |
|---|---|
| Solana CLI | `solana-cli 4.1.0` |
| Anchor CLI | `anchor-cli 1.1.2` |
| SPL Token CLI | `spl-token-cli 5.6.1` |
| Rust | `rustc 1.96.0` |
| Cargo | `cargo 1.96.0` |
| Node | `v26.4.0` |
| npm | `11.17.0` |
| pnpm | `11.9.0` |
| Deno | `2.9.1` |
| jq | `1.7.1-apple` |
| Git | `2.50.1` |
| GitHub CLI | `2.95.0` installed, auth not complete |

## Not installed globally

| Program | Needed now? | Notes |
|---|---:|---|
| Bun | No | Optional runtime/package manager. |
| Yarn | No | Optional package manager. |
| Docker | No | Optional if we run infra containers. |
| Redis | No | Optional queue/cache later. |
| Postgres | No | Optional production analytics later. |

## Core project dependencies

These are in `package.json` dependencies:

| Package | Version range in repo | Checked latest | Purpose |
|---|---:|---:|---|
| `@solana/web3.js` | `^1.98.4` | `1.98.4` | Solana RPC, tx, wallet primitives. |
| `@solana/spl-token` | `^0.4.14` | `0.4.14` | SPL token account/mint helpers. |
| `@coral-xyz/anchor` | `^0.32.1` | `0.32.1` | Anchor client/IDL support. |
| `@jup-ag/api` | `^6.0.48` | `6.0.48` | Jupiter quotes/swaps. |
| `dotenv` | `^17.4.2` | `17.4.2` | Local env vars. |
| `zod` | `^4.4.3` | `4.4.3` | Config/env validation. |
| `pino` | `^10.3.1` | `10.3.1` | Structured logging. |
| `decimal.js` | `^10.6.0` | `10.6.0` | Decimal-safe price math. |
| `better-sqlite3` | `^12.11.1` | `12.11.1` | Local ledger DB. |

## Dev dependencies

| Package | Version range in repo | Checked latest | Purpose |
|---|---:|---:|---|
| `typescript` | `^6.0.3` | `6.0.3` | Static checks. |
| `tsx` | `^4.23.0` | `4.23.0` | Run TS scripts directly. |
| `@types/node` | `^26.1.0` | `26.1.0` | Node types. |
| `@types/better-sqlite3` | `^7.6.13` | `7.6.13` | TypeScript types for SQLite package. |

## Optional integration dependencies

These are listed as optional dependencies so we have the map without committing to immediate integration:

| Package | Version range in repo | Checked latest | Purpose |
|---|---:|---:|---|
| `@raydium-io/raydium-sdk-v2` | `^0.2.58-alpha` | `0.2.58-alpha` | Direct Raydium integration. |
| `@orca-so/whirlpools` | `^8.0.1` | `8.0.1` | Orca concentrated liquidity. |
| `@meteora-ag/dlmm` | `^1.9.11` | `1.9.11` | Meteora DLMM. |
| `@openbook-dex/openbook-v2` | `^0.2.10` | `0.2.10` | OpenBook order-book MM. |
| `@pythnetwork/hermes-client` | `^3.1.0` | `3.1.0` | Pyth price/oracle data. |
| `jito-ts` | `^4.2.1` | `4.2.1` | Jito bundles/searcher client. Advanced only. |

## Install command, once approved

```bash
cd /Users/yakuzamoto/.openclaw/workspace/projects/solana-spl-market-maker
pnpm install
```

If native SQLite build fails, install Xcode command line tools / build prerequisites first. On this machine Rust/Cargo and Apple Git are already present; Node is current.
