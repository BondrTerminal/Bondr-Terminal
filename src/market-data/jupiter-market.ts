import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MarketSnapshot } from '../types/decision.js';
import { estimatePriceImpactBps, getJupiterQuote } from '../jupiter/quote.js';
import { atomicToUi } from '../solana/token-info.js';

export async function getJupiterMarketSnapshot(args: {
  tokenMint: string;
  tokenDecimals: number;
  quoteMint: string;
  quoteDecimals?: number;
  quoteSizeSol: number;
  slippageBps: number;
  quoteUrl?: string;
  apiKey?: string;
}): Promise<MarketSnapshot> {
  const quoteDecimals = args.quoteDecimals ?? 9; // SOL default.
  const amountAtomic = BigInt(Math.max(1, Math.floor(args.quoteSizeSol * LAMPORTS_PER_SOL)));
  const quote = await getJupiterQuote({
    inputMint: args.quoteMint,
    outputMint: args.tokenMint,
    amountAtomic,
    slippageBps: args.slippageBps,
    quoteUrl: args.quoteUrl,
    apiKey: args.apiKey
  });

  const inputUi = atomicToUi(quote.inAmount, quoteDecimals);
  const outputUi = atomicToUi(quote.outAmount, args.tokenDecimals);
  const referencePrice = inputUi > 0 && outputUi > 0 ? inputUi / outputUi : null;

  return {
    observedAt: new Date().toISOString(),
    tokenMint: args.tokenMint,
    quoteMint: args.quoteMint,
    referencePrice,
    estimatedSlippageBps: estimatePriceImpactBps(quote),
    volatilityBps: null
  };
}
