import { Decimal } from 'decimal.js';

export type PortfolioMark = {
  solBalance: number;
  tokenBalance: number;
  tokenPriceSol: number | null;
};

export type PortfolioValue = {
  solValue: number;
  tokenValueSol: number | null;
  totalValueSol: number | null;
};

export function markPortfolio(mark: PortfolioMark): PortfolioValue {
  if (mark.tokenPriceSol === null) {
    return {
      solValue: mark.solBalance,
      tokenValueSol: null,
      totalValueSol: null
    };
  }

  const solValue = new Decimal(mark.solBalance);
  const tokenValueSol = new Decimal(mark.tokenBalance).mul(mark.tokenPriceSol);
  return {
    solValue: solValue.toNumber(),
    tokenValueSol: tokenValueSol.toNumber(),
    totalValueSol: solValue.plus(tokenValueSol).toNumber()
  };
}

export function drawdownBps(args: { startValueSol: number; currentValueSol: number }): number {
  if (args.startValueSol <= 0) return 0;
  const start = new Decimal(args.startValueSol);
  const current = new Decimal(args.currentValueSol);
  const loss = Decimal.max(start.minus(current), 0);
  return loss.div(start).mul(10_000).toDecimalPlaces(0).toNumber();
}

export function realizedPnlSol(args: {
  side: 'buy' | 'sell';
  inputAmountUi: number;
  outputAmountUi: number;
  priceSol: number;
  feeSol?: number;
}): number {
  const fee = new Decimal(args.feeSol ?? 0);
  if (args.side === 'buy') {
    const receivedValue = new Decimal(args.outputAmountUi).mul(args.priceSol);
    return receivedValue.minus(args.inputAmountUi).minus(fee).toNumber();
  }

  const soldCostBasis = new Decimal(args.inputAmountUi).mul(args.priceSol);
  return new Decimal(args.outputAmountUi).minus(soldCostBasis).minus(fee).toNumber();
}
