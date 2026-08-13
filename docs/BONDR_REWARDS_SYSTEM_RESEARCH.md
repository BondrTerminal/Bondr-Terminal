# BONDR Rewards System Research

_Date: 2026-08-11_

## Scope

Public research on Axiom, Photon, BullX, Padre/Terminal, Pump.fun, and the Pump.fun/Padre relationship, focused on trading fees, referral/reward percentages, payout systems, points/rebates/rewards, API/CLI/affiliate systems, and whether rewards are tied to volume/referrals/PnL/launches.

This is **research/design only**. No reward accounting, payout engine, fee routing, claims, token issuance, or external API write has been implemented.

## Key Takeaways

- The strongest public precedent for **trader rewards from platform fees** is Axiom’s SOL cashback + referral commission model.
- The strongest public precedent for **developer/creator rewards from platform transaction fees** is Pump.fun’s creator-fee model.
- BullX publicly ties points/airdrop allocation to **trading volume** and referrals.
- Photon has a 1% fee and public points/leaderboard/jackpot language, but public referral/rebate percentages are unclear.
- Padre/Terminal appears to emphasize SOL cashback/rebates, including referral-boosted cashback, but exact current fee/rebate terms should be verified in-app.
- Public coverage reports Pump.fun acquired Padre/Terminal in Oct. 2025 to vertically integrate more of the launch + trading stack.

## Platform Findings

| Platform | Trading fees | Rewards / rebates | Referrals / affiliates | API / CLI | Reward basis |
|---|---:|---|---|---|---|
| Axiom | Public sources/docs describe ~1% gross fee with tiered net fee after cashback: Wood 0.95% net / 0.05% cashback up to Champion 0.75% net / 0.25% cashback. | SOL cashback tied to rank/multiplier. Points via trading, referrals, quests. | 3-tier referrals: 30% direct, 3% level 2, 2% level 3 of Axiom net fees. Referred users receive fee discount per docs/search snippets. | No official public API found; third-party data providers claim Axiom does not offer a public API. | Trading volume, referrals, quests. No public PnL-based rewards found. |
| Photon | Official GitBook/public docs report 1% fee in SOL on every buy and sell. | Public leaderboard/points/jackpot references exist, but exact current payout formula unclear. | Referral points mentioned publicly; no reliable public percentage rev-share found. | No official public trading API found. Bitquery-style analytics can identify Photon route activity by program address. | Trading/activity and missions/leaderboard appear likely; exact formula unknown. No PnL-based rewards confirmed. |
| BullX | Official docs report 1% platform fee on every buy/sell, separate from protocol/network fees. | BullX points/airdrop docs: 1 point per $1 trading volume base; leaderboard multipliers; loyalty score. | Affiliate/referral rewards are based on referred users’ activity/transactions; terms say tiers are determined by successful referrals and referred volume. Airdrop docs reference 6% allocation for referrals. | No official public trading API found. Some analytics vendors expose BullX-style Solana trade data. | Trading volume, referrals, loyalty/leaderboard. No PnL-based rewards confirmed. |
| Padre / Terminal | Public reviews report ~0.5–1% platform fee; exact current official rate should be verified in-app. | Public reviews report 10% default SOL cashback and up to 35% with referral. Official docs access appears app-gated/redirected, so treat exact current terms as verify-in-app. | Referral links appear tied to boosted cashback. Exact current referral economics unknown publicly. | No fully public official API docs found. Public sources mention advanced/custom API support, but exact endpoints unknown. | Trading fee rebates and referrals. No PnL-based rewards confirmed. |
| Pump.fun | Public docs/reporting: create coin = 0 SOL / 0 USDC; graduation to PumpSwap = 0.015 SOL. Bonding curve fees reported as creator 0.300%, protocol 0.95%, LP 0%, total 1.25%. PumpSwap canonical pools have dynamic creator/protocol/LP fees by market cap. | Creator fees paid from token trading fees. Creator fee applies to eligible coins on bonding curve or PumpSwap. | Some mobile fee increases may be paid to creators, fee owners, users, or user referrers. No broad public affiliate program confirmed. | Official API unclear; third-party PumpPortal offers Trading API, Local Transaction API, Lightning API, Data API, and creator-fee claiming examples. | Developer/creator rewards tied to token trading volume/launch success. No trader PnL rewards confirmed. |

## Pump.fun / Padre Relationship

