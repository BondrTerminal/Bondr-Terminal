export type CostBasisMethod = 'fifo' | 'weighted-average';

export type WalletTradeFill = {
  id: string;
  wallet?: string | null;
  projectId?: string | null;
  mint?: string | null;
  timestamp: string;
  side: 'buy' | 'sell';
  tokenAmount: number;
  quoteAmountSol: number;
  priceUsd: number | null;
  source: string;
  confidence: 'modeled' | 'provider-backed';
};

export type RealizedPnlMatch = {
  fillId: string;
  timestamp: string;
  projectId: string | null;
  wallet: string | null;
  method: CostBasisMethod;
  soldTokens: number;
  proceedsSol: number;
  costSol: number;
  realizedPnlSol: number;
  realizedPnlUsd: number | null;
  source: string;
  confidence: 'modeled' | 'high';
};

export type RealizedPnlSummary = {
  method: CostBasisMethod;
  confidence: 'modeled' | 'high' | 'unavailable';
  matches: RealizedPnlMatch[];
  realizedPnlSol: number;
  realizedPnlUsd: number | null;
  unmatchedSellTokens: number;
  openInventoryTokens: number;
  openCostSol: number;
  gaps: string[];
};

type Lot = { tokens: number; costSol: number };
type Position = { lots: Lot[]; inventory: number; costSol: number };

function keyFor(fill: WalletTradeFill) {
  return [fill.wallet ?? 'portfolio', fill.projectId ?? fill.mint ?? 'unknown'].join(':');
}

function cleanAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function round(value: number) {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function roundUsd(value: number | null) {
  return value === null ? null : Math.round(value * 100) / 100;
}

function buy(position: Position, tokens: number, costSol: number, method: CostBasisMethod) {
  if (tokens <= 0 || costSol <= 0) return;
  position.inventory += tokens;
  position.costSol += costSol;
  if (method === 'fifo') position.lots.push({ tokens, costSol });
}

function sell(position: Position, tokens: number, proceedsSol: number, method: CostBasisMethod) {
  if (tokens <= 0 || proceedsSol < 0) return { matchedTokens: 0, costSol: 0, unmatchedTokens: tokens };
  if (position.inventory <= 0 || position.costSol <= 0) return { matchedTokens: 0, costSol: 0, unmatchedTokens: tokens };
  const matchedTokens = Math.min(tokens, position.inventory);
  let costSol = 0;

  if (method === 'weighted-average') {
    const averageCostSol = position.costSol / position.inventory;
    costSol = averageCostSol * matchedTokens;
    position.inventory -= matchedTokens;
    position.costSol = Math.max(0, position.costSol - costSol);
  } else {
    let remaining = matchedTokens;
    while (remaining > 0 && position.lots.length) {
      const lot = position.lots[0];
      const take = Math.min(remaining, lot.tokens);
      const lotUnitCost = lot.costSol / lot.tokens;
      const takenCost = lotUnitCost * take;
      costSol += takenCost;
      lot.tokens -= take;
      lot.costSol -= takenCost;
      remaining -= take;
      if (lot.tokens <= 1e-12) position.lots.shift();
    }
    position.inventory -= matchedTokens;
    position.costSol = Math.max(0, position.costSol - costSol);
  }

  return { matchedTokens, costSol, unmatchedTokens: Math.max(0, tokens - matchedTokens) };
}

export function computeRealizedPnl(fills: WalletTradeFill[], method: CostBasisMethod = 'weighted-average'): RealizedPnlSummary {
  const sorted = fills.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const positions = new Map<string, Position>();
  const matches: RealizedPnlMatch[] = [];
  let unmatchedSellTokens = 0;
  const gaps = new Set<string>();
  let providerBacked = false;
  let modeled = false;

  for (const fill of sorted) {
    const tokens = cleanAmount(fill.tokenAmount);
    const quoteSol = cleanAmount(fill.quoteAmountSol);
    if (!tokens) {
      gaps.add(`Skipped ${fill.id}: missing token amount.`);
      continue;
    }
    const key = keyFor(fill);
    const position = positions.get(key) ?? { lots: [], inventory: 0, costSol: 0 };
    if (fill.confidence === 'provider-backed') providerBacked = true;
    if (fill.confidence === 'modeled') modeled = true;

    if (fill.side === 'buy') {
      buy(position, tokens, quoteSol, method);
      positions.set(key, position);
      continue;
    }

    const result = sell(position, tokens, quoteSol, method);
    positions.set(key, position);
    unmatchedSellTokens += result.unmatchedTokens;
    if (result.unmatchedTokens > 0) gaps.add('Some sells exceeded known matched inventory; unmatched proceeds are excluded from high-confidence realized PnL.');
    if (result.matchedTokens <= 0) continue;

    const matchedProceedsSol = tokens > 0 ? quoteSol * (result.matchedTokens / tokens) : 0;
    const realizedPnlSol = matchedProceedsSol - result.costSol;
    matches.push({
      fillId: fill.id,
      timestamp: fill.timestamp,
      projectId: fill.projectId ?? null,
      wallet: fill.wallet ?? null,
      method,
      soldTokens: round(result.matchedTokens),
      proceedsSol: round(matchedProceedsSol),
      costSol: round(result.costSol),
      realizedPnlSol: round(realizedPnlSol),
      realizedPnlUsd: fill.priceUsd !== null ? roundUsd(realizedPnlSol * fill.priceUsd) : null,
      source: fill.source,
      confidence: fill.confidence === 'provider-backed' && fill.priceUsd !== null ? 'high' : 'modeled'
    });
  }

  const realizedPnlSol = round(matches.reduce((sum, match) => sum + match.realizedPnlSol, 0));
  const usdValues = matches.map((match) => match.realizedPnlUsd).filter((value): value is number => value !== null);
  const open = Array.from(positions.values()).reduce((acc, position) => ({ tokens: acc.tokens + position.inventory, costSol: acc.costSol + position.costSol }), { tokens: 0, costSol: 0 });
  const hasAllUsd = matches.length > 0 && usdValues.length === matches.length;
  if (!hasAllUsd && matches.length) gaps.add('Some fills are missing event-time USD prices; USD PnL is partial/unavailable for those matches.');
  if (modeled) gaps.add('Includes modeled/local flow fills; configure provider-backed wallet trade history for high confidence.');

  return {
    method,
    confidence: matches.length ? (providerBacked && !modeled && hasAllUsd && unmatchedSellTokens === 0 ? 'high' : 'modeled') : 'unavailable',
    matches,
    realizedPnlSol,
    realizedPnlUsd: hasAllUsd ? roundUsd(usdValues.reduce((sum, value) => sum + value, 0)) : null,
    unmatchedSellTokens: round(unmatchedSellTokens),
    openInventoryTokens: round(open.tokens),
    openCostSol: round(open.costSol),
    gaps: Array.from(gaps)
  };
}
