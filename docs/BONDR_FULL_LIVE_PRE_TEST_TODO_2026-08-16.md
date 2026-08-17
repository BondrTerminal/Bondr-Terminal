# BONDR full-live pre-test todo

Date: 2026-08-16

Goal: complete every live-readiness section up to the point where it is ready for controlled testing. This document stops before testing, signing, broadcast, funding, token launch, LP creation, Jito relay submission, env gate changes, or production mutation.

## Saved pre-live test ladder

Before BONDR is enabled live completely, each section must pass its own test phase:

1. Baseline app QA
2. Auth / Profile
3. Provider / RPC
4. Wallet rail
5. Quote -> Build -> Simulate -> Sign
6. Broadcast gate
7. Deployment / Pump.fun
8. Raydium path
9. Jito / Bundle
10. Sniper / Task rails
11. Risk / Kill switch
12. Security
13. Observability / Recovery

Hard rule: live must open in stages, not as one switch.

1. `LIVE_TRADING_ENABLED=true`
2. `LIVE_BETA_SIGNING_ENABLED=true`
3. Tiny single broadcast test
4. Temporary deploy gate for one launch
5. Gate rollback
6. Broader live mode only after proof from every section

## Before-testing completion list

### 1. Baseline app QA

- Keep `pnpm test`, `pnpm web:check`, `pnpm web:build`, and `pnpm smoke:bondr` green.
- Keep the smoke script aligned with the current tab list.
- Add route-digest checks to any future smoke route additions.
- Ensure all current top-level tabs have stable server render paths.
- Remove or quarantine empty/stale route folders and dead app links.
- Keep production gates closed while this checklist is being completed.

### 2. Auth / Profile

- Finish the login-only wallet-auth posture for BONDR operator access.
- Ensure unknown wallets fail closed instead of creating alternate operator profiles.
- Keep Profile Audit showing expected subject, active scoped subject, auth wallet, scoped wallet, browser signer, and mismatch verdict.
- Make all auth/session failure states actionable from the UI.
- Ensure reset-browser-session clears only BONDR/Turnkey session state.
- Keep profile auth claim parsing compatible with Turnkey snake_case and camelCase claims.

### 3. Provider / RPC

- Make `/api/provider-readiness`, `/api/rpc-health`, and `/api/terminal/live-readiness` agree on provider state.
- Ensure RPC health distinguishes live, provider-limited, unavailable, and modeled states.
- Add or confirm cache/timeout bounds for RPC health checks.
- Ensure provider-limited states block live readiness rather than encouraging gate bypass.
- Confirm all provider responses redact API keys, bearer tokens, and secret-like values.
- Document the production RPC provider and fallback policy.

### 4. Wallet Rail

- Keep `/api/wallet-rail` as the canonical read-only runtime wallet source.
- Ensure selected wallet, browser signer, and profile-scoped wallet state cannot leak across profiles.
- Ensure watch-only wallets can be selected for observation but not execution signing.
- Make wrong-wallet and missing-wallet states block signing with exact reasons.
- Confirm wallet balances are labeled as modeled, live, provider-limited, or unavailable.
- Remove any remaining server-custody/private-key affordances from visible wallet flows.

### 5. Quote -> Build -> Simulate -> Sign

- Ensure quote preview normalizes route, mint, slippage, amount, and wallet inputs.
- Ensure unsigned build routes return expected signer, mint, account, program, and message hash metadata.
- Ensure simulation is required before any signature request.
- Ensure failed simulation blocks signing.
- Ensure signed-review verifies signer, mint, message hash, allowed programs, and required accounts.
- Ensure tampered transaction payloads fail policy before broadcast.
- Ensure the UI presents quote, build, simulation, and signed-review as separate steps.

### 6. Broadcast Gate

- Ensure `/api/send-signed-transaction` blocks without auth and live gates.
- Keep funding broadcast isolated behind its own funding armed gate.
- Preserve launch/swap/funding operation semantics through preview and blocker responses.
- Ensure signed transaction submit never returns a signature while broadcast is disabled.
- Add exact rollback instructions for every temporary gate opening.
- Ensure broadcast failures do not trigger blind retries.

### 7. Deployment / Pump.fun