Public coverage says Pump.fun acquired multichain trading terminal Padre on Oct. 24, 2025 for an undisclosed amount. Coverage frames the acquisition as Pump.fun moving from pure launchpad toward control of more of the memecoin process: launch, trading UX, data, routing, and incentives. Public coverage also says Padre would continue operating with UX/speed/data/trading-incentive upgrades, especially around Pump.fun-launched tokens, and that PADRE token utility was discontinued after the acquisition.

Sources to verify/follow:

- Brave New Coin: `https://bravenewcoin.com/insights/pump-fun-acquires-padre-trading-terminal-as-memecoin-market-cools`
- TradingView / NewsBTC coverage: `https://www.tradingview.com/news/newsbtc:ab80f137e094b:0-pump-rallies-10-following-pump-fun-s-acquisition-of-trading-terminal-padre/`

## BONDR Reward Model Proposal

### Design Goal

Use BONDR platform transaction fees to reward both sides of the marketplace:

1. **Traders** — rewarded for real trading volume and loyalty.
2. **Developers / launchers** — rewarded when BONDR-launched assets create sustained real trading activity.

### Example Fee Split

Assume BONDR charges a configurable platform fee on each trade, e.g. `1.00%`.

Example split of the platform fee:

- **40% Protocol Treasury** — operations, infrastructure, provider costs, liquidity partnerships.
- **25% Trader Rewards Pool** — rebates/cashback based on eligible trading volume.
- **25% Developer Rewards Pool** — creator-fee / launch-success rewards.
- **10% Referral / Affiliate Pool** — user acquisition and partner incentives.

Exact percentages should not be chosen until competitor fee research is re-verified, legal/accounting constraints are reviewed, and BONDR’s own transaction cost structure is known.

### Trader Volume Rewards

Reward traders from the Trader Rewards Pool using verified net trading volume.

Suggested rules:

- Base rebate: proportional to the user’s eligible trading volume in an epoch.
- Tier boost: higher volume tiers increase rebate percentage.
- Loyalty boost: sustained multi-day/week activity gets a multiplier.
- Referral multiplier: optional and capped.
- Payout: claimable SOL, USDC, BONDR credits, or points; start with **points/accounting display only** until payout infrastructure exists.

Anti-abuse filters:

- Exclude self-trades and same-owner wallet clusters where detectable.
- Cap rewards from circular volume.
- Require minimum holding time or price-risk exposure for high rewards.
- Downweight abnormal loss-tolerant churn.
- Flag repeated bundle/sniper/volume patterns that look like fake volume.

### Developer Launch Rewards

Reward developers through a creator-fee model inspired by Pump.fun.

Possible mechanics:

- Each BONDR-launched token can receive a creator-fee share from trading fees on that token.
- Creator rewards scale with real market demand:
  - organic trading volume;
  - unique trader count;
  - holder count;
  - graduation/migration success;
  - liquidity quality;
  - absence of dev-dump/manipulation flags.
- During bonding/early launch: creator receives 20–30% of BONDR platform fee from that token.
- After graduation: creator receives 5–15%, with more routed to LP/protocol/trader rewards as market cap rises.

Optional creator routing choices:

- Claim creator fees.
- Redirect to trader cashback for that token.
- Redirect to buybacks/liquidity.
- Redirect to community treasury.

### Referral / Affiliate Rewards

Suggested model:

- Direct referral: 20–30% of BONDR net protocol fee from referred users for a limited period.
- Level 2/3 referrals should be much smaller if used at all.
- Referral rewards should be capped and abuse-reviewed.
- Referred traders may receive a fee discount or cashback boost.

### Reward Surfaces in Product

Add placeholder UI now; defer engine implementation:

- Project Dashboard: total rewards placeholder, developer rewards placeholder by project.
- Terminal: trader volume rewards placeholder.
- Wallet Ops: preset/task behavior can feed future reward attribution.
- GitHub/Hub: document reward model as planned, not live.

## Implementation Guardrails

- Do not advertise guaranteed yield.
- Do not reward wash trading, spoofing, self-trading, or fake volume.
- Do not imply rewards are payable until funding, accounting, terms, and claim mechanics exist.
- Keep every reward metric auditable and explainable.
- Rewards should be transparent enough that users understand what action creates points/rebates and what disqualifies abuse.
- Start with read-only reward accounting/points before implementing claims or payouts.
