# BONDR Failure Response Playbooks

Date: 2026-08-16

Purpose: give the operator one deterministic response path for common launch-test failures. These playbooks do not approve signing, broadcast, deployment, Jito relay, funding, token launch, LP creation, or task/sniper automation.

## Shared Rule

When a failure appears, stop escalation before retrying. Capture the route, digest/request id when available, project id, expected signer, expected mint, transaction message hash, simulation proof hash, provider status, and current live activation gates. Do not retry a transaction blindly.

Primary inspection routes:

- `/api/execution-capabilities`
- `/api/terminal/live-readiness`
- `/api/provider-readiness`
- `/api/rpc-health`
- `/api/execution/recovery-status`
- `/api/projects/<projectId>/launch-reconciliation`
- `/api/client-error-report`

## Auth Mismatch

Symptoms:

- Route error page shows session/auth mismatch diagnostics.
- Mutation route returns Meridian auth/session gate.
- Profile Audit shows subject, active wallet, or browser signer mismatch.

Immediate response:

- Do not sign or broadcast.
- Open `/profile` and compare Profile Audit, Turnkey subject, scoped active wallet, and browser signer.
- Use the error digest and route from the failed-closed page.
- If needed, use Reset browser session from the error page, then re-authenticate and reload the exact route.

Resolution proof:

- `/api/authenticated-qa-checklist?project=<projectId>` returns ready.
- Profile Audit shows the expected signer and active profile subject.
- The original route loads without a new error digest.

## Provider-Limited

Symptoms:

- `/api/provider-readiness`, `/api/rpc-health`, or simulation routes report `provider-limited`, quota-limited, modeled, or unavailable.
- Wallet balances show provider-limited instead of zero.

Immediate response:

- Do not treat missing balances, missing holders, or missing token accounts as empty facts.
- Do not open live gates.
- Check `/api/provider-readiness` and `/api/rpc-health` first, then retry only read-only probes after provider health recovers.

Resolution proof:

- RPC status is live, not quota-limited.
- Provider readiness contains no unredacted URL credentials, bearer values, tokens, or key-shaped query strings.
- Any previous simulation or receipt proof is regenerated from fresh provider data before signing review.

## Simulation Fail

Symptoms:

- `/api/terminal/signer-dry-run` or provider simulation route returns failed, provider-limited, message-hash mismatch, signer mismatch, or mint mismatch.

Immediate response:

- Do not request signature.
- Do not use a signed review from a previous transaction.
- Rebuild the unsigned transaction and compare `transactionMessageHash` to the simulation proof hash.
- If the provider is limited, switch to provider-limited playbook.

Resolution proof:

- Simulation status is `ok`.
- `simulationTransactionMessageHash` exactly matches the unsigned transaction message hash.
- Expected signer and expected mint match the route policy before signed review.

## Broadcast Fail

Symptoms:

- `/api/send-signed-transaction` returns broadcast error, simulation proof mismatch, stale blockhash, account lock, insufficient funds, signer/auth failure, or policy failure.

Immediate response:

- Do not resubmit the same signed transaction unless the failure classifier explicitly allows a bounded retry.
- For stale quote, slippage, insufficient funds, signer/auth, risk/HALT, invalid transaction, or unknown failure: stop and rebuild from the quote/build step.
- Confirm `maxRetries=0`, `blindRetries=false`, and `skipPreflight=false` remain true for controlled single-broadcast testing.

Resolution proof:

- A new build/simulation/signed-review chain exists with matching message hashes.
- `/api/execution/recovery-status` reports no active HALT blocker.
- `/api/execution-capabilities` still shows only the intended live gate state.

## Receipt Missing

Symptoms:

- Launch or bundle landed externally but project has no receipt.
- `/api/projects/<projectId>/launch-reconciliation` returns `launch-receipt-missing`.
- Bundle status exists but chain-effect proof is missing.

Immediate response:

- Do not invent token mint, pool, deployer, or status from UI text.
- For Pump.fun launch, manually reconcile only through authenticated `/api/projects/<projectId>/launch-receipt`.
- For Raydium LP, run the read-only LP account proof route with a real transaction signature, pool id, owner, and LP account/mint evidence.
- For Jito, treat relay status as relay proof only until chain-effect proof matches expected wallet/mint/signature/slot/token delta.

Resolution proof:

- Receipt includes signature, provider, route, expected mint, transaction message hash, simulation proof hash when available, and broadcast policy.
- Reconciliation is read-only and returns `bondr-launch-reconciliation-v1`.
- Chain-effect proof or LP proof is verified before monitor/recovery steps continue.

## Route Crash

Symptoms:

- BONDR route error shell appears.
- Production smoke detects failed-closed route guard or embedded RSC digest.
- Client widget boundary reports a component failure.

Immediate response:

- Do not use the crashed route for signing, broadcast, deployment, task, sniper, or relay approval.
- Capture route, digest, error type, diagnostics build, auth/session diagnostics, and client error report entry.
- Use Profile Audit recovery if the crash is auth/session related.
- Run `pnpm smoke:bondr` after the fix and preserve the `/tmp` artifact path.

Resolution proof:

- Route loads without failed-closed shell.
- `/api/client-error-report` stores only bounded, redacted diagnostics.
- Production smoke passes with pages, APIs, failures, gate status, signer, and readiness summary recorded.