- Ensure project launch config includes token metadata, image, route, wallet plan, and dev wallet rules.
- Ensure IPFS image/metadata readiness is complete before build.
- Keep direct Pump.fun SDK builder behind explicit env gate.
- Ensure create transaction builder returns unsigned transaction only.
- Ensure client mint public key and deployer signer are bound into the policy review.
- Ensure deployer funding requirements are visible before simulation.
- Ensure successful broadcast can persist launch receipt: signature, mint, deployer, route, provider, observed time.
- Ensure manual launch-receipt reconciliation remains auth-protected and no-sign/no-broadcast.

### 8. Raydium Path

- Finish Raydium-native route config completeness for selected projects.
- Validate CPMM config ID as a real public key.
- Validate base/quote decimals and raw liquidity amounts.
- Ensure expected user base, quote, and LP token accounts are derived and displayed.
- Finish unsigned Raydium LP build contract with no provider signing and no broadcast.
- Finish LP simulation policy proof binding.
- Implement post-broadcast LP account proof.
- Implement verified LP token account proof before burn.
- Ensure LP burn transaction builder requires verified LP token account and simulation proof.

### 9. Jito / Bundle

- Confirm Jito relay readiness exposes required env, provider, tip bounds, and disabled state.
- Finish bundle preview with bundle hash, leg hashes, signer map, and blockers.
- Enforce max transaction count and tip cap.
- Require simulation proof and explicit approval before relay submit.
- Ensure prepared Raydium/Pump.fun legs are accepted only after their policy simulation passes.
- Ensure `sendBundle` blocks before relay fetch when gates are closed.
- Ensure bundle status polling can parse relay responses without treating them as execution proof by themselves.

### 10. Sniper / Task Rails

- Define sniper trigger source contract: manual, pool detector, or webhook.
- Require pool freshness and token/mint proof before any sniper action.
- Enforce wallet allowlist, signer binding, slippage caps, and priority fee caps.
- Finish task queue preview shape for timed buys, sells, TP/SL, trailing logic, and cooldowns.
- Define durable worker lifecycle: scheduled, paused, max runs, cooldown, stopped, failed.
- Ensure no task can create fake volume, wash trades, or controlled-wallet self-trade loops.
- Ensure task/sniper rails remain read-only until separate approval.

### 11. Risk / Kill Switch

- Ensure max SOL per swap, max USDC per swap, and max slippage are enforced by policy.
- Ensure daily loss and drawdown kill-switch logic is wired into live readiness.
- Keep HALT file or emergency stop behavior readable and tested in dry-run.
- Ensure stale quote, stale blockhash, provider-limited, insufficient funds, and account-lock failures are classified.
- Ensure deterministic failures pass upward instead of retrying blindly.
- Ensure all live execution paths consult the same risk limits.
  - 2026-08-16 progress: added `bondr-live-risk-readiness-v1` in `apps/web/lib/live-risk-readiness.ts`. It centralizes max SOL/USDC/slippage, max daily loss, drawdown kill switch, HALT/emergency stop status, and optional live drawdown observations without mutating files or executing trades.
  - 2026-08-16 progress: `getLiveActivationStatus()` now includes `riskReadiness`, extends shared limits with `maxDailyLossSol` and `killSwitchDrawdownBps`, and closes signing/broadcast/funding/deployment when risk readiness is blocked by HALT, missing live drawdown observation during live mode, daily-loss breach, or drawdown kill-switch breach.
  - 2026-08-16 progress: `/api/execution-capabilities` exposes `riskReadiness`; `/api/terminal/live-readiness` includes a Risk category; `/api/execution-swap` now uses `getLiveActivationStatus()` and shared limits instead of direct live env/cap reads.
  - 2026-08-16 progress: pre-live dry-run remains conservative and warns when funding broadcast env is armed even if risk readiness closes the effective funding gate.
  - Remaining risk blocker: production still needs a real live drawdown/daily-loss observation source before any live signing/broadcast/deployment gate should be opened.

### 12. Security

- Confirm no private key import, export, reveal, or server signing routes remain active.
- Confirm wallet vault POST remains block-only.
- Confirm mutation routes require Meridian/operator auth.
- Confirm tracked files contain no credential-shaped literals.
- Confirm logs and client error reports redact bearer/session/token-like values.
- Confirm env files remain ignored and local permissions stay locked.
- Confirm production responses expose no provider secrets.

### 13. Observability / Recovery

