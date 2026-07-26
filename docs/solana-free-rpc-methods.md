# Solana Free/Public JSON-RPC HTTP Methods Reference

_Last pulled: 2026-07-22_

Source: Solana official RPC HTTP docs — https://solana.com/docs/rpc/http

Note: the current Solana docs list **52** HTTP JSON-RPC methods, not 48. Older references may count fewer methods or exclude some categories. Public Solana RPC endpoints are free/shared but rate-limited; production terminal work should use Helius/QuickNode/Triton/custom RPC.

## Public endpoints

| Cluster | HTTP endpoint | Notes |
|---|---|---|
| Mainnet beta | `https://api.mainnet-beta.solana.com` | Free shared public RPC; rate-limited; not production-grade. |
| Devnet | `https://api.devnet.solana.com` | Free testing cluster; faucet available. |
| Testnet | `https://api.testnet.solana.com` | Validator/test cluster. |
| Local | `http://localhost:8899` | `solana-test-validator` / local development. |

All HTTP RPC requests use JSON-RPC 2.0 over POST:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getAccountInfo",
  "params": []
}
```

## Accounts — 6 methods

| Method | What it returns | Terminal/indexer use |
|---|---|---|
| `getAccountInfo` | State and metadata for one account. | Decode mint accounts, token accounts, pool accounts, authority checks. |
| `getBalance` | Lamport balance for one account. | Wallet SOL balance, funding readiness, fee runway. |
| `getLargestAccounts` | 20 largest SOL accounts by lamport balance. | Cluster/global whale context; not token-specific. |
| `getMinimumBalanceForRentExemption` | Rent-exempt lamports for a data size. | Token/account creation preflight; deployment engine. |
| `getMultipleAccounts` | Multiple account states in request order. | Batch wallet/pool/mint/account reads. |
| `getProgramAccounts` | Accounts owned by a program, with filters. | Token holder scans, LP account scans, program-specific indexers. |

## Tokens — 5 methods

| Method | What it returns | Terminal/indexer use |
|---|---|---|
| `getTokenAccountBalance` | SPL token balance for one token account. | Exact balance of one token account. |
| `getTokenAccountsByDelegate` | Token accounts approved for a delegate. | Risk/authority analysis. |
| `getTokenAccountsByOwner` | Token accounts owned by wallet. | Wallet positions, dev holdings, token inventory. |
| `getTokenLargestAccounts` | 20 largest token accounts for a mint. | Top holder fallback when full holder scan is too heavy. |
| `getTokenSupply` | Current SPL token supply. | Holder percentage, mcap/supply math, concentration. |

## Transactions — 11 methods

| Method | What it returns | Terminal/indexer use |
|---|---|---|
| `getFeeForMessage` | Fee for a serialized message. | Swap/send/deploy fee preflight. |
| `getLatestBlockhash` | Latest blockhash + last valid block height. | Unsigned transaction builders, health checks. |
| `getRecentPrioritizationFees` | Recent priority fee samples. | Priority fee recommendations, execution settings. |
| `getSignaturesForAddress` | Confirmed signatures referencing an address. | Signature ledger, wallet history, token/pool activity fallback. |
| `getSignatureStatuses` | Confirmation/status for signatures. | Broadcast lifecycle, order execution ledger. |
| `getTransaction` | Confirmed transaction details by signature. | Trade decoding, signer/fee payer extraction, forensic reads. |
| `getTransactionCount` | Total processed transaction count. | Cluster health/throughput context. |
| `isBlockhashValid` | Whether a blockhash is still valid. | Transaction expiry/preflight safety. |
| `requestAirdrop` | Faucet lamports to a pubkey. | Devnet/testnet only; never mainnet. |
| `sendTransaction` | Submit signed transaction. | Broadcast signed browser-wallet txs. |
| `simulateTransaction` | Simulate signed transaction without broadcasting. | Preflight swap/send/deploy transactions. |

## Blocks — 10 methods

| Method | What it returns | Terminal/indexer use |
|---|---|---|
| `getBlock` | Confirmed block by slot with tx data. | Bundle/same-slot forensic analysis, transaction reconstruction. |
| `getBlockCommitment` | Stake-weighted commitment for slot. | Confirmation/commitment checks. |
| `getBlockHeight` | Current block height. | Transaction expiry math. |
| `getBlockProduction` | Validator block production counts. | Validator/cluster diagnostics. |
| `getBlocks` | Confirmed block slots in range. | Historical scan windows. |
| `getBlocksWithLimit` | Confirmed slots from start with limit. | Bounded slot scans. |
| `getBlockTime` | Estimated production time for block. | Pool age/signature time fallback. |
| `getFirstAvailableBlock` | Lowest block available in node ledger. | Archive-depth detection. |
| `getRecentPerformanceSamples` | Recent performance samples. | RPC/cluster throughput health. |
| `minimumLedgerSlot` | Lowest slot still in local ledger. | Archive-depth detection. |

## Cluster — 15 methods

| Method | What it returns | Terminal/indexer use |
|---|---|---|
| `getClusterNodes` | Known cluster nodes and versions. | Infrastructure diagnostics. |
| `getEpochInfo` | Current epoch counters. | Cluster context. |
| `getEpochSchedule` | Epoch schedule params. | Staking/epoch-aware displays. |
| `getGenesisHash` | Cluster genesis hash. | Cluster identity validation. |
| `getHealth` | RPC node health. | Runtime health check. |
| `getHighestSnapshotSlot` | Highest full/incremental snapshot slot. | RPC node freshness diagnostics. |
| `getIdentity` | RPC node identity pubkey. | RPC diagnostics. |
| `getLeaderSchedule` | Leader schedule for epoch. | Advanced slot/MEV context. |
| `getMaxRetransmitSlot` | Highest observed retransmit slot. | Node health diagnostics. |
| `getMaxShredInsertSlot` | Highest inserted shred slot. | Node health diagnostics. |
| `getSlot` | Highest slot at commitment. | Live cluster clock, stream cursor. |
| `getSlotLeader` | Validator scheduled for current slot. | Advanced slot/MEV context. |
| `getSlotLeaders` | Leaders for slot range. | Bundle/slot research; validator attribution. |
| `getVersion` | Node software version. | RPC health and compatibility. |
| `getVoteAccounts` | Current/delinquent vote accounts. | Validator/network diagnostics. |

## Economics — 5 methods

| Method | What it returns | Terminal/indexer use |
|---|---|---|
| `getInflationGovernor` | Inflation governor parameters. | Macro/SOL context. |
| `getInflationRate` | Current inflation rates. | Macro/SOL context. |
| `getInflationReward` | Inflation rewards for addresses. | Staking/validator context. |
| `getStakeMinimumDelegation` | Minimum stake delegation. | Staking-related tooling. |
| `getSupply` | Total/circulating/non-circulating SOL supply. | Macro/SOL supply context. |

## Most important methods for Meridian terminal

### Holder reader
- `getTokenSupply`
- `getTokenLargestAccounts`
- `getProgramAccounts`
- `getAccountInfo`
- `getMultipleAccounts`

### Wallet/position reader
- `getBalance`
- `getTokenAccountsByOwner`
- `getTokenAccountBalance`
- `getMultipleAccounts`

### Signature/trade indexer
- `getSignaturesForAddress`
- `getTransaction`
- `getBlock`
- `getBlockTime`
- `getSlot`

### Execution/signature lifecycle
- `getLatestBlockhash`
- `getFeeForMessage`
- `getRecentPrioritizationFees`
- `simulateTransaction`
- `sendTransaction`
- `getSignatureStatuses`
- `isBlockhashValid`

### RPC health
- `getHealth`
- `getVersion`
- `getSlot`
- `getBlockHeight`
- `getRecentPerformanceSamples`
- `getFirstAvailableBlock`
- `minimumLedgerSlot`

## Implementation notes for our app

- Public RPC is useful for basic reads but can fail on heavy calls like full holder scans. In local route smoke, public RPC already returned rate-limit/data-allowance errors.
- Helius/QuickNode/Triton/custom RPC should be preferred for terminal production data.
- For token holder lists, use:
  1. `getProgramAccounts` with SPL Token Program filters when RPC permits.
  2. Fallback to `getTokenLargestAccounts` + `getAccountInfo/getMultipleAccounts` owner decoding.
- For trade tape, raw Solana RPC alone is not enough unless paired with transaction decoding. Prefer Helius parsed transactions or Bitquery for trade classification, with RPC as a signature/block fallback.
- For execution, server should build unsigned transactions and browser wallet/Turnkey should sign. Server can then broadcast with `sendTransaction` and monitor with `getSignatureStatuses`.
