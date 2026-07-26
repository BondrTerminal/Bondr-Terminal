import { Decimal } from 'decimal.js';
import type { MarketMakerConfig, WalletConfig } from '../types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../types/decision.js';
import { inventorySkew } from './sizing.js';

export type QuotePlan = {
  observedAt: string;
  midPrice: number | null;
  bidPrice: number | null;
  askPrice: number | null;
  spreadBps: number | null;
  inventorySkew: number;
  reason: string;
};

function clampBps(value: Decimal, minBps: number, maxBps: number): Decimal {
  return Decimal.min(Decimal.max(value, minBps), maxBps);
}

export function buildQuotePlan(args: {
  config: MarketMakerConfig;
  walletConfig: WalletConfig;
  wallet: WalletSnapshot;
  market: MarketSnapshot;
}): QuotePlan {
  const { config, walletConfig, wallet, market } = args;
  const skew = inventorySkew({ walletConfig, wallet });

  if (market.referencePrice === null) {
    return {
      observedAt: market.observedAt,
      midPrice: null,
      bidPrice: null,
      askPrice: null,
      spreadBps: null,
      inventorySkew: skew,
      reason: 'reference price unavailable'
    };
  }

  const volatilityAddBps = new Decimal(market.volatilityBps ?? 0).mul(config.quoting.volatilitySpreadMultiplier);
  const spreadBps = clampBps(
    new Decimal(config.quoting.baseSpreadBps).plus(volatilityAddBps),
    config.quoting.minSpreadBps,
    config.quoting.maxSpreadBps
  );

  // Positive skew means token inventory is above target, so make asks more attractive and bids less attractive.
  const skewBps = new Decimal(skew).mul(config.quoting.inventorySkewBps);
  const halfSpread = spreadBps.div(2);
  const mid = new Decimal(market.referencePrice);
  const bidOffsetBps = halfSpread.plus(skewBps);
  const askOffsetBps = halfSpread.minus(skewBps);

  const bidPrice = mid.mul(new Decimal(1).minus(bidOffsetBps.div(10_000)));
  const askPrice = mid.mul(new Decimal(1).plus(askOffsetBps.div(10_000)));

  if (bidPrice.lte(0) || askPrice.lte(0) || bidPrice.gte(askPrice)) {
    return {
      observedAt: market.observedAt,
      midPrice: mid.toNumber(),
      bidPrice: null,
      askPrice: null,
      spreadBps: spreadBps.toNumber(),
      inventorySkew: skew,
      reason: 'quote plan invalid after spread/skew; wait'
    };
  }

  return {
    observedAt: market.observedAt,
    midPrice: mid.toNumber(),
    bidPrice: bidPrice.toNumber(),
    askPrice: askPrice.toNumber(),
    spreadBps: spreadBps.toNumber(),
    inventorySkew: skew,
    reason: 'quote plan computed'
  };
}