- Keep `/api/client-error-report` bounded, sanitized, and useful.
- Ensure route error UI shows route, digest, type, auth/session diagnostics, and recovery links.
- Ensure production smoke artifacts are saved to `/tmp` with redacted payloads.
- Ensure launch/broadcast receipts include signature, provider, route, expected mint, and message hash where available.
- Ensure manual reconciliation paths are clear and auth-protected.
- Document failure response playbooks: auth mismatch, provider-limited, simulation fail, broadcast fail, receipt missing, route crash.
  - 2026-08-16 progress: added `docs/BONDR_FAILURE_RESPONSE_PLAYBOOKS_2026-08-16.md` covering auth mismatch, provider-limited, simulation fail, broadcast fail, receipt missing, and route crash with immediate response and resolution proof steps.
  - 2026-08-16 progress: regression checks now verify `/api/client-error-report` is bounded/redacted/no-store, the route error shell keeps route/digest/type/auth recovery diagnostics, production smoke writes redacted `/tmp` artifacts and checks closed gates, receipts preserve signature/provider/route/mint/message-hash proof fields, and reconciliation remains read-only/auth-protected where mutating.
  - Remaining observability blocker: final human review should inspect the latest `/tmp` smoke artifact and one real browser failed-closed recovery path if a route crash is observed during manual QA.

## Current completion priority

1. Finish authenticated manual QA across every tab.
   - 2026-08-16 progress: unauthenticated production smoke passed across 16 page routes and 7 API checks with live/signing/broadcast/deployment gates closed. Authenticated browser QA still needs operator session/manual wallet review.
   - 2026-08-16 progress: added `bondr-authenticated-manual-qa-checklist-v1` and read-only `/api/authenticated-qa-checklist` so an authenticated operator session can verify the core tab list, project-scoped deployment/sniper/liquidity routes, and fail closed without mutating state.
   - 2026-08-16 progress: local authenticated QA machine pass succeeded using the Meridian session endpoint without exposing the operator key. `/api/authenticated-qa-checklist?project=sda` returned ready with 10 tabs and no blockers; `/`, `/profile`, `/portfolio`, `/wallets`, `/deployment?project=sda`, `/sniper?project=sda`, `/liquidity?project=sda`, `/token-analyzer`, `/projects`, and `/project-dashboard` all returned 200 without the app error shell; execution capabilities kept live, signing, broadcast, funding broadcast, and deployment disabled. Remaining human check: visually confirm Turnkey/Profile Audit and browser-wallet alignment in Yakuzamoto's real browser session.
2. Finish provider/RPC readiness agreement and secret-redaction review.
   - 2026-08-16 progress: `/api/provider-readiness` now derives Solana RPC live/modeled/provider-limited/unavailable status from the same shared RPC health model used by `/api/rpc-health` and `/api/terminal/live-readiness`; provider-limited/modeled states remain live blockers.
   - 2026-08-16 progress: provider error messages, provider-limited notes, bearer headers, credential query params, and secret-shaped URL paths are redacted before readiness responses surface them.
3. Finish quote -> build -> simulate -> sign repeatability on current production.
   - 2026-08-16 progress: unsigned Jupiter swap build responses now expose `handoffEvidence` with expected signer, mint, side, amount, slippage, input/output mints, required accounts, allowed programs, quote/route hashes, and transaction message hash.
   - 2026-08-16 progress: `/api/terminal/signer-dry-run` now emits `transactionEvidence` and `simulationProof.transactionMessageHash`, and rejects simulation handoff when expected signer, expected mint, or built transaction message hash do not match.
   - 2026-08-16 progress: `/api/terminal/signed-review` now requires `simulationTransactionMessageHash` and blocks signed review if the proof hash does not match the stored intent/build hash.
   - 2026-08-16 progress: `/api/send-signed-transaction` now rejects direct non-funding broadcast attempts that lack a matching simulation proof hash, even if a caller manually sends `simulationStatus:"ok"`.
   - 2026-08-16 progress: Terminal swap UI and Deployment/Pump.fun create UI now pass build hashes into simulation and simulation proof hashes into signed-review/broadcast calls.
