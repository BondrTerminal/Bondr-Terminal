export type ReadDataState = 'installed' | 'env-missing' | 'provider-pending' | 'parser-pending' | 'disabled';

export type ReadDataContract = {
  key: string;
  label: string;
  state: ReadDataState;
  source: string;
  obligation: string;
  blocked: string;
};

export const readDataContracts: ReadDataContract[] = [
  {
    key: 'token-pairs',
    label: 'Token pair/liquidity/volume context',
    state: 'installed',
    source: 'DexScreener API fallback; token-intel/token-market-feed routes.',
    obligation: 'Show current pair, liquidity, volume, FDV/market-cap context where provider data exists.',
    blocked: 'Does not imply tradability, execution quality, or scam safety by itself.'
  },
  {
    key: 'token-supply-authority',
    label: 'Token supply/decimals/authority checks',
    state: 'installed',
    source: 'Configured Solana RPC resolver: Helius URL/API key first, then alternate RPCs, then public fallback.',
    obligation: 'Read mint supply, decimals, mint authority, freeze authority, and report RPC provider.',
    blocked: 'Does not prove distribution safety or insider behavior.'
  },
  {
    key: 'wallet-sol-balances',
    label: 'Wallet SOL balance hydration',
    state: 'installed',
    source: 'Configured Solana RPC resolver via chain-hydration and /api/wallet-balances.',
    obligation: 'Show live/configured RPC balances when available and fall back to local model with explicit status.',
    blocked: 'Does not create, fund, send, collect, or sign from wallets.'
  },
  {
    key: 'transactions',
    label: 'Recent token transactions',
    state: 'installed',
    source: 'Helius enhanced transactions when configured, then Birdeye/GeckoTerminal fallbacks.',
    obligation: 'Show recent transaction/trade rows and identify provider source.',
    blocked: 'Does not yet classify wallet age, dev sells, accumulators, or bundle clusters.'
  },
  {
    key: 'holder-concentration',
    label: 'Holder concentration / dev token balances',
    state: 'installed',
    source: 'RPC largest-token-account reads plus configured project/dev wallet token-account checks; RugCheck where available.',
    obligation: 'Show concentration/dev-balance reads where RPC/provider permits.',
    blocked: 'Does not yet infer insider networks without wallet graph parsing.'
  },
  {
    key: 'wallet-age-classifier',
    label: 'Fresh/new/old wallet classifier',
    state: 'parser-pending',
    source: 'Would use installed transaction read path plus historical first-seen/funding-source parsing.',
    obligation: 'Stay labeled as parser pending until classifier exists.',
    blocked: 'No fake fresh-wallet percentages or age claims.'
  },
  {
    key: 'average-hold-time',
    label: 'Average holding time',
    state: 'parser-pending',
    source: 'Would use buy/sell lifecycle reconstruction from transaction history.',
    obligation: 'Stay labeled as parser pending until position lifecycle model exists.',
    blocked: 'No average hold-time claims from current balance snapshots.'
  },
  {
    key: 'bundle-sniper-clustering',
    label: 'Sniper/bundle/wallet graph clustering',
    state: 'parser-pending',
    source: 'Would use Helius transaction history and/or Bitquery-style graph data.',
    obligation: 'Represent as parser/provider pending by sub-signal.',
    blocked: 'No exact sniper %, bundler %, or insider graph claims until parser/indexer exists.'
  },
  {
    key: 'pump-bonding-source',
    label: 'Pump.fun/PumpSwap bonding/migration source',
    state: 'provider-pending',
    source: 'Provider integration not selected yet.',
    obligation: 'Label migration/final-stretch monitor as provider pending.',
    blocked: 'No migration buy trigger or launch execution.'
  }
];
