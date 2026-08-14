# BONDR deployment finish prompt

Use this prompt in two sequential sections. Run Section 1 first, commit it if clean, then run Section 2. Do not deploy, broadcast, fund wallets, expose secrets, or enable live gates without explicit approval from Yakuzamoto.

## Section 1 — Product cleanup and launch-route architecture

Continue in `/Users/yakuzamoto/.openclaw/workspace/projects/solana-spl-market-maker`.

Context:
- Current Deployment look is directionally liked, but spacing and hierarchy still need polish.
- Remove clutter from the final product surface. The main launch screen should not be a debug dashboard.
- Existing local commits include:
  - `5bdfd44 fix: clean deployment qa report`
  - `91d06cd fix: persist safe launch risk defaults`
- Do not push/deploy unless explicitly approved.
- Leave unrelated `docs/rebrand-previews/milady.png` alone.

Research basis:
- PumpPortal token creation requires external IPFS metadata now; old direct Pump.fun IPFS upload is unsupported.
- PumpPortal `trade-local` builds locally signed transactions for buy/sell/create and supports `pool` values including `pump`, `launchlab`, `raydium-cpmm`, `bonk`, and `auto`.
- PumpPortal bundle flow supports an array body for up to five transactions/wallets and Jito submission after local signing.
- Raydium LaunchLab is the direct bonding-curve launch route that graduates into Raydium AMM.
- Raydium Trade API uses compute quote endpoints, then transaction-build endpoints, with V0 transactions and explicit compute fee controls.

Task:
1. Redesign `/deployment` into a focused launch workstation while preserving the current Bondr visual language.
2. Keep first-screen modules to:
   - Command bar with project, gates, planned/max SOL, dry-run status, and primary actions.
   - Launch setup workspace with route tabs: Token Info, Route, Dev Wallet, Bundle/Sniper/Task, Risk, Review.
   - One right operator rail with Readiness, Gates, Wallet Plan, and Dry-run Summary.
3. Move or collapse these clutter modules behind one advanced/debug drawer:
   - Backend truth
   - Route map
   - Capability map
   - Event feed
   - Raw QA report copy
   - Generic unsigned SPL launch builder
4. Replace “generic SPL launch builder” as a primary surface with route-aware adapter cards:
   - Pump.fun / PumpPortal
   - Bonk / LaunchLab candidate
   - Raydium LaunchLab
   Each card should show adapter status, required inputs, current support level, and what is still gated.
5. Preserve safety copy but make it compact and operational. No large explanatory blocks in the primary flow.
6. Fix spacing: no nested cards, no cramped rail duplication, no duplicate dry-run/report buttons, stable heights for tab panels, and mobile-safe wrapping.
7. Keep all signing, funding, broadcast, and deployment gates closed.

Verification:
- `pnpm web:check`
- `pnpm test`
- `git diff --check`
- `pnpm web:build`
- Local `/deployment?project=sda` returns `200`.
- `/api/pre-live-dry-run?project=sda` still returns `pass` with no blockers.

Commit locally with a concise message. Do not push.

## Section 2 — Dev-wallet-only live launch readiness and rails verification

Continue only after Section 1 is clean.

Goal:
Prepare BONDR to finish deployment testing with a real dev-wallet-only coin launch, while still proving bundle, sniper, and task rails can function safely against the launched mint. Stop before any real broadcast and ask for explicit approval.

Approval boundary:
Do not deploy a token, broadcast a transaction, enable `LIVE_DEPLOYMENT_ENABLED`, enable broadcast gates, fund wallets, or use private keys until Yakuzamoto approves the exact launch plan.

Required approval summary before broadcast:
- Launch venue: Pump.fun/PumpPortal, Bonk/LaunchLab, or Raydium LaunchLab
- Token name, symbol, description, image URI, website/social fields
- Dev wallet address and custody path
- Mint keypair/public key handling model
- Max dev buy SOL
- Max total SOL at risk
- Slippage cap
- Priority fee cap
- Jito tip cap, if bundle/private submission is used
- RPC/broadcast endpoint
- Confirmation that this is a public on-chain launch

Implementation task:
1. Add or harden route adapter contracts for:
   - `pumpportal-create`
   - `pumpportal-trade-local`
   - `pumpportal-jito-bundle`
   - `raydium-launchlab`
   - `raydium-trade-api`
2. Build a `dev-wallet-only` launch mode:
   - one dev wallet
   - one create/dev-buy transaction path
   - no bundle wallet broadcast
   - no sniper wallet broadcast
   - no task wallet broadcast
   - no artificial volume loop
3. Add a post-launch verification mode for bundle/sniper/task rails:
   - build transaction previews against the real mint
   - simulate where possible
   - verify signer allowlist
   - verify spend caps
   - verify slippage and priority fee caps
   - verify stop-loss/take-profit/cooldown rules
   - verify no self-trade/wash-trade loop is configured
   - do not broadcast secondary wallet actions without separate approval
4. Add transaction policy checks:
   - exact mint binding
   - exact expected signer(s)
   - no hidden writable program/account injection
   - max SOL spend cap
   - max priority fee/Jito tip cap
   - fresh blockhash
   - route/pool freshness
   - deterministic reverts are not retried
   - expiry may rebuild with fresh blockhash under retry cap
5. Add CLI/API readiness panel or script output:
   - `solana config get`
   - dev wallet balance
   - token account inspection
   - route adapter readiness
   - provider env readiness
   - final launch approval summary

Verification before asking for approval:
- `pnpm web:check`
- `pnpm test`
- `git diff --check`
- `pnpm web:build`
- `/api/pre-live-dry-run?project=sda` pass
- dry-run route adapter report shows `broadcastReady=false` until approval
- transaction previews hide raw signed bytes and never expose private keys

Final response:
Report exactly what is ready, what remains blocked, and paste the approval summary Yakuzamoto must approve before the real dev-wallet-only launch.