4. Finish single-broadcast rollback runbook.
   - 2026-08-16 progress: added `docs/BONDR_SINGLE_BROADCAST_ROLLBACK_RUNBOOK_2026-08-16.md` and exposed the same documentation-only rollback contract as `singleBroadcastRollback` from `/api/execution-capabilities`.
   - 2026-08-16 progress: rollback order closes broad broadcast, deployment, funding armed, funding broadcast, signing, then live trading, and requires post-rollback probes for `/api/execution-capabilities`, `/api/terminal/live-readiness`, `/api/deployment-engine?project=sda`, and `/api/send-signed-transaction`.
   - 2026-08-16 progress: `/api/send-signed-transaction` now submits with `maxRetries=0`, `skipPreflight=false`, and reports `blindRetries=false` in successful broadcast responses so a controlled single-broadcast test cannot silently fan out into retry attempts.
5. Finish Pump.fun deployment receipt path for a controlled tiny launch.
   - 2026-08-16 progress: launch receipt normalization now accepts and validates `transactionMessageHash`, `simulationTransactionMessageHash`, `simulationStatus`, and `broadcastPolicy`; provided simulation proof hashes must match the launched transaction message hash, and provided simulation status must be `ok`.
   - 2026-08-16 progress: successful Pump.fun launch broadcasts pass simulation proof hash plus single-broadcast policy into `persistLaunchReceipt`, so project state can retain the proof chain from build -> simulate -> sign -> broadcast.
   - 2026-08-16 progress: manual launch-receipt reconciliation accepts the same proof fields while remaining Meridian-auth protected and no-sign/no-broadcast.
   - 2026-08-16 progress: Deployment launch receipt UI and read-only launch reconciliation output now surface simulation hash/status and retry policy evidence.
6. Finish Raydium LP proof and burn simulation path.
   - 2026-08-16 progress: LP burn transactions now expose a `transactionMessageHash` for simulation/signature binding.
   - 2026-08-16 progress: added `buildSimulationVerifiedLpBurnSignatureHandoff`, which requires verified LP token account proof plus an `ok` simulation proof whose `transactionMessageHash` matches the unsigned burn transaction before `safeToRequestSignature=true`.
   - 2026-08-16 progress: Raydium readiness and Deployment route completeness now classify LP burn simulation handoff as implemented/gated rather than missing.
   - 2026-08-16 progress: added `buildRaydiumPostBroadcastLpAccountProof`, which validates confirmed Raydium LP transaction signature, expected pool id, decoded LP mint proof, owner LP token account, positive LP amount, and optional matching simulation/build transaction message hashes without signing or broadcasting.
   - 2026-08-16 progress: added `buildRaydiumPostBroadcastLpAccountProofFromObservation` plus read-only `/api/deployment/raydium/lp-account-proof`. The route reads a confirmed transaction, verifies the expected pool account was in the transaction, decodes the Raydium AMM v4 LP mint from the pool account, and verifies the owner's positive LP token account by RPC without signing or broadcasting.
   - Remaining Raydium blocker: this is now code-ready for real inputs; production still needs an actual controlled Raydium LP transaction signature/pool/owner tuple to run through the proof path.
