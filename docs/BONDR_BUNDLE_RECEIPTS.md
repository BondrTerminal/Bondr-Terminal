# BONDR Bundle Receipts

Date: 2026-08-14

## Purpose

Sprint 7 adds the bundle status and receipt contract for Jito-based deployment, bundle, sniper, and task rails. This is read-only status tracking; it does not submit bundles.

## What This Adds

- Bundle status endpoint: `GET/POST /api/relay/jito/bundle-status`.
- Receipt record contract: `bondr-bundle-receipt-v1`.
- Supported receipt fields:
  - bundle ID
  - rail: deployment, bundle, sniper, or task
  - status: submitted, inflight, landed, dropped, failed, finalized, or unknown
  - tx signatures
  - project ID
  - observed timestamp
  - raw relay response
- Jito status methods:
  - `getInflightBundleStatuses`
  - `getBundleStatuses`

## Safety Boundary

- The status endpoint requires bundle IDs.
- It returns blocked while `JITO_RELAY_ENABLED=false`.
- It never signs, broadcasts, submits, retries, or rebuilds transactions.

## Still Missing

- Durable receipt persistence.
- Automatic status polling after future submit.
- Linkage from receipt to launch plan, signed transaction hashes, and explorer URLs.
- Retry/rebuild policy when a bundle is dropped or blockhash expires.
