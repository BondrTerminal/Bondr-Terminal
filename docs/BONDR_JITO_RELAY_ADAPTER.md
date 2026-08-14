# BONDR Jito Relay Adapter

Date: 2026-08-14

## Purpose

This sprint adds the gated relay adapter foundation for BONDR bundle buying, sniper submits, and future task transactions. The JSON-RPC `sendBundle` call shape is implemented, but production remains blocked until relay, broadcast, simulation, approval, and signed-payload policy all pass.

## What This Sprint Added

- Shared adapter module: `apps/web/lib/jito-relay-adapter.ts`.
- Policy preview endpoint: `GET/POST /api/relay/jito/bundle-preview`.
- Gated send endpoint: `POST /api/relay/jito/send-bundle`.
- Bundle Sequencer now reports:
  - relay preview contract
  - preview endpoint
  - future send endpoint
  - signed bundle payload shape
  - Jito tip cap
  - missing simulation/approval/signature blockers
- Jito status endpoint now lists the related relay endpoints.

## Jito Contract Shape

Future signed bundle submit payload:

```json
{
  "signedTransactions": ["base64 transaction"],
  "expectedSigners": ["wallet public key"],
  "expectedMint": "token mint",
  "tipLamports": 1000,
  "simulationProof": "required-before-submit",
  "approvalId": "required-before-submit"
}
```

The adapter validates the shape, transaction count, signer list, mint binding, tip cap, simulation proof, explicit approval, relay gate, and broadcast gate. If any blocker exists, it returns before making a relay request. If every blocker is cleared later, it posts:

```json
{
  "jsonrpc": "2.0",
  "id": "bondr-...",
  "method": "sendBundle",
  "params": [["base64 transaction"]]
}
```

to the configured Jito block-engine bundle endpoint.

## Still Blocked Before Real Relay Submit

- Tip account selection from `getTipAccounts`.
- Transaction hash/signature binding.
- Simulation proof storage and verification.
- Durable approval record.
- Bundle ID storage.
- Inflight and final status polling.
- Receipt linkage back to project, sniper, bundle, or task rail.
- Retry/rebuild policy for expired blockhash or dropped bundles.

## Safety Position

`/api/relay/jito/send-bundle` is implemented but unreachable in production while `JITO_RELAY_ENABLED=false` and `LIVE_BETA_BROADCAST_ENABLED=false`. The endpoint exists so the rest of BONDR can target one relay path without enabling live Jito submission during this sprint.

## Sources Checked

- Jito low-latency transaction and bundle docs: https://docs.jito.wtf/lowlatencytxnsend/
- Jito TypeScript SDK: https://github.com/jito-labs/jito-ts
- Jito JSON-RPC JS SDK: https://github.com/jito-labs/jito-js-rpc
- PumpPortal Jito bundle docs: https://pumpportal.fun/local-trading-api/jito-bundles/
- Helius bundle proxy docs: https://www.helius.dev/docs/sending-transactions/send-bundle
