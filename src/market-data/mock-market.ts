import type { MarketSnapshot } from '../types/decision.js';

export function getMockMarketSnapshot(tokenMint: string, quoteMint: string): MarketSnapshot {
  return {
    observedAt: new Date().toISOString(),
    tokenMint,
    quoteMint,
    referencePrice: null,
    estimatedSlippageBps: null,
    volatilityBps: null
  };
}
