export type TradeEvent = {
  observedAt: string;
  wallet: string;
  side: 'buy' | 'sell';
};

export function tradesInWindow(args: {
  trades: TradeEvent[];
  nowMs: number;
  windowMs: number;
  wallet?: string;
}): number {
  const cutoff = args.nowMs - args.windowMs;
  return args.trades.filter((trade) => {
    const ts = Date.parse(trade.observedAt);
    if (!Number.isFinite(ts) || ts < cutoff || ts > args.nowMs) return false;
    return args.wallet === undefined || trade.wallet === args.wallet;
  }).length;
}

export function wouldExceedTradesPerMinute(args: {
  trades: TradeEvent[];
  maxTradesPerMinute: number;
  nowMs?: number;
  wallet?: string;
}): boolean {
  const nowMs = args.nowMs ?? Date.now();
  const count = tradesInWindow({
    trades: args.trades,
    nowMs,
    windowMs: 60_000,
    wallet: args.wallet
  });
  return count >= args.maxTradesPerMinute;
}
