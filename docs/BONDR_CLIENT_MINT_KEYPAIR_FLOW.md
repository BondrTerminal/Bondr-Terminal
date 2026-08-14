# BONDR Client Mint Keypair Flow

Date: 2026-08-14

## Purpose

Sprint 3 of the backend execution spine adds the client-side mint keypair flow required before PumpPortal create signing can work. This does not sign, launch, fund, or broadcast.

## What This Adds

- Deployment launch builder can generate a Solana mint keypair in the browser.
- The generated mint public key fills the mint public-key field used by PumpPortal preview/build-create.
- The keypair is held only in React component memory for the current browser session.
- BONDR does not persist, POST, log, or server-store the private half.
- Existing PumpPortal create preview/build routes continue to accept only the mint public key.

## Safety Boundary

The server should only ever receive:

- project ID
- dev wallet public key
- mint public key
- pinned metadata URI
- launch amounts, slippage, fee caps, and pool

The server must not receive:

- mint private key
- wallet private key
- seed phrase
- signed transaction without policy review

## Still Missing

- Browser signing flow that combines the dev wallet signature with the client mint keypair signature.
- Simulation proof after PumpPortal returns unsigned create bytes.
- Signer binding proof that the connected browser wallet matches the selected dev wallet.
- Receipt capture after future broadcast.
