import { Decimal } from 'decimal.js';
import type { Decision, MarketSnapshot } from '../types/decision.js';

export type PaperFill = {
  mode: 'paper';
  side: 'buy' | 'sell';
  inputAmountUi: number;
  outputAmountUi: number;
  price: number;
  slippageBps: number;
};

export function simulatePaperFill(args: {
  decision: Decision;
  market: MarketSnapshot;
  slippageBps?: number;
}): PaperFill | null {
  const { decision, market } = args;
  if (decision.side === 'wait' || decision.sizeSol <= 0 || market.referencePrice === null) return null;

  const slippageBps = args.slippageBps ?? market.estimatedSlippageBps ?? 0;
  const price = new Decimal(market.referencePrice);
  const slippageMultiplier = new Decimal(1).plus(new Decimal(slippageBps).div(10_000));

  if (decision.side === 'buy') {
    const effectivePrice = price.mul(slippageMultiplier);
    return {
      mode: 'paper',
      side: 'buy',
      inputAmountUi: decision.sizeSol,
      outputAmountUi: new Decimal(decision.sizeSol).div(effectivePrice).toNumber(),
      price: effectivePrice.toNumber(),
      slippageBps
    };
  }

  const effectivePrice = Decimal.max(price.mul(new Decimal(1).minus(new Decimal(slippageBps).div(10_000))), 0);
  return {
    mode: 'paper',
    side: 'sell',
    inputAmountUi: new Decimal(decision.sizeSol).div(price).toNumber(),
    outputAmountUi: new Decimal(decision.sizeSol).mul(effectivePrice).div(price).toNumber(),
    price: effectivePrice.toNumber(),
    slippageBps
  };
}
