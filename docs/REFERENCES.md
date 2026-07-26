# References

_Last checked: 2026-07-05_

## Core Solana

- Solana docs: https://solana.com/docs
- Official JS/TS client docs: https://solana.com/docs/clients/official/javascript
- `@solana/web3.js`: https://github.com/solana-foundation/solana-web3.js
- SPL Token JS docs: https://solana-labs.github.io/solana-program-library/token/js/
- `getBalance` RPC: https://solana.com/docs/rpc/http/getbalance
- `getTokenAccountBalance` RPC: https://solana.com/docs/rpc/http/gettokenaccountbalance
- `getTokenAccountsByOwner` RPC: https://solana.com/docs/rpc/http/gettokenaccountsbyowner
- SPL Token `getMint`: https://solana-labs.github.io/solana-program-library/token/js/functions/getMint.html
- SPL Token `getAccount`: https://solana-labs.github.io/solana-program-library/token/js/functions/getAccount.html
- Solana RPC overview: https://solana.com/docs/rpc
- Jupiter quote docs: https://developers.jup.ag/docs/swap/v1/get-quote.md
- Anchor docs: https://www.anchor-lang.com/docs

## Execution / venues

- Jupiter docs: https://dev.jup.ag/docs/
- Jupiter API npm: https://www.npmjs.com/package/@jup-ag/api
- Raydium SDK v2: https://github.com/raydium-io/raydium-sdk-V2
- Orca Whirlpools: https://github.com/orca-so/whirlpools
- Meteora DLMM SDK: https://github.com/MeteoraAg/dlmm-sdk
- OpenBook v2: https://github.com/openbook-dex/openbook-v2
- OpenBook v2 Market state source: https://github.com/openbook-dex/openbook-v2/blob/master/programs/openbook-v2/src/state/market.rs
- OpenBook v2 TS Market client: https://github.com/openbook-dex/openbook-v2/blob/master/ts/client/src/accounts/market.ts

OpenBook v2 fee note checked 2026-07-13:

- Fees are market-specific fields on the on-chain Market account: `maker_fee` and `taker_fee`.
- Source comment: for a 1 bps taker fee, set `taker_fee` to `100`; `FEES_SCALE_FACTOR = 1_000_000`.
- Conversion for paper assumptions: raw fee units / 100 = bps.
- `maker_fee < 0` represents a maker rebate from taker fees; `taker_fee` is non-negative.
- Therefore no global OpenBook fee preset should be treated as live truth; decode the target market account before live-readiness review.

## Advanced execution

- Jito low latency / bundles: https://docs.jito.wtf/lowlatencytxnsend/
- Jito TS SDK: https://github.com/jito-labs/jito-ts

## Oracles / data

- Pyth docs: https://docs.pyth.network/
- Pyth Hermes client: https://www.npmjs.com/package/@pythnetwork/hermes-client

## Notes

Some docs pages move frequently. Treat this file as the starting map, then verify exact endpoint/API signatures before implementation.
