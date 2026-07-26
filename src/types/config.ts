export type BotMode = 'dry-run' | 'paper' | 'live';
export type Venue = 'jupiter' | 'openbook' | 'raydium' | 'orca' | 'meteora';

export type WalletConfig = {
  name: string;
  pubkey: string;
  maxSolToUse: number;
  minSolReserve: number;
  maxTokenInventory: number;
  targetTokenInventory: number;
};

export type MarketMakerConfig = {
  mode: BotMode;
  cluster: 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet';
  rpcUrlEnv: string;
  tokenMint: string;
  quoteMint: string;
  wallets: WalletConfig[];
  globalRisk: {
    maxTotalSolExposure: number;
    maxTradeSol: number;
    maxTradesPerMinute: number;
    maxSlippageBps: number;
    maxDailyLossSol: number;
    killSwitchDrawdownBps: number;
    maxMarketDataAgeMs: number;
  };
  quoting: {
    baseSpreadBps: number;
    minSpreadBps: number;
    maxSpreadBps: number;
    inventorySkewBps: number;
    volatilitySpreadMultiplier: number;
    minDelayMs: number;
    maxDelayMs: number;
  };
  execution: {
    venues: Venue[];
    priorityFeeLamports: number;
    useJito: boolean;
    maxRetries: number;
  };
};
