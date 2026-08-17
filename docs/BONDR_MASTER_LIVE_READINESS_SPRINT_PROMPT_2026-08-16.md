# BONDR Master Live-Readiness Sprint Prompt - 2026-08-16

You are Soulana/Codex working in:

`/Users/yakuzamoto/.openclaw/workspace/projects/solana-spl-market-maker`

Goal: move BONDR from controlled Pump.fun launch readiness into broader live-readiness by completing the remaining staged systems: Raydium original LP + LP burn, Jito bundle launch rail, sniper/task automation, and post-launch market reconciliation. Preserve the current security posture. Do not sign, broadcast, fund wallets, launch a token, add liquidity, burn LP, submit Jito bundles, enable live gates, rotate provider keys, or mutate production unless Yakuzamoto explicitly approves that separate live action.

## 1. Rehydrate State And Boundaries

Read recent context before acting:

- `memory/2026-08-15.md`
- `docs/BONDR_TEMP_LIVE_LAUNCH_TEST_PROMPT_2026-08-15.md`
- `docs/BONDR_DEPLOYMENT_FINISH_PROMPT_2026-08-14.md`
- `docs/DEPLOYMENT_DEV_WALLET_LAUNCH_READINESS_2026-08-14.md`
- `docs/BONDR_JITO_RELAY_ADAPTER.md`
- `docs/BONDR_SNIPER_TASK_ENGINE_READINESS.md`
- `docs/BONDR_MONITORING_RECOVERY_KILL_SWITCH.md`
- `docs/BONDR_BUNDLE_RECEIPTS.md`

Confirm:

- `git status --short --branch`
- `git log --oneline -5`
- production gates from `/api/execution-capabilities`
- project `sda` receipt from `/api/projects`
- dry-run from `/api/pre-live-dry-run?project=sda`

Expected starting state:

- Pump.fun single dev-wallet route is controlled-launch ready.
- `sda` is deployed and has the confirmed mint/signature persisted.
- all live gates are closed.
- server custody remains disabled.
- sensitive mutation/build routes require Meridian operator auth.

## 2. Build Raydium Original LP + Automated LP Burn

Scope: turn the Raydium path from truthful staged readiness into a real unsigned browser-signing workflow. Do not add liquidity or burn LP on-chain.

Implement:

- SPL token mint/create readiness for Raydium route if it is not already reusable from the Pump.fun path.
- Raydium original LP add transaction builder or adapter contract using the repo's existing route model.
- Required input validation: mint, deployer, base/quote amounts, quote token, slippage, fee payer, and pool parameters.
- LP token/account discovery or explicit operator-supplied LP account verification.
- LP burn unsigned transaction builder using verified LP mint/account/owner inputs.
- Simulation preview for LP add and LP burn, with no signing and no broadcast.
- Deployment engine/readiness status that distinguishes:
  - builder missing
  - inputs missing
  - unsigned transaction built
  - simulation passed
  - browser signing required
  - broadcast gate closed
- UI surface in Deployment Raydium tab that shows LP add, LP verification, and LP burn as separate steps.

Tests:

- Raydium route remains blocked until required inputs exist.
- LP add builder refuses invalid mint/owner/amount/slippage inputs.
- LP burn builder refuses unverified LP mint/account/owner inputs.
- built transactions return only unsigned handoff metadata unless explicitly requested by authenticated operator flow.
- no server private keys, no signing, no broadcast.

## 3. Build Jito Bundle Launch Rail

Scope: turn Jito from disabled/status-only into a safe unsigned bundle orchestration path. Do not submit bundles live.

Implement:

- Bundle plan object for launch legs:
  - create token / initial buy
  - optional dev buy
  - optional bundle wallets
  - optional sniper/task follow-up legs
  - Jito tip transaction
- Per-leg policy validation: max SOL, max slippage, max priority/tip, required signers, allowed programs, no controlled-wallet self-trade, no fake volume.
- Browser-signing session state that tracks which wallet must sign which leg and in what order.
- Bundle simulation/preflight response with bundle hash, leg hashes, signer map, and blockers.
- Relay status/readiness that remains disabled until `JITO_RELAY_ENABLED` and auth/env prerequisites are explicitly configured.
- Bundle receipt model that can persist relay status after a future real submission.

Tests:

- bundle cannot submit while relay/gates are closed.
- invalid tip/slippage/controlled-wallet crossing blocks before provider/relay call.
- bundle preflight exposes signing order and required signers.
- no Jito relay submit, signing, broadcast, or private key use happens in tests.

## 4. Build Sniper And Task Automation

Scope: turn sniper/task from preview-only into a durable, policy-gated automation engine that can prepare work but cannot move funds while gates are closed.

Implement:

