# BONDR Temporary Live Launch Test Prompt - 2026-08-15

Use this prompt only when the operator is ready to test one real Pump.fun launch transaction with a funded deployer wallet. This is a real mainnet action and can spend SOL. The window must be opened temporarily, tested once, then closed immediately.

```text
You are operating BONDR production for one controlled real Pump.fun launch test.

Goal:
- Temporarily enable the minimum production gates needed to build, simulate, browser-sign, review, and broadcast one real Pump.fun create-and-buy launch transaction for project `sda`.
- Use the direct Pump.fun SDK builder path, not PumpPortal Local create, because the local provider create endpoint has been returning HTTP 400.
- Close the live/broadcast gates immediately after the single broadcast attempt, whether it succeeds or fails.

Hard boundaries:
- Do not expose, paste, export, or request private keys or seed phrases.
- Do not use server-side signing.
- Do not run any extra wallet funding, swap, LP, bundle, or sniper action.
- Do not leave trading or broadcast gates open after the test.
- Stop if simulation fails, signer does not match the deployer, signed review fails policy, or the transaction references unexpected programs/accounts.

Known deployer:
- Project: `sda`
- Expected deployer/browser signer: `8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz`
- Expected builder: `pump-sdk-direct-create`
- Expected build mode for classic token: `legacy-create-and-buy`
- Expected programs from the successful dry-run: Pump.fun `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` and Associated Token Program.

Pre-open checks:
1. Confirm production is on the commit that includes the direct Pump.fun SDK builder.
2. Confirm production `/deployment?project=sda` loads.
3. Confirm the deployer browser wallet is connected and matches `8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz`.
4. Confirm deployer SOL balance is enough for Pump.fun create, initial buy, rent, priority fee, and network fees.
5. Confirm metadata URI and image are IPFS/gateway reachable.
6. Confirm current production broadcast route is still blocked before opening gates.

Temporarily set production env:
- `PUMP_DIRECT_BUILD_ENABLED=true`
- `PUMPPORTAL_BUILD_ENABLED=false`
- `LIVE_TRADING_ENABLED=true`
- `LIVE_BETA_SIGNING_ENABLED=true`
- `LIVE_BETA_BROADCAST_ENABLED=true`
- `LIVE_DEPLOYMENT_ENABLED=true`
- `LIVE_REQUIRE_SIMULATION=true`
- Keep `LIVE_BETA_FUNDING_BROADCAST_ENABLED=false`
- Keep `LIVE_BETA_FUNDING_BROADCAST_ARMED=false`

After env update:
1. Redeploy/restart production so the env revision is active.
2. Open `/deployment?project=sda`.
3. Generate or load the client mint keypair in the browser flow.
4. Build unsigned create transaction.
5. Verify build result:
   - status `built`
   - builder `pump-sdk-direct-create`
   - no blockers
   - required signers include deployer and client mint
   - no server signing
   - no broadcast yet
6. Simulate unsigned transaction.
7. Continue only if simulation returns `status=ok`, `err=null`, and simulation status `passed`.
8. Browser-sign only after the simulation pass.
9. Run signed review.
10. Continue only if signed review says `safeToBroadcastIfLiveEnabled=true`, signer matches deployer, mint matches expected client mint, and programs/accounts match the build intent.
11. Submit signed launch transaction once.
12. Record the returned signature and explorer URL.

Immediate rollback:
1. Set production env back to closed:
   - `LIVE_TRADING_ENABLED=false`
   - `LIVE_BETA_BROADCAST_ENABLED=false`
   - `LIVE_DEPLOYMENT_ENABLED=false`
   - Keep or remove `PUMP_DIRECT_BUILD_ENABLED` according to whether build-only staging should remain available.
2. Redeploy/restart production so closed gates are active.
3. Verify `/api/send-signed-transaction` again returns `blocked-by-live-gate` for `operation=launch`.
4. Verify `/api/terminal/signer-dry-run` can still simulate but does not expose broadcast readiness.
5. Write down:
   - commit SHA
   - env values opened and closed
   - simulation result
   - signed review result
   - signature/explorer URL if broadcast was submitted
   - final gate-closed verification

If anything fails:
- Do not retry blindly.
- Close the gates first.
- Then diagnose logs, simulation output, signed-review blockers, or transaction policy blockers.
```
