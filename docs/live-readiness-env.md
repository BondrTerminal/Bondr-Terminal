# Meridian Trading Terminal live-readiness env

Do **not** enable live trading until provider, storage, intent-policy, browser-signing, and relay gates are all verified in staging.

```env
# Required before live trading
LIVE_TRADING_ENABLED=false
SOLANA_RPC_URL=
HELIUS_RPC_URL=
HELIUS_API_KEY=
QUICKNODE_RPC_URL=
TRITON_RPC_URL=

# Optional provider enrichments
BIRDEYE_API_KEY=
BITQUERY_API_KEY=
JUPITER_API_KEY=

# Live safety limits
LIVE_MAX_SOL_PER_SWAP=0.05
LIVE_MAX_USDC_PER_SWAP=10
LIVE_MAX_SLIPPAGE_BPS=500
MUTATIONS_DISABLED=false

# Durable storage/auth readiness
# Local JSON is development-only. Production live mode must use durable authenticated storage.
DATABASE_URL=
LIVE_STORE_DATABASE_URL=

# Relay/Jito readiness — keep unset until real integration/simulation/auth exists
JITO_BLOCK_ENGINE_URL=
JITO_AUTH_KEYPAIR_OR_TOKEN=
```

## Required before live mode

1. Configure a reliable private Solana RPC (`HELIUS_RPC_URL`, `HELIUS_API_KEY`, `QUICKNODE_RPC_URL`, `TRITON_RPC_URL`, or `SOLANA_RPC_URL`).
2. Add durable authenticated storage for orders, intents, and mutation audit logs.
3. Verify `/api/terminal/intents` creates intent-bound transaction policies.
4. Verify `/api/terminal/signer-dry-run` with an unfunded/dev wallet signed transaction.
5. Keep relay/Jito disabled until real relay provider credentials, simulation, and auth checks are implemented.

Check current status with:

- `/api/provider-readiness`
- `/api/terminal/live-readiness`
