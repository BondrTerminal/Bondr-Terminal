import { Decimal } from 'decimal.js';
import type { MarketMakerConfig, WalletConfig } from '../types/config.js';
import type { WalletSnapshot } from '../types/decision.js';
import type { QuotePlan } from '../decision/quote-plan.js';
import { clampTradeSizeSol } from '../decision/sizing.js';

export type QuoteLevelSide = 'bid' | 'ask';

export type QuoteLevel = {
  side: QuoteLevelSide;
  level: number;
  price: number;
  sizeSol: number;
  sizeToken: number;
};

export type QuoteLevelsPlan = {
  observedAt: string;
  midPrice: number | null;
  levels: QuoteLevel[];
  skipped: boolean;
  reason: string;
};

export type QuoteLevelOptions = {
  levelCount?: number;
  levelSpacingBps?: number;
  totalBidSizeSol?: number;
  totalAskSizeSol?: number;
};

const DEFAULT_LEVEL_COUNT = 3;
const DEFAULT_LEVEL_SPACING_BPS = 25;

function normalizeLevelCount(levelCount: number | undefined): number {
  if (levelCount === undefined) return DEFAULT_LEVEL_COUNT;
  if (!Number.isFinite(levelCount)) return 0;
  return Math.max(0, Math.floor(levelCount));
}

function splitSizeSol(totalSizeSol: Decimal, levelCount: number): Decimal[] {
  if (levelCount <= 0 || totalSizeSol.lte(0)) return [];
  const perLevel = totalSizeSol.div(levelCount);
  return Array.from({ length: levelCount }, () => perLevel);
}

function priceForLevel(args: {
  basePrice: Decimal;
  side: QuoteLevelSide;
  level: number;
  levelSpacingBps: number;
}): Decimal {
  const offset = new Decimal(args.levelSpacingBps).mul(args.level - 1).div(10_000);
  if (args.side === 'bid') return args.basePrice.mul(new Decimal(1).minus(offset));
  return args.basePrice.mul(new Decimal(1).plus(offset));
}

function makeLevels(args: {
  side: QuoteLevelSide;
  basePrice: number | null;
  totalSizeSol: Decimal;
  levelCount: number;
  levelSpacingBps: number;
  maxTokenSize?: Decimal;
}): QuoteLevel[] {
  if (args.basePrice === null || args.levelCount <= 0 || args.totalSizeSol.lte(0)) return [];

  const rawSizes = splitSizeSol(args.totalSizeSol, args.levelCount);
  const levels: QuoteLevel[] = [];
  let remainingToken = args.maxTokenSize;

  for (let i = 0; i < rawSizes.length; i += 1) {
    const level = i + 1;
    const price = priceForLevel({
      basePrice: new Decimal(args.basePrice),
      side: args.side,
      level,
      levelSpacingBps: args.levelSpacingBps
    });

    if (price.lte(0)) continue;

    let sizeSol = rawSizes[i]!;
    let sizeToken = sizeSol.div(price);

    if (remainingToken !== undefined) {
      if (remainingToken.lte(0)) break;
      if (sizeToken.gt(remainingToken)) {
        sizeToken = remainingToken;
        sizeSol = sizeToken.mul(price);
      }
      remainingToken = remainingToken.minus(sizeToken);
    }

    if (sizeSol.lte(0) || sizeToken.lte(0)) continue;

    levels.push({
      side: args.side,
      level,
      price: price.toNumber(),
      sizeSol: sizeSol.toNumber(),
      sizeToken: sizeToken.toNumber()
    });
  }

  return levels;
}

export function buildQuoteLevels(args: {
  config: MarketMakerConfig;
  walletConfig: WalletConfig;
  wallet: WalletSnapshot;
  quotePlan: QuotePlan;
  options?: QuoteLevelOptions;
}): QuoteLevelsPlan {
  const { config, walletConfig, wallet, quotePlan } = args;
  const levelCount = normalizeLevelCount(args.options?.levelCount);
  const levelSpacingBps = args.options?.levelSpacingBps ?? DEFAULT_LEVEL_SPACING_BPS;

  if (quotePlan.midPrice === null || quotePlan.bidPrice === null || quotePlan.askPrice === null) {
    return {
      observedAt: quotePlan.observedAt,
      midPrice: quotePlan.midPrice,
      levels: [],
      skipped: true,
      reason: `quote levels skipped: ${quotePlan.reason}`
    };
  }

  if (levelCount <= 0) {
    return {
      observedAt: quotePlan.observedAt,
      midPrice: quotePlan.midPrice,
      levels: [],
      skipped: true,
      reason: 'quote levels skipped: levelCount must be positive'
    };
  }

  if (levelSpacingBps < 0) {
    return {
      observedAt: quotePlan.observedAt,
      midPrice: quotePlan.midPrice,
      levels: [],
      skipped: true,
      reason: 'quote levels skipped: levelSpacingBps cannot be negative'
    };
  }

  const desiredBidSizeSol = args.options?.totalBidSizeSol ?? config.globalRisk.maxTradeSol;
  const bidSizeSol = new Decimal(clampTradeSizeSol({ config, walletConfig, wallet, desiredSizeSol: desiredBidSizeSol }));

  const maxAskValueSol = new Decimal(wallet.tokenBalance).mul(quotePlan.midPrice);
  const desiredAskSizeSol = new Decimal(args.options?.totalAskSizeSol ?? config.globalRisk.maxTradeSol);
  const askSizeSol = Decimal.min(desiredAskSizeSol, config.globalRisk.maxTradeSol, maxAskValueSol);

  const bidLevels = makeLevels({
    side: 'bid',
    basePrice: quotePlan.bidPrice,
    totalSizeSol: bidSizeSol,
    levelCount,
    levelSpacingBps
  });

  const askLevels = makeLevels({
    side: 'ask',
    basePrice: quotePlan.askPrice,
    totalSizeSol: askSizeSol,
    levelCount,
    levelSpacingBps,
    maxTokenSize: new Decimal(wallet.tokenBalance)
  });

  const levels = [...bidLevels, ...askLevels];

  return {
    observedAt: quotePlan.observedAt,
    midPrice: quotePlan.midPrice,
    levels,
    skipped: levels.length === 0,
    reason: levels.length > 0 ? 'quote levels computed' : 'quote levels skipped: no spendable SOL or token inventory'
  };
}
