export type MeridianObligation = {
  section: string;
  route: string;
  obligation: string;
  source: string;
  blocked: string;
  capability: 'read-only' | 'backend-wired' | 'live-gated' | 'disabled';
};

export const meridianObligationMatrix: MeridianObligation[] = [
  {
    section: 'Profile',
    route: '/profile',
    obligation: 'Represent operator identity only.',
    source: 'Turnkey read-only user/wallet/account metadata when configured.',
    blocked: 'No signing authority, trading permission, export, or wallet mutation.',
    capability: 'read-only'
  },
  {
    section: 'Portfolio Wallets',
    route: '/portfolio?view=wallets',
    obligation: 'Inspect wallet records, groups, archive state, and balance labels.',
    source: 'Local Meridian model plus RPC/Helius-ready SOL balance hydration.',
    blocked: 'No create, import sensitive credential, fund, collect, send, delete, or export key material.',
    capability: 'read-only'
  },
  {
    section: 'Sniper / Terminal',
    route: '/sniper',
    obligation: 'Analyze token context and show disabled action surfaces.',
    source: 'DexScreener, Jupiter route preview, RPC/Helius-ready supply/authority checks, transaction feed fallbacks.',
    blocked: 'No buy, sell, snipe, bundle execution, order placement, or signing.',
    capability: 'read-only'
  },
  {
    section: 'Token Analyzer',
    route: '/token-analyzer',
    obligation: 'Label token risk data by source truth.',
    source: 'DexScreener/RPC/RugCheck/transaction APIs where available; Helius parsers marked pending.',
    blocked: 'No fake wallet-age, average-hold, sniper %, bundler, or insider graph claims.',
    capability: 'read-only'
  },
  {
    section: 'Deployment',
    route: '/deployment',
    obligation: 'Model launch preparation and blockers.',
    source: 'Local project metadata, launch path, funding assumptions, wallet readiness, and preflight state.',
    blocked: 'No token deployment, launch bundle, funded action, pool creation, or launch signing.',
    capability: 'disabled'
  },
  {
    section: 'Project Dashboard',
    route: '/projects',
    obligation: 'Coordinate project objects, net-flow history, ATH labels, and module handoffs from one unified dashboard.',
    source: 'Local JSON-backed BONDR project store plus stored buy/sell flow events; legacy aliases are not separate product modules.',
    blocked: 'No separate legacy project list, no mark-to-market PnL claim for tokens still held, and no live project automation.',
    capability: 'read-only'
  },
  {
    section: 'Liquidity Engine',
    route: '/liquidity',
    obligation: 'Observe market state and expose backend-wired terminal engines.',
    source: 'Live market/wallet snapshots, terminal backend status, and gated execution routes.',
    blocked: 'No live orders, venue writes, swaps, cancellations, or signer use.',
    capability: 'backend-wired'
  }
];
