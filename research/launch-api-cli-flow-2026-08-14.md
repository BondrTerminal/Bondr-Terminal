# BONDR launch API / CLI flow research

Date: 2026-08-14

## Bottom line

BONDR should treat Pump.fun, Bonk/LetsBonk, and Raydium LaunchLab as three launch routes behind one internal launch contract: metadata, dev wallet, mint, initial dev buy, route adapter, signed transaction preview, simulation, explicit approval, broadcast, and post-launch verification. The current product direction is right, but Deployment is carrying non-final status/report/debug modules in the main viewport; those should move behind an operator/debug drawer so the first screen feels like a focused launch workstation. For real testing, the next safe milestone is a dev-wallet-only live coin launch with bundle/sniper/task rails verified by build/simulation/readiness checks, not by fake-volume trading.

## Key findings

- PumpPortal documents token creation for Pump.fun, but notes that direct Pump.fun metadata uploads are no longer supported; metadata must be uploaded to IPFS separately before programmatic creation. Confidence: high. Source: https://pumpportal.fun/creation/
- PumpPortal local transaction API builds serialized transactions for local signing through `POST https://pumpportal.fun/api/trade-local`; required fields include `publicKey`, `action`, `mint`, `amount`, `denominatedInSol`, `slippage`, `priorityFee`, and optional `pool`. Supported pools include `pump`, `raydium`, `pump-amm`, `launchlab`, `raydium-cpmm`, `bonk`, and `auto`. Confidence: high. Source: https://pumpportal.fun/local-trading-api/trading-api/
- PumpPortal Jito bundle flow uses the same local API with an array body, up to five transactions/wallets; the first transaction priority fee is used as the Jito tip in their example, and generated transactions are then signed and sent to Jito `sendBundle`. Confidence: high. Source: https://pumpportal.fun/local-trading-api/jito-bundles/
- Raydium LaunchLab is a bonding-curve launch program that graduates into a Raydium AMM pool after funding thresholds; its lifecycle covers initialize, buy, sell, graduate, collect fees, and set params. Confidence: high. Source: https://docs.raydium.io/products/launchlab
- Raydium REST surface separates read APIs, transaction construction, LaunchLab mint data, and LaunchLab history APIs. The transaction API uses quote handles from compute endpoints and then builds signed-ready versioned transactions. Confidence: high. Sources: https://docs.raydium.io/sdk-api/rest-api and https://docs.raydium.io/sdk-api/trade-api
- Raydium SDK pitfalls matter for BONDR rails: keep cluster and connection aligned, account for ATA creation rent, re-fetch stale pool info before high-value transactions, explicitly set compute budget/priority fee, match slippage tolerance to pool type, and keep token amounts in BN/large integer form. Confidence: high. Source: https://docs.raydium.io/sdk-api/typescript-sdk
- Raydium routing/MEV guidance says LaunchLab early-curve activity is especially exposed to front-running; Jito bundles are strongly recommended for hyped launches. It also recommends tight slippage, fresh pool state, retry-on-expiry but not deterministic reverts, priority-fee ramping, and Jito/private submission for shallow or high-impact routes. Confidence: high. Source: https://docs.raydium.io/integration-guides/routing-and-mev
- LetsBonk appears to run on Raydium LaunchLab rails according to Bitquery docs and community tooling, and the public `letsbonk-ai/bonk-mcp` repo exposes token launching/trading workflows requiring a Solana keypair and RPC URL. Confidence: medium because the strongest developer docs found are third-party/community rather than complete official launch API docs. Sources: https://docs.bitquery.io/docs/blockchain/Solana/letsbonk-api/ and https://github.com/letsbonk-ai/bonk-mcp

## What is uncertain

- Pump.fun itself does not present a first-party public developer API in the material reviewed; PumpPortal is a widely used third-party transaction builder, so BONDR should label it as a provider adapter, not a first-party Pump.fun integration.
- Bonk/LetsBonk launch creation API details need one more primary-source pass before live integration. Treat PumpPortal `pool: "bonk"` and Raydium LaunchLab as candidate adapters until a real transaction build is proven in simulation.
- Raydium LaunchLab direct initialization via SDK/IDL may be preferable long term, but PumpPortal may be faster for an A-profile test if the goal is one dev-wallet launch and rails validation.

## Product implications

- Final Deployment should not show backend truth maps, route maps, duplicate dry-run/report controls, advanced project object cards, or raw unsigned SPL launch builder panels as primary modules.
- Keep the current visual language, but collapse the page into a real operator flow: command bar, launch route tabs, dev wallet + token metadata, route adapter controls, risk gates, review, and one operator rail.
- Move diagnostics into one compact drawer: Backend Truth, Route Map, QA Report, Event Feed, and Capability Map.
- Replace the generic SPL launch builder with route-aware launch adapters: Pump.fun/PumpPortal, Bonk/LaunchLab, Raydium LaunchLab/CPMM.

## Testing implications

- Dev-wallet-only live launch should require explicit approval with exact token name, symbol, metadata URI/image, launch route, dev wallet address, max SOL spend, slippage, priority fee/Jito tip cap, and broadcast endpoint.
- Bundle/sniper/task verification after launch should first prove transaction build + simulation + signer-policy checks against the real mint. Broadcast of extra wallets should remain off unless separately approved.
- Safeguards must block wash-trading/fake-volume behavior. Bundle/sniper/task rails can support legitimate launch participation, protective entries, take-profit/stop-loss, and scheduled operations, but should not automate deceptive volume.

## CLI / API preparation checklist

- `solana config get` — confirm cluster before any test.
- `solana address` — confirm the local CLI wallet is not accidentally the dev wallet unless intended.
- `solana balance <DEV_WALLET>` — confirm budget plus rent/fees.
- `spl-token accounts --owner <DEV_WALLET>` — inspect token accounts after launch.
- PumpPortal create/build flow: upload image + metadata to IPFS, call `trade-local` with create/dev buy fields, deserialize versioned transaction, assert required signers, simulate, then sign/broadcast only after approval.
- PumpPortal bundle flow: build an array of up to five transaction requests, require wallet allowlist, cap total SOL, cap per-wallet SOL, assign Jito tip only within configured max, sign each transaction with its matching key, submit through Jito only after approval.
- Raydium flow: compute quote with `swap-base-in` or `swap-base-out`, POST transaction build with compute unit price, verify returned versioned transaction, simulate, then sign/broadcast only after approval.

