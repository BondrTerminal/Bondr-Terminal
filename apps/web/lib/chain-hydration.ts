import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc } from './solana-rpc';
import { isProviderLimitedError, providerLimitedNote } from './provider-truth';
import type { Wallet } from './meridian-store';

export type HydratedWallet = Wallet & {
  chainBalanceSol: number | null;
  balanceStatus: 'live' | 'modeled' | 'provider-limited' | 'unavailable';
  balanceSource: string;
  balanceNote: string;
};

export type WalletHydrationResult = {
  provider: string;
  configured: boolean;
  observedAt: string;
  wallets: HydratedWallet[];
  status: 'live' | 'modeled' | 'partial' | 'provider-limited' | 'unavailable';
  note: string;
};

const LAMPORTS_PER_SOL = 1_000_000_000;
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DEFAULT_TIMEOUT_MS = 2_500;
const DEFAULT_MAX_LIVE_WALLETS = 25;

function timeoutMs() {
  const value = Number(process.env.WALLET_BALANCE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function maxLiveWallets() {
  const value = Number(process.env.WALLET_BALANCE_MAX_LIVE_WALLETS ?? DEFAULT_MAX_LIVE_WALLETS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_LIVE_WALLETS;
}

function modeled(wallet: Wallet, note = 'Live balance hydration skipped; using modeled Meridian store balance.'): HydratedWallet {
  return {
    ...wallet,
    chainBalanceSol: null,
    balanceStatus: 'modeled',
    balanceSource: 'meridian-store',
    balanceNote: note
  };
}

function unavailable(wallet: Wallet, note: string): HydratedWallet {
  return {
    ...wallet,
    chainBalanceSol: null,
    balanceStatus: 'unavailable',
    balanceSource: 'solana-rpc',
    balanceNote: note
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function hydrateOne(connection: Connection, wallet: Wallet, observedAt: string): Promise<HydratedWallet> {
  if (!ADDRESS_RE.test(wallet.address)) return unavailable(wallet, 'Stored wallet address is not a valid Solana public key.');
  try {
    const pubkey = new PublicKey(wallet.address);
    const lamports = await withTimeout(connection.getBalance(pubkey, 'confirmed'), timeoutMs(), `balance read for ${wallet.id}`);
    return {
      ...wallet,
      chainBalanceSol: lamports / LAMPORTS_PER_SOL,
      balanceStatus: 'live',
      balanceSource: 'solana-rpc',
      balanceNote: `Live RPC balance observed at ${observedAt}. Modeled balance remains ${wallet.balanceSol.toFixed(4)} SOL.`
    };
  } catch (error) {
    return {
      ...wallet,
      chainBalanceSol: null,
      balanceStatus: isProviderLimitedError(error) ? 'provider-limited' : 'unavailable',
      balanceSource: 'solana-rpc-getBalance',
      balanceNote: isProviderLimitedError(error) ? providerLimitedNote(error, 'live SOL balance read') : error instanceof Error ? `Live balance unavailable: ${error.message}. No live balance truth available.` : 'Live balance unavailable. No live balance truth available.'
    };
  }
}

export async function hydrateWalletBalances(wallets: Wallet[]): Promise<WalletHydrationResult> {
  const observedAt = new Date().toISOString();
  const rpc = configuredSolanaRpc();
  const uniqueWallets = Array.from(new Map(wallets.map((wallet) => [wallet.id, wallet])).values());

  if (!uniqueWallets.length) {
    return { provider: rpc.provider, configured: rpc.configured, observedAt, wallets: [], status: 'modeled', note: 'No wallets to hydrate.' };
  }

  if (!rpc.configured || process.env.WALLET_BALANCE_LIVE_DISABLED === 'true') {
    return {
      provider: rpc.provider,
      configured: rpc.configured,
      observedAt,
      wallets: uniqueWallets.map((wallet) => modeled(wallet, rpc.configured ? 'Live wallet balance hydration disabled by WALLET_BALANCE_LIVE_DISABLED=true.' : 'Dedicated Solana RPC is not configured; using modeled Meridian store balance.')),
      status: 'modeled',
      note: rpc.configured ? 'Live wallet balance hydration disabled.' : 'Solana RPC is not configured for reliable wallet hydration; modeled balances returned.'
    };
  }

  const liveWallets = uniqueWallets.slice(0, maxLiveWallets());
  const skippedWallets = uniqueWallets.slice(maxLiveWallets()).map((wallet) => modeled(wallet, `Live hydration skipped after WALLET_BALANCE_MAX_LIVE_WALLETS=${maxLiveWallets()}; using modeled balance.`));
  const connection = new Connection(rpc.url, 'confirmed');
  const hydrated = await Promise.all(liveWallets.map((wallet) => hydrateOne(connection, wallet, observedAt)));
  const resultWallets = [...hydrated, ...skippedWallets];
  const liveCount = resultWallets.filter((wallet) => wallet.balanceStatus === 'live').length;
  const unavailableCount = resultWallets.filter((wallet) => wallet.balanceStatus === 'unavailable').length;
  const providerLimitedCount = resultWallets.filter((wallet) => wallet.balanceStatus === 'provider-limited').length;

  return {
    provider: rpc.provider,
    configured: rpc.configured,
    observedAt,
    wallets: resultWallets,
    status: liveCount === resultWallets.length ? 'live' : liveCount > 0 ? 'partial' : providerLimitedCount ? 'provider-limited' : unavailableCount ? 'unavailable' : 'modeled',
    note: liveCount === resultWallets.length
      ? 'All wallet balances hydrated from Solana RPC.'
      : liveCount > 0
        ? 'Some wallet balances hydrated from Solana RPC; the rest fell back to modeled Meridian balances.'
        : providerLimitedCount
          ? 'Provider-limited: wallet live hydration did not complete; do not treat modeled balances as live zero.'
          : unavailableCount
            ? 'Wallet live hydration unavailable; no live balance truth available.'
            : 'Wallet live hydration unavailable; modeled Meridian balances returned.'
  };
}

export function displayWalletSol(wallet: Wallet | HydratedWallet): number {
  if ('chainBalanceSol' in wallet && typeof wallet.chainBalanceSol === 'number') return wallet.chainBalanceSol;
  return wallet.balanceSol;
}
