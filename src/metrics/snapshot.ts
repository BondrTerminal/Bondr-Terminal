import type { Decision, MarketSnapshot, WalletSnapshot } from '../types/decision.js';

export type BotMetricsSnapshot = {
  observedAt: string;
  mode: string;
  marketAgeMs: number | null;
  walletCount: number;
  decisionCounts: Record<'buy' | 'sell' | 'wait', number>;
  riskBlockedCount: number;
  totalSolBalance: number;
  totalTokenBalance: number;
};

export function buildMetricsSnapshot(args: {
  mode: string;
  market: MarketSnapshot;
  wallets: WalletSnapshot[];
  decisions: Decision[];
  nowMs?: number;
}): BotMetricsSnapshot {
  const nowMs = args.nowMs ?? Date.now();
  const marketMs = Date.parse(args.market.observedAt);
  const counts: Record<'buy' | 'sell' | 'wait', number> = { buy: 0, sell: 0, wait: 0 };

  for (const decision of args.decisions) counts[decision.side] += 1;

  return {
    observedAt: new Date(nowMs).toISOString(),
    mode: args.mode,
    marketAgeMs: Number.isFinite(marketMs) ? nowMs - marketMs : null,
    walletCount: args.wallets.length,
    decisionCounts: counts,
    riskBlockedCount: args.decisions.filter((decision) => !decision.riskPassed).length,
    totalSolBalance: args.wallets.reduce((sum, wallet) => sum + wallet.solBalance, 0),
    totalTokenBalance: args.wallets.reduce((sum, wallet) => sum + wallet.tokenBalance, 0)
  };
}
