import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc } from './solana-rpc';
import type { Wallet } from './meridian-store';

const BALANCE_TIMEOUT_MS = 6_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs = BALANCE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('RPC request timed out.')), timeoutMs))
  ]);
}

export type HydratedWallet = Wallet & {
  chainBalanceSol: number | null;
  balanceSource: string;
  balanceStatus: 'live' | 'stored-fallback' | 'invalid-address' | 'unavailable';
  balanceNote: string;
};

export type WalletHydrationResult = {
  wallets: HydratedWallet[];
  provider: string;
  configured: boolean;
  observedAt: string;
};

export async function hydrateWalletBalances(wallets: Wallet[]): Promise<WalletHydrationResult> {
  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');

  const hydrated = await Promise.all(wallets.map(async (wallet) => {
    try {
      const pubkey = new PublicKey(wallet.address);
      const lamports = await withTimeout(connection.getBalance(pubkey, 'confirmed'));
      return {
        ...wallet,
        chainBalanceSol: lamports / 1_000_000_000,
        balanceSource: rpc.provider,
        balanceStatus: 'live' as const,
        balanceNote: 'Live SOL balance read from configured Solana RPC.'
      };
    } catch (error) {
      const invalid = error instanceof Error && error.message.toLowerCase().includes('invalid');
      return {
        ...wallet,
        chainBalanceSol: null,
        balanceSource: rpc.provider,
        balanceStatus: invalid ? 'invalid-address' as const : 'stored-fallback' as const,
        balanceNote: invalid ? 'Wallet address failed Solana public-key validation.' : `Live balance unavailable; showing stored balance fallback. ${error instanceof Error ? error.message : 'RPC failed.'}`
      };
    }
  }));

  return {
    wallets: hydrated,
    provider: rpc.provider,
    configured: rpc.configured,
    observedAt: new Date().toISOString()
  };
}

export function displayWalletSol(wallet: Wallet | HydratedWallet): number {
  return 'chainBalanceSol' in wallet && typeof wallet.chainBalanceSol === 'number' ? wallet.chainBalanceSol : wallet.balanceSol;
}
