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
    section: 'Wallet Ops',
    route: '/wallets',
    obligation: 'Inspect wallet records, groups, archive state, and balance labels.',
    source: 'Local Meridian model plus RPC/Helius-ready SOL balance hydration.',
    blocked: 'No create, import private key, fund, collect, send, delete, or export key material.',
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
    section: 'Projects',
    route: '/projects',
    obligation: 'Coordinate project objects and module handoffs.',
    source: 'Local JSON-backed Meridian project store until durable storage is added.',
    blocked: 'No claim of production persistence, ownership enforcement, or live project automation.',
    capability: 'read-only'
  },
  {
    section: 'Project Dashboard',
    route: '/project-dashboard',
    obligation: 'Show accounting-only flow.',
    source: 'Stored project buy/sell flow events; net SOL equals sells minus buys.',
    blocked: 'No mark-to-market PnL claim for tokens still held.',
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