- durable task records for timed buy/sell, smart sell, take profit, stop loss, trailing stop, and observation tasks.
- task lifecycle: queued, armed, waiting, ready, blocked, simulated, signed-required, completed, failed, expired, cancelled.
- trigger evaluator using market data, wallet state, risk rules, cooldown, and rate limits.
- unsigned transaction build handoff for eligible tasks only when policy passes.
- retry/recovery rules that avoid blind retries and stop on signer, funds, slippage, stale quote, or policy failures.
- UI/API status surfaces for queue health, next eligible task, blockers, and simulated actions.

Tests:

- tasks remain read-only/blocked while live gates are closed.
- fake-volume/self-trade behavior is blocked.
- stop-loss/trailing/take-profit rules trigger only under correct market conditions.
- rate limits and cooldowns prevent repeat execution.
- no signing, broadcast, server custody, or hidden wallet key path.

## 5. Build Post-Launch Market Reconciliation

Scope: after a launch receipt exists, BONDR should reconcile on-chain and market state into the project dashboard without inventing data.

Implement:

- receipt-driven reconciliation job/API for token mint, deployer, pair/pool, launch signature, token supply, authorities, pair URL, and launch timestamp.
- provider adapters using existing project providers where possible: Solana RPC, Pump.fun, DexScreener, GMGN/Solscan if already available.
- normalized top holders, top traders, dev-wallet position, pool/pair status, price, liquidity, market cap, volume, and migration/graduation state.
- confidence/source metadata for every field.
- stale/partial/error states instead of fake placeholders.
- UI display in Deployment/Project/Portfolio for reconciliation status and last refreshed time.

Tests:

- confirmed `sda` receipt seeds reconciliation.
- missing provider data returns partial status, not fabricated metrics.
- invalid mint/signature is rejected with `PublicKey`/signature validation.
- market reconciliation is read-only and never signs/broadcasts.

## 6. Security And Custody Verification

Re-run focused checks:

- `/api/wallet-vault` POST returns `403 wallet-vault-server-custody-disabled`.
- `/api/send-signed-transaction` with `operation:"launch"` is blocked while gates are closed.
- funding still requires funding-specific armed gate.
- launch receipt mutation requires Meridian operator auth.
- launch config mutation requires Meridian operator auth.
- sensitive Pump.fun build/create-intent requires Meridian operator auth.
- no private-key import/export/reveal UI is restored.
- tracked-file secret scan does not show committed credential literals.

Run:

- `pnpm audit --audit-level moderate`
- `pnpm test`
- `pnpm web:check`
- `pnpm web:build`
- `git diff --check`

Known caveat: `bigint-buffer` may remain through Pump/Solana SDK dependencies because the advisory references `>=1.1.6` while npm publishes only `1.1.5`. Do not force an unsafe override; report it separately.

## 7. Commit, Deploy, And Production Smoke

After local checks pass:

- commit with a clear message
- push to `origin/main`
- allow/verify Vercel production rollout
- do not enable live gates

Against `https://solana-spl-market-maker.vercel.app`, verify:

Pages:

- `/deployment?project=sda` -> 200
- `/portfolio?view=wallets&project=sda` -> 200
- `/sniper?project=sda` -> 200
- `/projects` -> 200
- retired manual signing harness route -> 404

APIs:

- `/api/execution-capabilities`
- `/api/pre-live-dry-run?project=sda`
- `/api/deployment-readiness?project=sda`
- `/api/deployment-engine?project=sda`
- `/api/projects`
- `/api/wallet-vault` POST
- `/api/send-signed-transaction` POST launch attempt
- `/api/deployment/pumpportal/build-create` sensitive POST
- `/api/projects/sda/launch-config` unauthenticated PATCH
- `/api/projects/sda/launch-receipt` unauthenticated POST

Expected:

- all live gates false
- dry-run passes or reports only accepted warnings
- no signing
- no broadcast
- no server custody
- sensitive mutations/builds require Meridian operator auth
- `sda` receipt still persisted with real mint/signature

## 8. Final Go-Live Distance Report

Report clearly:

- what is now live-ready for Pump.fun dev-wallet launch
- what is now live-ready for Raydium LP + LP burn
- what is now live-ready for Jito bundle launch
- what is now live-ready for sniper/task automation
- what is now live-ready for post-launch reconciliation
- what remains blocked
- whether dependency audit is clean or what remains
- whether dry-run passes
- whether production gates are closed
- whether security/custody boundaries hold
- exact commit hash deployed
- production rollout status
- next explicit approval needed before opening any live gate

Do not perform an actual token launch, signing, broadcast, wallet funding, Jito relay submission, Raydium LP action, LP burn, env gate enablement, or provider/account mutation unless Yakuzamoto explicitly approves that separate live action.
