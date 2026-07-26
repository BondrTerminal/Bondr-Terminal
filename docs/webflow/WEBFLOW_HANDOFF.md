# Webflow Handoff

_Last updated: 2026-07-08_

## Recommended split

Use Webflow for the public-facing site and Vercel for the functional app.

Recommended domains:

```text
www.<domain>      Webflow marketing site
app.<domain>      Vercel dashboard / dApp
api.<domain>      Later backend/status API if needed
```

## Landing page sections

1. Hero: dry-run-first Solana market-making infrastructure.
2. Safety: live trading disabled until risk gates pass.
3. Dashboard preview: mode, health, venue, last observation.
4. Mechanics: observe → decide → log → simulate → risk controls.
5. Transparency: no hidden live execution, no fake volume, no wash trading.
6. CTA: open dashboard / request access.

## Copy guardrails

Say:

- "market-maker dashboard"
- "dry-run and paper-trading first"
- "risk controls and observability"
- "legitimate liquidity operations"

Do not say:

- guaranteed profit,
- guaranteed floor,
- risk-free yield,
- volume generation,
- pump support,
- anything implying wash trading or manipulation.

## Webflow link plan

For launch v0, link Webflow CTA buttons to the Vercel app. Do not embed private dashboards in public Webflow pages.

Recommended CTAs:

- Primary hero CTA: `Open beta dashboard` → `https://app.<domain>`
- Secondary CTA: `Read safety model` → public docs/landing section
- Footer CTA: `Operator access` → `https://app.<domain>` after auth exists

Dashboard routes:

- `/` — beta dashboard UI
- `/api/health` — read-only health check
- `/api/market-maker/status` — read-only status JSON

Until auth exists, Webflow should describe the dashboard as read-only beta monitoring. Do not promise public trading controls.
