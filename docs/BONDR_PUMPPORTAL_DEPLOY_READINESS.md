# BONDR PumpPortal Deploy Readiness

Date: 2026-08-14

## Purpose

This sprint moves BONDR's Deployment cockpit from config-only toward a preview-safe Pump.fun/PumpPortal create path. It does not launch, sign, fund, or broadcast.

## What Exists Now

- Deployment stores token metadata, route settings, wallet plans, and risk rules.
- Pre-live dry-run validates planned wallet spend and risk-rule coverage.
- Execution truth map shows the deploy rail as rehearsal-only until the builder, signer, relay, receipt, monitor, and recovery stages exist.
- Jito relay readiness is visible but live submission remains disabled.

## What This Sprint Added

- Shared PumpPortal create preview contract: `bondr-pumpportal-create-preview-v1`.
- Preview endpoint: `GET/POST /api/deployment/pumpportal/preview`.
- Gated build endpoint: `GET/POST /api/deployment/pumpportal/build-create`.
- Deployment launch-builder UI action for PumpPortal create preview.
- IPFS readiness model for the token image/metadata path.
- Payload preview for the future `trade-local` create request:
  - `publicKey`
  - `action=create`
  - `tokenMetadata.name`
  - `tokenMetadata.symbol`
  - `tokenMetadata.uri`
  - `mint`
  - `denominatedInSol=true`
  - `amount`
  - `slippage`
  - `priorityFee`
  - `pool`
- Explicit blockers for missing IPFS metadata, missing client mint public key, missing dev wallet, closed deploy gate, and closed broadcast gate.
- Build-create contract: `bondr-pumpportal-build-create-v1`.
- Build-create requires `PUMPPORTAL_BUILD_ENABLED=true` and `confirmBuild:true` before any provider request. With the flag off, it returns `provider-build-disabled` and never calls PumpPortal.
- If enabled later, the endpoint can call `trade-local`, validate that PumpPortal returned serialized transaction bytes, decode the versioned transaction, and return unsigned transaction metadata plus base64 for client-side signing. It still does not sign or broadcast.

## Provider Requirements

PumpPortal's token creation flow requires token metadata to be pinned to IPFS before creating the coin. The old Pump.fun metadata upload endpoint is no longer supported. BONDR should use a provider such as Pinata for image plus metadata JSON pinning before generating the create transaction.

The local transaction path is still client-side signing: BONDR can request a serialized transaction from PumpPortal later, but the user's wallet and client-created mint keypair must sign locally. BONDR should not collect private keys or move to server custody without a separate explicit design.

## Still Blocked Before Real Launch

- IPFS upload/pin implementation.
- Live-approved PumpPortal `trade-local` create transaction request.
- Client mint keypair creation and signature orchestration.
- Simulation proof for returned transaction bytes.
- Exact signer/mint/payload binding verification.
- Deployment gate.
- Broadcast gate.
- Final explicit operator approval.
- Receipt capture after broadcast.

## Sources Checked

- PumpPortal creation docs: https://pumpportal.fun/creation/
- PumpPortal local trading API: https://pumpportal.fun/local-trading-api/trading-api/
- PumpPortal Jito bundles: https://pumpportal.fun/local-trading-api/jito-bundles/
- Jito low-latency bundle docs: https://docs.jito.wtf/lowlatencytxnsend/
