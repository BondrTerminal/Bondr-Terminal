export type ProviderStatus = 'ok' | 'partial' | 'unavailable' | 'public-fallback' | 'optional-not-configured' | 'blocked-by-live-gate' | 'error' | 'estimated';

export type TerminalSourceStatus = {
  status?: ProviderStatus | string;
  source?: string | null;
  note?: string | null;
  configured?: boolean;
  provider?: string | null;
};

export type TerminalTradeEvent = {
  timestamp: string | null;
  side: 'buy' | 'sell' | 'unknown' | string;
  wallet: string | null;
  amount: number | string | null;
  priceUsd: number | string | null;
  volumeUsd: number | string | null;
  txHash: string | null;
  source?: string | null;
};

export type TerminalTopTrader = {
  wallet: string;
  buys: number;
  sells: number;
  boughtTokens: number;
  soldTokens: number;
  netTokens: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  totalVolumeUsd: number;
  netVolumeUsd: number;
  avgEntryUsd: number | null;
  avgExitUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  totalPnlUsd: number | null;
  txCount: number;
  firstSeenAt: string | null;
  lastTx: string | null;
  lastSeenAt: string | null;
  holdDurationHours: number | null;
  sources: string[];
  tags?: string[];
};

export type TerminalHolderAccount = {
  rank?: number;
  tokenAccount: string;
  owner: string | null;
  uiAmount: number;
  rawAmount?: string;
  decimals?: number | null;
  pctSupply?: number | null;
  valueUsd?: number | null;
  ownerSolBalance?: number | null;
  ownerBalanceStatus?: string | null;
  boughtTokens?: number | null;
  soldTokens?: number | null;
  netTokensFromTape?: number | null;
  buyVolumeUsd?: number | null;
  sellVolumeUsd?: number | null;
  avgEntryUsd?: number | null;
  avgExitUsd?: number | null;
  realizedPnlUsd?: number | null;
  unrealizedPnlUsd?: number | null;
  totalPnlUsd?: number | null;
  pnlStatus?: string | null;
  firstSeenAt?: string | null;
  entryAt?: string | null;
  exitAt?: string | null;
  lastSeenAt?: string | null;
  txCount?: number | null;
  holdDurationHours?: number | null;
  lifecycleStatus?: string | null;
  lifecycleSource?: string | null;
  lifecycleNote?: string | null;
  tags?: string[];
  dataSources?: string[];
};

export type TerminalHoldersSnapshot = {
  requestedLimit?: number;
  returnedRows?: number;
  walletCountReturned?: number;
  walletLimit?: number;
  isTruncated?: boolean;
  nextCursor?: string | null;
  paginationStatus?: string;
  coverageLabel?: string;
  providerLimitSuspected?: boolean;
  tokenAccountCount?: number | null;
  nonZeroTokenAccounts?: number | null;
  uniqueOwnerCount?: number | null;
  totalHolders?: number | null;
  status?: string;
  source?: string;
  note?: string;
  rows?: TerminalHolderAccount[];
};

export type TerminalWalletTokenBalanceRow = {
  id?: string | null;
  wallet?: string | null;
  address?: string | null;
  role?: string | null;
  groupId?: string | null;
  scope?: string | null;
  tokenAccount?: string | null;
  tokenAccounts?: Array<Record<string, unknown>>;
  tokenAccountCount?: number;
  rawAmount?: string;
  uiAmount: number;
  uiAmountString?: string;
  valueUsd?: number | null;
  source?: string | string[];
  status?: string;
  balanceStatus?: string;
  note?: string | null;
};

export type TerminalPositionRow = {
  wallet: string;
  role?: string | null;
  uiAmount: number;
  valueUsd: number | null;
  avgEntryUsd: number | null;
  avgExitUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  totalPnlUsd: number | null;
  txCount: number | null;
  firstSeenAt?: string | null;
  entryAt?: string | null;
  exitAt?: string | null;
  lastSeenAt: string | null;
  pnlStatus?: string | null;
  dataSources?: string[];
  source: string[];
  status: string;
};


export type TerminalSectionSource = {
  status?: string;
  source?: string | null;
  observedAt?: string | null;
  latencyMs?: number | null;
  coverageLabel?: string | null;
  isTruncated?: boolean;
  blockers?: string[];
  nextCredentialNeeded?: string | null;
};

export type CanonicalTerminalSnapshotSections = {
  tokenIdentity?: Record<string, unknown> & { sourceStatus?: TerminalSectionSource };
  pairIdentity?: Record<string, unknown> & { sourceStatus?: TerminalSectionSource };
  market?: Record<string, unknown> & { sourceStatus?: TerminalSectionSource };
  chart?: Record<string, unknown> & { sourceStatus?: TerminalSectionSource };
  tradeTape?: Record<string, unknown>;
  holderCoverage?: TerminalSectionSource & { walletCountReturned?: number; walletLimit?: number; nextCursor?: string | null; paginationStatus?: string | null };
  security?: Record<string, unknown> & { sourceStatus?: TerminalSectionSource };
  liquidity?: Record<string, unknown> & { sourceStatus?: TerminalSectionSource };
  migration?: Record<string, unknown> & { sourceStatus?: TerminalSectionSource };
  wallets?: Record<string, unknown>;
  paperTrading?: Record<string, unknown>;
  discovery?: Record<string, unknown> & { sourceStatus?: TerminalSectionSource };
  providerHealth?: Record<string, unknown> | null;
  sourceStatus?: Record<string, TerminalSectionSource>;
};

export type TerminalTokenSnapshot = CanonicalTerminalSnapshotSections & {
  status: string;
  observedAt: string;
  mint: string;
  project: string | null;
  sources?: Record<string, unknown>;
  pool?: Record<string, unknown> | null;
  holders?: TerminalHoldersSnapshot;
  trades?: {
    rows?: TerminalTradeEvent[];
    topTraders?: TerminalTopTrader[];
    summary?: Record<string, unknown> | null;
    fallbackSource?: string | null;
  };
  freshWallets?: Record<string, unknown> | null;
  snipers?: Record<string, unknown> | null;
  bundles?: Record<string, unknown> | null;
  devTokens?: { classifier?: Record<string, unknown> | null; wallets?: Array<Record<string, unknown>> };
  terminal?: Record<string, unknown> | null;
  orders?: Record<string, unknown> | null;
  positions?: { rows?: TerminalPositionRow[]; summary?: Record<string, unknown> | null; source?: string };
  execution?: string;
};


export type TokenWalletPosition = {
  wallet: string;
  tokenAccount?: string | null;
  tokenBalance: number;
  pctSupply?: number | null;
  valueUsd?: number | null;
  solBalance?: number | null;
  boughtTokens?: number | null;
  soldTokens?: number | null;
  netTokens?: number | null;
  avgEntryUsd?: number | null;
  avgExitUsd?: number | null;
  realizedPnlUsd?: number | null;
  unrealizedPnlUsd?: number | null;
  totalPnlUsd?: number | null;
  txCount?: number | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  source: string[];
  status: string;
  tags?: string[];
};
