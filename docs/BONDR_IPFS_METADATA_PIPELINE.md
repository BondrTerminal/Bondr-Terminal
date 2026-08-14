# BONDR IPFS Metadata Pipeline

Date: 2026-08-14

## Purpose

Sprint 1 of the execution backend spine adds the IPFS metadata pipeline needed before PumpPortal create can become real.

## What This Adds

- Project metadata can now store `metadataUri`.
- IPFS readiness helper: `bondr-ipfs-metadata-readiness-v1`.
- Readiness/pin endpoint: `/api/deployment/ipfs/metadata`.
- Deployment UI actions:
  - Preview IPFS metadata.
  - Pin metadata.
- PumpPortal create preview now prefers stored `metadataUri`.

## Safety

- GET is read-only.
- POST without `confirmPin:true` is read-only.
- POST with `confirmPin:true` requires:
  - same-origin mutation authorization
  - mutations enabled
  - `PINATA_JWT`
  - valid token metadata
  - image attached
- This endpoint only pins image/metadata and stores the metadata URI.
- It does not launch, sign, fund, or broadcast.

## Pinata Flow

- Image pin: `POST https://api.pinata.cloud/pinning/pinFileToIPFS`
- Metadata pin: `POST https://api.pinata.cloud/pinning/pinJSONToIPFS`
- Auth: `Authorization: Bearer <PINATA_JWT>`

## Still Blocked

- Real PumpPortal create transaction builder.
- Client mint keypair generation.
- Browser signer binding proof.
- Real signing/broadcast.

## Sources

- Pinata file upload docs: https://docs.pinata.cloud/api-reference/endpoint/ipfs/pin-file-to-ipfs
- Pinata JSON pin docs: https://docs.pinata.cloud/api-reference/endpoint/ipfs/pin-json-to-ipfs
- Pinata uploading files guide: https://docs.pinata.cloud/files/uploading-files
- PumpPortal creation docs: https://pumpportal.fun/creation/

