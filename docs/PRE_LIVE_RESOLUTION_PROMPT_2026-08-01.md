# Meridian Pre-Live Resolution Prompt — 2026-08-01

## Objective
Resolve as many Meridian pre-live activation warnings/blockers as possible across every hub section without enabling live trading, signing, broadcasts, funding, public deployment actions, or secret mutation unless separately approved.

## Non-negotiable safety constraints
- Keep `LIVE_TRADING_ENABLED=false`.
- Do not sign, broadcast, fund wallets, create live tokens/pools, submit bundles, or enable live relay/Jito submission.
- Do not weaken auth, same-origin, explicit-broadcast, browser-wallet signing, slippage/size caps, transaction-policy, or mutation-disable gates.
- Preserve honest confidence labels: `modeled`/`estimated` vs `provider-backed`/`high` vs `unavailable`.
- Treat Helius/RPC degradation as a known capacity item until subscription/usage is upgraded before real go-live; do not fake it as green.

## Current production facts to preserve
- `/api/pre-live-checklist`: `state=partial`, `failed=[]`, warnings: `session-authenticated`, `rpc-health`.
- Checklist items passing: dedicated RPC configured, wallet custody, local wallet backup, project wallet group, trading wallet role, max spend caps, slippage caps, risk rules, dry-run build, live trading disabled.
- `/api/execution-capabilities`: `liveTradingEnabled=false`, signer `browser-wallet`, builder `/api/execution-swap`, broadcaster `/api/send-signed-transaction`, limits `0.05 SOL`, `10 USDC`, `500 bps`.
- `/api/gmgn/readiness`: GMGN CLI ok, execution `read-only-cli-adapter-no-swap-no-cooking`; swaps/cooking/private-key execution disabled.
- `/api/terminal/live-readiness`: score about 72, live enablement about 65. Biggest categories needing cleanup: walletHydration/providerReliability due RPC, browserSigning staging not verified, signedBroadcast durable/auth policy wording, bundleSequencer relay intentionally unavailable.
- `/api/wallet-live-readiness`: partial only because dedicated RPC is degraded; vault/managed wallet/backup/session auth/live-disabled checks pass.
- Portfolio/PnL: `/api/portfolio/timeseries` is `modeled`; `/api/portfolio/fills` is unavailable from Helius wallet-history capacity. Do not claim provider-backed PnL until provider history passes.

## Implementable fixes now
1. **Fix live-store operator auth false blocker**
   - File: `apps/web/lib/live-store.ts`.
   - Problem: `operatorAuthConfigured()` only recognizes old aliases (`OPERATOR_AUTH_ENABLED`, `TERMINAL_OPERATOR_TOKEN`, `OPERATOR_SESSION_SECRET`) while production now uses `MERIDIAN_SESSION_SECRET` and `MERIDIAN_OPERATOR_KEY` through `apps/web/lib/meridian-auth.ts`.
   - Patch: import/use `meridianAuthConfig()` or mirror its env aliases so `liveStoreMetadata().authConfigured` becomes true when Meridian auth is configured.
   - Expected result: `/api/terminal/live-readiness` should stop saying “Operator auth must be configured” when `MERIDIAN_SESSION_SECRET` + `MERIDIAN_OPERATOR_KEY` are present.
   - Do not make unauthenticated requests pass. This is only metadata readiness alignment.

2. **Clarify session-authenticated warning as operator-login-required, not platform-broken**
   - File candidates: `apps/web/app/components/MeridianStatusBadge.tsx`, pages using it, and/or `apps/web/lib/pre-live-checklist.ts` evidence text.
   - Keep warning while request lacks session cookie, but display it as “login required for this browser session” and link/point to the operator auth flow if present.
   - Do not downgrade auth to pass unless `meridianSessionStatus()` returns authenticated.

