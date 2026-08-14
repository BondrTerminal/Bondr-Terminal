# BONDR dev-wallet-only launch readiness

Date: 2026-08-14

## Status

BONDR is prepared for a dev-wallet-only launch approval review, not a live broadcast.

Current launch readiness contract:

- API: `/api/deployment-readiness?project=sda`
- Contract: `bondr-deployment-readiness-v1`
- Mode: `dev-wallet-only`
- Broadcast ready: `false`
- Execution: `read-only-readiness-no-signing-no-broadcast`

Current blockers:

- `deployment-gate-closed`
- `broadcast-gate-closed`

This is correct. The product can prepare the launch approval summary and rails verification, but it must not broadcast until Yakuzamoto approves the exact launch plan and gates are intentionally opened.

## Research Basis

Launch routes are modeled as provider adapters:

- `pumpportal-create`
- `pumpportal-trade-local`
- `pumpportal-jito-bundle`
- `raydium-launchlab`
- `raydium-trade-api`

Key integration notes:

- PumpPortal create flow requires externally hosted/IPFS metadata before programmatic token creation.
- PumpPortal `trade-local` produces locally signed transaction payloads; BONDR must deserialize, inspect, simulate, and bind policy before any browser signing/broadcast.
- PumpPortal/Jito bundle rails require per-wallet signer binding, total SOL caps, tip caps, simulation, and explicit bundle approval.
- Raydium LaunchLab is the direct bonding-curve launch route; direct SDK builder and LaunchLab simulation proof are still required before real use.
- Raydium Trade API is useful for post-launch route/transaction builds after a mint/pool exists.

## CLI Readiness Observed

Read-only checks run locally:

```text
solana config get
```

Result:

- RPC URL: `https://api.mainnet-beta.solana.com`
- WebSocket URL: `wss://api.mainnet-beta.solana.com/`
- Keypair path: `/Users/yakuzamoto/.config/solana/id.json`
- Commitment: `confirmed`

```text
solana address
```

Result:

- Failed: no default signer found at `/Users/yakuzamoto/.config/solana/id.json`
- This is acceptable for now because BONDR should not rely on a local CLI signer for browser-wallet launch approval.

```text
solana balance 8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz
```

Result:

- `0.025221288 SOL`

```text
~/.cargo/bin/spl-token accounts --owner 8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz
```

Result:

- USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Balance `0.755734`

Note: `spl-token` exists at `~/.cargo/bin/spl-token` but is not currently on PATH in this shell.

## Approval Summary Required Before Any Live Launch

Yakuzamoto must explicitly approve:

- Launch venue: Pump.fun/PumpPortal, Bonk/LaunchLab candidate, or Raydium LaunchLab
- Token name
- Token symbol
- Description
- Image URI
- Website/social fields
- Dev wallet address
- Custody/signing path
- Mint keypair handling model
- Max dev buy SOL
- Max total SOL at risk
- Slippage cap
- Priority fee cap
- Jito tip cap, if any
- RPC/broadcast endpoint
- Confirmation that this is a public on-chain launch

## Rails Verification Plan

After a real mint exists, bundle/sniper/task rails should be verified in this order:

1. Build transaction previews against the launched mint.
2. Verify signer allowlist and exact mint binding.
3. Verify spend caps, slippage caps, and priority fee/Jito tip caps.
4. Simulate where possible.
5. Verify no self-trade, wash-trade, or artificial-volume loop is configured.
6. Keep bundle/sniper/task broadcast disabled unless separately approved.

## Current Safe Next Step

Choose the launch route and exact token approval summary. Do not enable `LIVE_DEPLOYMENT_ENABLED`, open broadcast gates, fund wallets, or broadcast any transaction until that approval summary is accepted.
