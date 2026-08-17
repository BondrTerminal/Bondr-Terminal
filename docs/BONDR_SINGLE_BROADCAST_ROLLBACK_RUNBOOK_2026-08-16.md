# BONDR single-broadcast rollback runbook

Date: 2026-08-16

Purpose: define the exact rollback sequence for a controlled single-broadcast test. This document is preparation only. Do not run any command here without Yakuzamoto explicitly approving the live test and the rollback action.

## Scope

Use this runbook after exactly one approved broadcast attempt, whether it succeeds, fails, is rejected, times out, or is abandoned.

This runbook closes:

1. broad transaction broadcast
2. deployment
3. funding armed state
4. funding broadcast
5. browser signing
6. live trading/build mode

It does not sign, broadcast, fund, launch, create LP, submit Jito bundles, rotate secrets, or change wallet custody.

The signed submit route must use `maxRetries=0` with `skipPreflight=false` for the controlled test. A failed or timed-out send is a stop condition, not a reason to retry blindly.

## Rollback order

Close the most dangerous gates first:

1. `LIVE_BETA_BROADCAST_ENABLED=false`
2. `LIVE_DEPLOYMENT_ENABLED=false`
3. `LIVE_BETA_FUNDING_BROADCAST_ARMED=false`
4. `LIVE_BETA_FUNDING_BROADCAST_ENABLED=false`
5. `LIVE_BETA_SIGNING_ENABLED=false`
6. `LIVE_TRADING_ENABLED=false`

Reason: broadcast and deployment must close before broader live/signing state. Funding has its own armed flag and must be disarmed before the funding gate is closed.

## Vercel CLI template

Run only after explicit approval:

```bash
vercel env rm LIVE_BETA_BROADCAST_ENABLED production --yes && printf false | vercel env add LIVE_BETA_BROADCAST_ENABLED production
vercel env rm LIVE_DEPLOYMENT_ENABLED production --yes && printf false | vercel env add LIVE_DEPLOYMENT_ENABLED production
vercel env rm LIVE_BETA_FUNDING_BROADCAST_ARMED production --yes && printf false | vercel env add LIVE_BETA_FUNDING_BROADCAST_ARMED production
vercel env rm LIVE_BETA_FUNDING_BROADCAST_ENABLED production --yes && printf false | vercel env add LIVE_BETA_FUNDING_BROADCAST_ENABLED production
vercel env rm LIVE_BETA_SIGNING_ENABLED production --yes && printf false | vercel env add LIVE_BETA_SIGNING_ENABLED production
vercel env rm LIVE_TRADING_ENABLED production --yes && printf false | vercel env add LIVE_TRADING_ENABLED production
vercel redeploy https://solana-spl-market-maker.vercel.app --target production
```

## Required verification

After redeploy, verify:

```bash
curl -s https://solana-spl-market-maker.vercel.app/api/execution-capabilities
curl -s https://solana-spl-market-maker.vercel.app/api/terminal/live-readiness
curl -s 'https://solana-spl-market-maker.vercel.app/api/deployment-engine?project=sda'
```

Required final state:

- `liveTradingEnabled=false`
- `signingEnabled=false`
- `broadcastEnabled=false`
- `fundingBroadcastEnabled=false`
- `deploymentEnabled=false`
- `readinessLevel=disabled`
- `/api/send-signed-transaction` returns an auth/live-gate block and no `signature`
- `/api/deployment-engine?project=sda` stays preflight/disabled-only
- the single-broadcast policy reports `maxRetries=0`, `blindRetries=false`, `skipPreflight=false`

## Stop conditions

Stop immediately and do not attempt a second broadcast if any of these happen:

- signature returned
- provider timeout
- simulation mismatch
- signed-review mismatch
- route crash or failed-closed screen
- unexpected wallet signer
- unexpected mint
- unexpected program
- missing launch receipt
- Vercel env or redeploy command fails
- `/api/execution-capabilities` does not show all gates closed after rollback

## Canonical API runbook

`/api/execution-capabilities` exposes `singleBroadcastRollback` with contract `bondr-single-broadcast-rollback-runbook-v1`. Treat the API object and this document as the same rollback source of truth.
