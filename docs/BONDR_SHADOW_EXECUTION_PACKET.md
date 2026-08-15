# BONDR Shadow Execution Packet

Date: 2026-08-14

## Purpose

The shadow execution packet moves BONDR closer to live execution without enabling launch,
funding, signing, broadcast, task execution, or Jito relay submission.

It compiles the same backend evidence a live launch would need:

```text
metadata -> builder -> signer -> simulation -> relay -> receipt -> monitor -> recovery -> kill-switch
```

## Endpoint

`GET/POST /api/execution/shadow-plan`

Inputs:

- `projectId`
- `mintPublicKey`
- `connectedSigner`
- `signedTransactions`
- `expectedSigners`
- `tipLamports`
- `simulationProof`
- `approvalId`
- `persistAudit`

## What It Does

- Builds the PumpPortal create readiness packet.
- Checks client mint public key and metadata/IPFS readiness.
- Checks browser signer proof against the selected deployer.
- Checks multi-wallet signing session readiness.
- Builds the Jito bundle policy preview.
- Builds Sniper manual-trigger preview.
- Builds Task queue preview.
- Adds monitoring, recovery, and kill-switch readiness.
- Emits a deterministic `packetHash`.
- Optionally stores an audit snapshot when a database is configured and `persistAudit=true`.

## What It Does Not Do

- No signing.
- No broadcast.
- No funding.
- No token deployment.
- No Jito relay submission.
- No private-key storage.
- No background trading or task worker execution.

## Production UI

Deployment cockpit -> Launch builder -> Shadow execution packet

Actions:

- `Compile Shadow Plan`: returns the packet without storing it.
- `Audit Snapshot`: tries to persist the packet to Postgres if configured.

## Remaining Before Live

- Provider credentials and production payload tests.
- Real PumpPortal build result with a valid IPFS URI and client mint.
- Browser/mint signing orchestration.
- Signed bundle simulation proof.
- Actual Jito `sendBundle` under explicit gates.
- Durable receipt finalizer.
- Durable monitor/worker loop.
- Final recovery runner.
