import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { WalletConfig } from '../types/config.js';
import type { WalletSnapshot } from '../types/decision.js';

async function getTokenBalanceForOwner(args: {
  connection: Connection;
  owner: PublicKey;
  mint: PublicKey;
}): Promise<number> {
  // Fast path: most SPL balances live in the associated token account (ATA).
  const ata = getAssociatedTokenAddressSync(args.mint, args.owner, true, TOKEN_PROGRAM_ID);
  const ataBalance = await args.connection.getTokenAccountBalance(ata, 'confirmed').catch(() => null);
  if (ataBalance) {
    return Number(ataBalance.value.uiAmountString ?? ataBalance.value.uiAmount ?? 0);
  }

  // Fallback: wallets can own non-ATA token accounts. Query all accounts for this mint.
  const tokenAccounts = await args.connection.getTokenAccountsByOwner(args.owner, { mint: args.mint }, 'confirmed');
  let total = 0;
  for (const keyedAccount of tokenAccounts.value) {
    const balance = await args.connection.getTokenAccountBalance(keyedAccount.pubkey, 'confirmed').catch(() => null);
    if (balance) total += Number(balance.value.uiAmountString ?? balance.value.uiAmount ?? 0);
  }
  return total;
}

export async function getWalletSnapshot(args: {
  connection: Connection;
  walletConfig: WalletConfig;
  tokenMint: string;
}): Promise<WalletSnapshot> {
  const owner = new PublicKey(args.walletConfig.pubkey);
  const mint = new PublicKey(args.tokenMint);

  const [lamports, tokenBalance] = await Promise.all([
    args.connection.getBalance(owner, 'confirmed'),
    getTokenBalanceForOwner({ connection: args.connection, owner, mint })
  ]);

  return {
    name: args.walletConfig.name,
    pubkey: args.walletConfig.pubkey,
    solBalance: lamports / LAMPORTS_PER_SOL,
    tokenBalance
  };
}

export async function getWalletSnapshots(args: {
  connection: Connection;
  wallets: WalletConfig[];
  tokenMint: string;
}): Promise<WalletSnapshot[]> {
  return Promise.all(args.wallets.map((walletConfig) => getWalletSnapshot({
    connection: args.connection,
    walletConfig,
    tokenMint: args.tokenMint
  })));
}
