import { getMint } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';

export type TokenInfo = {
  mint: string;
  decimals: number;
  supplyUi: number;
};

export async function getTokenInfo(connection: Connection, mint: string): Promise<TokenInfo> {
  const account = await getMint(connection, new PublicKey(mint), 'confirmed');
  const supplyUi = Number(account.supply) / 10 ** account.decimals;
  return {
    mint,
    decimals: account.decimals,
    supplyUi
  };
}

export function uiToAtomic(amountUi: number, decimals: number): bigint {
  return BigInt(Math.floor(amountUi * 10 ** decimals));
}

export function atomicToUi(amountAtomic: bigint | string | number, decimals: number): number {
  return Number(amountAtomic) / 10 ** decimals;
}
