# BONDR Browser Signer Binding

Date: 2026-08-14

## Purpose

Sprint 4 adds the first signer-binding proof for Deployment create builds. BONDR should not treat a selected wallet row as executable until the browser wallet proves the same public key is connected.

## What This Adds

- Deployment launch builder can connect the browser Solana wallet provider.
- The connected signer public key is compared against the selected deployer/payer field.
- PumpPortal build-create now requires `connectedSigner`.
- Build-create blocks when:
  - no signer proof exists
  - the connected browser signer does not match the dev/deployer wallet
- The proof is public-key-only session state. No private key, seed phrase, or server custody is introduced.

## Still Missing

- Cryptographic message-sign proof with nonce/expiry.
- Durable signer proof session record.
- Client-side signing flow for the returned PumpPortal create transaction.
- Simulation and signed-transaction policy review before any future broadcast.
