export type Side = 'buy' | 'sell' | 'wait';

export type MarketSnapshot = {
  observedAt: string;
  tokenMint: string;
  quoteMint: string;
  referencePrice: number | null;
  estimatedSlippageBps: number | null;
  volatilityBps: number | null;
};

export type WalletSnapshot = {
  name: string;
  pubkey: string;
  solBalance: number;
  tokenBalance: number;
};

export type Decision = {
  observedAt: string;
  side: Side;
  sizeSol: number;
  reason: string;
  riskPassed: boolean;
  riskReasons: string[];
  wallet: string | null;
};