7. Finish Jito, sniper, task, risk, and observability proof paths.
   - 2026-08-16 progress: Jito bundle status polling now normalizes matching inflight/final relay rows into `bondr-bundle-receipt-v1` records with confirmation status, landed slot, transaction signatures, relay source, error payload, and `executionProofStatus=relay-status-only-not-chain-proof`.
   - 2026-08-16 progress: added `bondr-jito-wallet-rail-synchronization-v1` inside the launch bundle plan so every Jito leg shows its wallet id, signer, rail, route path, signing index, prepared transaction ids, message hashes, blockhash expiry, and synchronization blockers before relay submission.
   - 2026-08-16 progress: added `bondr-jito-packed-execution-plan-v1` so BONDR models multi-wallet packing separately from Jito's five-transaction bundle limit. The plan supports packed v0 transactions, address lookup table proof requirements, single atomic bundle waves, overflow near-synchronous waves, per-packed-transaction simulation/signed-review requirements, and explicit `atomicAcrossWaves=false` labeling.
   - 2026-08-16 progress: `/api/bundle-sequencer` and `/api/execution-capabilities` now expose the packed execution model: max transactions per Jito bundle, max packed wallets per transaction, overflow wave mode, atomicity, address lookup table proof requirement, and simulation proof per packed transaction.
   - 2026-08-16 progress: added `bondr-jito-packed-transaction-proof-v1` and read-only `/api/relay/jito/packed-transaction-proof`. It decodes transactions with lookup table resolution, verifies packed wallet signer presence, expected mint/required accounts, serialized byte limit, resolved ALT proof, exact message hash, and matching `ok` simulation proof before a packed transaction can be considered proof-complete.
   - 2026-08-16 progress: added `bondr-jito-address-lookup-table-plan-v1` and read-only `/api/relay/jito/address-lookup-table-plan`. It validates/dedupes lookup-table addresses, checks required packed-wallet addresses are planned, chunks extension transactions at 30 addresses, derives the lookup table address when creating a new table, and can build unsigned create/extend transaction bytes plus message hashes without signing or broadcasting.
   - 2026-08-16 progress: added `bondr-jito-packed-transaction-builder-v1` and read-only `/api/relay/jito/packed-transaction-build`. It compiles prepared instruction legs into unsigned v0 transactions, uses supplied ALT accounts for compression, emits transaction/message hashes, checks signer/mint/account/program policy, and never signs or submits.
   - 2026-08-16 progress: added `bondr-jito-multi-wallet-signing-session-v1` and read-only `/api/relay/jito/multi-wallet-signing-session`. It tracks required signers per packed transaction, detects missing signatures, binds signatures to the exact message hash, marks blockhash expiry as rebuild-required, and keeps custody browser-side.
   - 2026-08-16 progress: added `bondr-jito-wave-dispatch-plan-v1` and read-only `/api/relay/jito/wave-dispatch-plan`. It builds per-wave `sendBundle` payloads only after signed reviews, `ok` simulation proof hashes, explicit approval per wave, and prior-wave landed/finalized receipt proof for overflow waves.
   - 2026-08-16 progress: added `bondr-jito-bundle-chain-effect-proof-v1` and read-only `/api/relay/jito/chain-effect-proof`. It prevents relay status from being treated as execution proof until expected wallet/mint/signature/slot/token-delta observations match chain facts after landing.
   - 2026-08-16 progress: `/api/bundle-sequencer` now loads the packed transaction builder through `mode: "build-packed"` / `packedInstructions[]`, so prepared instruction legs can compile into unsigned packed v0 transaction output before proof, signing-session, wave-dispatch, and chain-effect stages.
   - 2026-08-16 progress: added `bondr-jito-route-instruction-source-v1`, allowing `/api/bundle-sequencer` to accept prepared unsigned route transactions, decode static instruction legs, and feed those legs into the packed builder. Lookup-table route transactions are blocked until supplied through a resolved source path.
   - 2026-08-16 progress: Deployment UI now exposes a Jito orchestration map: pack, prove, sign, approve, relay, settle. `/api/execution-truth-map` now reports deployment receipts and Jito bundle receipt/monitor/recovery layers as rehearsal-only proof paths instead of stale missing implementation labels.
   - 2026-08-16 progress: `/api/execution-truth-map` now also recognizes sniper trigger preview, task queue/lifecycle preview, and execution recovery policy as rehearsal-only proof contracts instead of stale missing labels, while keeping durable trigger, worker, receipt ledger, monitor, broadcast, and relay gates blocked.
   - 2026-08-16 progress: route instruction source acceptance is now route-aware for Pump.fun launch, Raydium LP, and Jupiter swap source transactions. Each route-specific prepared transaction must name the expected source endpoint, carry `routePolicyStatus:"passed"`, match the decoded transaction message hash, include the expected signer, and reference the expected mint before `/api/bundle-sequencer` can feed it into the packed builder.
   - 2026-08-16 progress: Deployment UI and `/api/execution-truth-map` now describe Jito's first orchestration step as route-policy-proven source acceptance before pack/prove/sign/approve/relay/settle.
   - Operator requirement: Jito launch work must verify wallet/multi-wallet bundle routing, rails, pathing, and synchronization together, not as isolated checks.
   - Remaining Jito blocker: route-aware source acceptance, packed building, multi-wallet signing, wave dispatch approval, and post-chain effect proof now exist; production still needs actual controlled Pump.fun/Raydium/Jupiter prepared transactions from the live routes, real post-landing account observation inputs, explicit live approval, and controlled relay-gate testing before treating Jito as executable.
   - 2026-08-16 progress: sniper trigger preview now includes `bondr-sniper-pool-freshness-proof-v1` for pool-detector/webhook triggers. Automated source previews require a valid mint, pool id, positive liquidity, slot, and fresh observation timestamp before they can clear the pool-freshness blocker.
   - 2026-08-16 progress: task queue preview now includes `bondr-task-receipt-ledger-preview-v1` and `bondr-task-monitor-recovery-preview-v1`. It models required receipt fields, idempotency keys, TP/SL/trailing watchers, stale quote/blockhash/account-lock recovery classes, and no-blind-retry policy without creating a worker, signing, persisting receipts, or broadcasting.
   - 2026-08-16 progress: task lifecycle preview now models durable-task states (`queued`, `waiting`, `ready`, `signed-required`, `completed`, etc.), stable task ids, idempotency keys, pause/resume/cancel controls, cooldown, max-run completion, TP/SL/trailing/take-profit trigger readiness, and unsigned-build-next-action hints while keeping execution preview-only.
   - Remaining sniper/task blocker: durable trigger source, durable task worker, durable receipt ledger, live monitor worker, and automatic recovery runner are still intentionally blocked before autonomous/live automation.

