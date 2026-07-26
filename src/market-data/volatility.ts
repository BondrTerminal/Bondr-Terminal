import { Decimal } from 'decimal.js';

export type PricePoint = {
  observedAt: string;
  price: number;
};

export function appendPricePoint(args: {
  points: PricePoint[];
  point: PricePoint;
  maxPoints: number;
}): PricePoint[] {
  if (args.maxPoints <= 0) throw new Error('maxPoints must be positive');
  if (args.point.price <= 0) throw new Error('price must be positive');
  const next = [...args.points, args.point].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  return next.slice(Math.max(0, next.length - args.maxPoints));
}

export function returnBpsSeries(points: PricePoint[]): number[] {
  const sorted = [...points].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const returns: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Decimal(sorted[i - 1]!.price);
    const current = new Decimal(sorted[i]!.price);
    if (prev.lte(0)) continue;
    returns.push(current.minus(prev).div(prev).mul(10_000).toNumber());
  }
  return returns;
}

export function estimateVolatilityBps(points: PricePoint[]): number | null {
  const returns = returnBpsSeries(points);
  if (returns.length < 2) return null;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.round(Math.sqrt(variance));
}
