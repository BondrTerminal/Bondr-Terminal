# Solana RPC / SPL Token Methods We Use

_Last checked: 2026-07-05_

## 1. `getBalance`

Official RPC docs: https://solana.com/docs/rpc/http/getbalance

Purpose: returns the SOL balance for a normal Solana account, in **lamports**.

Raw RPC shape:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getBalance",
  "params": [
    "<wallet_pubkey>",
    { "commitment": "confirmed" }
  ]
}
```

`@solana/web3.js`:

```ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const lamports = await connection.getBalance(new PublicKey(owner), 'confirmed');
const sol = lamports / LAMPORTS_PER_SOL;
```

Important:

- Result is lamports, not SOL.
- Use `confirmed` for bot observation; `finalized` is safer but slower/staler.

## 2. `getTokenAccountBalance`

Official RPC docs: https://solana.com/docs/rpc/http/gettokenaccountbalance

Purpose: returns the balance for an **SPL token account**, not a wallet owner address.

Raw RPC shape:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getTokenAccountBalance",
  "params": [
    "<token_account_pubkey>",
    { "commitment": "confirmed" }
  ]
}
```

Response value includes:

```json
{
  "amount": "9864",
  "decimals": 2,
  "uiAmount": 98.64,
  "uiAmountString": "98.64"
}
```

`@solana/web3.js`:

```ts
const tokenBalance = await connection.getTokenAccountBalance(tokenAccount, 'confirmed');
const ui = tokenBalance.value.uiAmountString;
```

Important:

- You must pass a token account address — usually the ATA, but not always.
- Prefer `uiAmountString` over `uiAmount` because `uiAmount` is deprecated/floaty.

## 3. `getTokenAccountsByOwner`

Official RPC docs: https://solana.com/docs/rpc/http/gettokenaccountsbyowner

Purpose: find token accounts owned by a wallet. This is the proper fallback when a wallet does not use the standard ATA or has multiple token accounts for the same mint.

Raw RPC shape for one mint:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getTokenAccountsByOwner",
  "params": [
    "<owner_wallet_pubkey>",
    { "mint": "<token_mint>" },
    { "commitment": "confirmed", "encoding": "jsonParsed" }
  ]
}
```

`@solana/web3.js`:

```ts
const accounts = await connection.getTokenAccountsByOwner(owner, { mint }, 'confirmed');
for (const account of accounts.value) {
  const bal = await connection.getTokenAccountBalance(account.pubkey, 'confirmed');
}
```

Bot rule:

1. Derive/check ATA first.
2. If ATA missing, call `getTokenAccountsByOwner(owner, { mint })`.
3. Sum balances across all matching accounts.

## 4. `getMint` from `@solana/spl-token`

Official JS docs: https://solana-labs.github.io/solana-program-library/token/js/functions/getMint.html

Purpose: retrieve mint metadata: decimals, supply, authority fields, etc.

Signature from docs:

```ts
getMint(connection, address, commitment?, programId?): Promise<Mint>
```

Example:

```ts
import { getMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

const mintInfo = await getMint(connection, new PublicKey(mint), 'confirmed');
console.log(mintInfo.decimals, mintInfo.supply);
```

Important:

- `supply` is bigint/raw atomic units.
- Convert UI supply as `Number(supply) / 10 ** decimals`, but be careful with huge supplies; use decimal/bigint-safe math for production.

## Bot implementation note

Our balance reader now does:

```text
wallet owner pubkey
  → getBalance(owner) for SOL
  → derive ATA for target mint
  → getTokenAccountBalance(ATA)
  → if missing, getTokenAccountsByOwner(owner, { mint })
  → sum token account balances
```

This is the correct read-only foundation for wallet inventory tracking.