## Verification log

- 2026-08-16: `pnpm smoke:bondr` passed against production; artifact written under `/tmp`, pages=16, apis=7, failures=0, broadcast disabled, deployment disabled, signer `browser-wallet`, signing disabled, readiness `disabled`.
- 2026-08-16: `pnpm test -- test/provider-readiness.test.ts` passed; current script runs the full `test/*.test.ts` suite, 280 passing.
- 2026-08-16: `pnpm web:check` passed.
- 2026-08-16: `git diff --check` passed.
- 2026-08-16: `pnpm test -- test/execution-handoff.test.ts` passed; current script runs the full `test/*.test.ts` suite, 285 passing.
- 2026-08-16: `pnpm web:check` passed after hash-bound simulation/signed-review handoff changes.
- 2026-08-16: final sprint gates passed: `pnpm test` (285 passing), `pnpm web:check`, `pnpm web:build`, `pnpm smoke:bondr`, and `git diff --check`. Note: one parallel `pnpm web:check` run failed while `next build` was simultaneously regenerating `.next/types`; rerunning typecheck by itself after build passed.
- 2026-08-16: `pnpm test -- test/live-activation.test.ts` passed; current script runs the full `test/*.test.ts` suite, 289 passing.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed; current script runs the full `test/*.test.ts` suite, 291 passing.
- 2026-08-16: `pnpm web:check` passed after proof-bound launch receipt changes.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after Raydium LP burn simulation handoff changes; current script runs the full `test/*.test.ts` suite, 292 passing.
- 2026-08-16: `pnpm web:check` passed after Raydium LP burn simulation handoff changes.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after Raydium post-broadcast LP account proof changes; current script runs the full `test/*.test.ts` suite, 293 passing.
- 2026-08-16: `pnpm web:check` and `git diff --check` passed after Raydium post-broadcast LP account proof changes.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after Jito bundle status normalization changes; current script runs the full `test/*.test.ts` suite, 294 passing.
- 2026-08-16: `pnpm web:check` and `git diff --check` passed after Jito bundle status normalization changes.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after Jito wallet/rail synchronization changes; current script runs the full `test/*.test.ts` suite, 295 passing.
- 2026-08-16: `pnpm web:check` and `git diff --check` passed after Jito wallet/rail synchronization changes.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after Jito packed execution/wave planning changes; current script runs the full `test/*.test.ts` suite, 297 passing.
- 2026-08-16: `pnpm web:check` and `git diff --check` passed after Jito packed execution/wave planning changes.
- 2026-08-16: `pnpm test -- test/transaction-policy.test.ts test/deployment-readiness.test.ts` passed after Jito packed transaction proof route changes; current script runs the full `test/*.test.ts` suite, 300 passing.
- 2026-08-16: `pnpm web:check` and `git diff --check` passed after Jito packed transaction proof route changes.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after Jito address lookup table lifecycle planning changes; current script runs the full `test/*.test.ts` suite, 302 passing.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after the final Jito packed builder/signing/wave/effect proof contracts; current script runs the full `test/*.test.ts` suite, 307 passing.
- 2026-08-16: `pnpm web:check` and `git diff --check` passed after the final Jito proof contracts.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after loading the packed builder into `/api/bundle-sequencer`; current script runs the full `test/*.test.ts` suite, 309 passing.
- 2026-08-16: `pnpm web:check`, `pnpm web:build`, and `git diff --check` passed after loading the packed builder into `/api/bundle-sequencer`.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after authenticated QA, route-instruction source wiring, and Deployment Jito orchestration updates; current script runs the full `test/*.test.ts` suite, 313 passing.
- 2026-08-16: `pnpm web:check`, `pnpm web:build`, and `git diff --check` passed after authenticated QA, route-instruction source wiring, and Deployment Jito orchestration updates.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after sniper/task/recovery truth-map alignment; current script runs the full `test/*.test.ts` suite, 313 passing.
- 2026-08-16: `pnpm web:check`, `pnpm web:build`, and `git diff --check` passed after sniper/task/recovery truth-map alignment.
- 2026-08-16: local authenticated QA machine pass succeeded against `http://localhost:3000` with Meridian session cookie, checklist `ready`, 10/10 tab routes HTTP 200, no app error shell, and all local live gates disabled.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after Raydium real receipt/account observation proof wiring; current script runs the full `test/*.test.ts` suite, 315 passing.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after sniper/task automation preview contracts; current script runs the full `test/*.test.ts` suite, 317 passing.
- 2026-08-16: `pnpm web:check` passed after sniper/task automation preview contracts.
- 2026-08-16: final item 8 checks passed: `pnpm test` (317 passing), `pnpm web:check`, `pnpm web:build`, `git diff --check`, and `pnpm smoke:bondr`; production smoke artifact `/tmp/bondr-smoke-solana-spl-market-maker.vercel.app-2026-08-17T00-06-34-619Z.json`, pages=16, apis=7, failures=0, broadcast disabled, deployment disabled, signer `browser-wallet`, signing disabled, readiness `disabled`.
- 2026-08-16: section 9 risk/kill-switch checks passed: `pnpm test -- test/live-activation.test.ts test/deployment-readiness.test.ts` (repo harness ran full `test/*.test.ts`, 320 passing), `pnpm web:check`, `pnpm test` (321 passing), `pnpm web:build`, and `pnpm smoke:bondr`; production smoke artifact `/tmp/bondr-smoke-solana-spl-market-maker.vercel.app-2026-08-17T00-17-13-317Z.json`, pages=16, apis=7, failures=0, broadcast disabled, deployment disabled, signer `browser-wallet`, signing disabled, readiness `disabled`.
- 2026-08-16: section 13 observability/recovery checks passed: `pnpm test -- test/deployment-readiness.test.ts test/turnkey-wallet-auth.test.ts` (repo harness ran full `test/*.test.ts`, 324 passing), `pnpm web:check`, `pnpm test` (324 passing), `pnpm web:build`, `git diff --check`, and `pnpm smoke:bondr`; production smoke artifact `/tmp/bondr-smoke-solana-spl-market-maker.vercel.app-2026-08-17T00-28-55-883Z.json`, pages=16, apis=7, failures=0, broadcast disabled, deployment disabled, signer `browser-wallet`, signing disabled, readiness `disabled`.
- 2026-08-16: `pnpm test`, `pnpm web:check`, `pnpm web:build`, `git diff --check`, and `pnpm smoke:bondr` passed after Raydium LP account proof route wiring; production smoke artifact `/tmp/bondr-smoke-solana-spl-market-maker.vercel.app-2026-08-16T23-45-34-111Z.json`, pages=16, apis=7, failures=0, broadcast/deployment/signing disabled, readiness `disabled`.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after route-aware Jito source acceptance for Pump.fun/Raydium/Jupiter prepared transactions; current script runs the full `test/*.test.ts` suite, 316 passing.
- 2026-08-16: `pnpm web:check`, `pnpm web:build`, `git diff --check`, and `pnpm smoke:bondr` passed after Jito route-aware source acceptance; production smoke artifact `/tmp/bondr-smoke-solana-spl-market-maker.vercel.app-2026-08-16T23-52-06-707Z.json`, pages=16, apis=7, failures=0, broadcast/deployment/signing disabled, readiness `disabled`.
- 2026-08-16: `pnpm test -- test/deployment-readiness.test.ts` passed after sniper pool-freshness proof plus task receipt/monitor/recovery previews; current script runs the full `test/*.test.ts` suite, 317 passing.
