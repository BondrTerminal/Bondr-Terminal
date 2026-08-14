# BONDR Multi-Wallet Signing

Date: 2026-08-14

## Purpose

This sprint makes BONDR honest about wallet execution. A wallet row is not the same thing as a signer. Watch-only records can plan bundle, sniper, and task intent, but they cannot sign transactions.

## What This Sprint Added

- Shared signing readiness contract: `bondr-wallet-signing-readiness-v1`.
- Deployment readiness now reports per-wallet signing mode:
  - `watch-only`
  - `browser-signer-required`
  - `managed-local-future`
  - `unavailable`
- Bundle signing session readiness:
  - required wallet IDs
  - signed count
  - missing count
  - fresh blockhash requirement
  - rebuild requirement after blockhash expiry
- Deployment UI now labels watch-only bundle/sniper/task wallets as unable to sign.
- Sniper wallet desk now labels multi-select bundle rows as selection-only until signers exist.

## Current Truth

- Dev wallet rehearsal can use a connected browser signer, but BONDR must prove the connected signer matches the selected dev wallet before live launch.
- Bundle, sniper, and task wallets are not executable while they are watch-only.
- Managed-local signing is treated as future policy, not live readiness.
- Server custody remains false.

## Still Blocked Before Real Multi-Wallet Execution

- Connected browser signer binding proof.
- Multi-wallet signature collection session.
- Signed transaction count and missing signature tracking.
- Fresh blockhash clock.
- Rebuild of every unsigned transaction after expiry.
- Policy checks per signed transaction.
- Jito bundle preview after all signatures are collected.
- Durable approval and receipt record.

