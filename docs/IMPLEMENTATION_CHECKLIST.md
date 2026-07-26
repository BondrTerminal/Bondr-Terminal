# Implementation Checklist

## Data we need before first real observation

- [ ] Target SPL token mint
- [ ] Quote asset: SOL or USDC
- [ ] Wallet public keys to monitor
- [ ] Preferred RPC endpoint
- [ ] Whether this is treasury rebalancing, order-book MM, LP range management, or hybrid
- [ ] Max SOL exposure per wallet
- [ ] Max total SOL exposure
- [ ] Max daily loss
- [ ] Max slippage
- [ ] Minimum SOL reserve per wallet

## Programs/SDKs we need

Already installed:

- [x] Solana CLI
- [x] Anchor CLI
- [x] SPL Token CLI
- [x] Rust/Cargo
- [x] Node/npm/pnpm

Project packages prepared but not installed:

- [ ] `@solana/web3.js`
- [ ] `@solana/spl-token`
- [ ] `@jup-ag/api`
- [ ] `zod`
- [ ] `pino`
- [ ] `decimal.js`
- [ ] `better-sqlite3`
- [ ] `tsx`
- [ ] `typescript`

Optional later:

- [ ] Raydium SDK
- [ ] Orca SDK
- [ ] Meteora DLMM SDK
- [ ] OpenBook v2 client
- [ ] Pyth client
- [ ] Jito TS

## Files created

- [x] `package.json`
- [x] `tsconfig.json`
- [x] `.env.example`
- [x] `.gitignore`
- [x] `config/market-maker.example.json`
- [x] `src/config/*`
- [x] `src/solana/*`
- [x] `src/jupiter/*`
- [x] `src/wallet/*`
- [x] `src/market-data/*`
- [x] `src/decision/*`
- [x] `src/risk/*`
- [x] `src/execution/*`
- [x] `src/ledger/*`
- [x] `scripts/doctor.ts`
- [x] `scripts/observe.ts`
- [x] `scripts/install-approved.sh`
- [x] `test/risk.test.ts`
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/PACKAGES.md`
- [x] `docs/REFERENCES.md`
- [x] `docs/RUNBOOK.md`
- [x] `docs/STRATEGY.md`
- [x] `docs/RPC_METHODS.md`
- [x] SQLite schema
- [x] Read-only RPC balance reader
- [x] Jupiter quote reader
- [x] HALT guard stub
- [x] Paper-fill simulator
- [x] Quote-plan builder
- [x] PnL/portfolio mark helpers
- [x] Rate-limit helpers
- [x] Paper order lifecycle model
- [x] Metrics snapshot builder
- [x] Disabled Phoenix/OpenBook-style venue adapter stubs
- [x] USDC/SOL read-only example config
- [x] Token/RPC/API options doc

## Code still needed after install

- [ ] TypeScript compile fixes after dependency install
- [ ] Jupiter quote integration smoke test
- [ ] Real read-only balance observation against a real token mint
- [ ] SQLite ledger implementation replacing NDJSON scratch ledger
- [ ] Unit tests for config schema
- [ ] Unit tests for self-trade guard
- [ ] Unit tests for decimal conversion
- [ ] Paper-mode fill simulator
- [ ] HALT file kill switch
- [ ] Live signer adapter only after approval

## Red lines

- [ ] No wash trading
- [ ] No self-trading
- [ ] No spoofing
- [ ] No fake volume
- [ ] No hidden/private treasury claims
- [ ] No third-party funds without legal structure and explicit consent
- [ ] No live keys in repo/chat