3. **Normalize hub-wide status language**
   - Pages: `/projects`, `/project-dashboard`, `/deployment`, `/wallets`, `/sniper`, `/portfolio`, `/liquidity`.
   - Goal: every section should show one of: `Ready`, `Partial / needs operator action`, `Known capacity item`, or `Blocked until live activation`.
   - Avoid scary duplicate blockers for accepted Helius capacity. Keep it visible as “Known provider capacity upgrade before real go-live,” not as a product bug.

4. **Add a “Pre-live resolution matrix” route/card**
   - Add or update a read-only API that aggregates:
     - `/api/pre-live-checklist`
     - `/api/execution-capabilities`
     - `/api/wallet-live-readiness`
     - `/api/provider-readiness`
     - `/api/terminal/live-readiness`
     - `/api/portfolio`, `/api/portfolio/fills`, `/api/portfolio/timeseries`
     - `/api/deployment-engine`, `/api/wallet-ops-engine`, `/api/terminal-backend`
   - Output should group issues into:
     - `resolved/pass`
     - `fixable-in-code`
     - `operator-action-required`
     - `external-provider-required`
     - `intentionally-disabled-until-live`
   - This can be surfaced in the hub or status page, but must be read-only.

5. **Improve terminal live-readiness category evidence**
   - File: `apps/web/app/api/terminal/live-readiness/route.ts`.
   - Once auth metadata is fixed, adjust categories:
     - `orderLifecycle` and `mutationDurability` should become mostly-ready if Neon/Postgres + Meridian auth are configured.
     - Keep `signedBroadcast` partial until staging signer-match test and explicit live ceremony.
     - Keep `bundleSequencer` partial/unavailable for relay until relay provider + simulation are actually implemented.

6. **Add/extend tests**
   - Test that live-store production readiness accepts Meridian auth env names.
   - Test that pre-live checklist still returns `liveExecutionAllowed:false` and does not pass unauthenticated browser sessions as authenticated.
   - Test terminal live-readiness preserves RPC/provider blockers and signer-staging blockers.

## Validation gate
Run:
```bash
pnpm check
pnpm web:check
pnpm test
pnpm web:build
```
Then probe production/local routes after deploy approval:
```bash
/api/pre-live-checklist
/api/execution-capabilities
/api/wallet-live-readiness
/api/provider-readiness
/api/terminal/live-readiness
/api/portfolio
/api/portfolio/fills
/api/portfolio/timeseries
```

## Cannot resolve without external/operator action
1. **RPC/Helius reliability**
   - Need upgraded subscription/usage, corrected Helius quota, or alternate dedicated RPC such as QuickNode/Triton.
   - Required before real live signing/broadcast.

2. **Authenticated browser session warning**
   - Need operator to log in/create a browser session using the configured operator key.
   - Code can improve UX, but cannot mark the current anonymous probe authenticated.

3. **Browser-wallet signer staging verification**
   - Need real browser wallet interaction with an unfunded/dev wallet to verify signer match and policy decode.
   - Do not automate private-key signing server-side.

4. **Funding readiness**
   - Funding plan exists, but live/model balances show funding gap. Need operator funding decision and actual wallet funding before real launch.
   - Do not fund wallets automatically.

5. **Token intelligence and liquidity handoff for undeployed project**
   - MERIDIAN-DEMO has no live mint/pool yet. Sniper token intelligence and liquidity handoff cannot fully pass until a mint/pool exists or operator pastes a token mint for analysis.

6. **Provider-backed/high-confidence PnL**
   - Requires passing provider history capacity (Helius/Birdeye) and real wallet transaction history.
   - Keep PnL `modeled`/`estimated` until then.

7. **Bundle/Jito relay live path**
   - Requires relay provider credentials, bundle simulation, durable intent/order tracking, auth, and explicit live activation ceremony.
   - Keep relay unavailable/disabled for now.

8. **Live activation itself**
   - Requires explicit user confirmation after all above gates pass.
   - Do not set `LIVE_TRADING_ENABLED=true` in this prompt.
