import { z } from 'zod';

export const configSchema = z.object({
  mode: z.enum(['dry-run', 'paper', 'live']),
  cluster: z.enum(['mainnet-beta', 'devnet', 'testnet', 'localnet']),
  rpcUrlEnv: z.string().min(1),
  tokenMint: z.string().min(32),
  quoteMint: z.string().min(32),
  wallets: z.array(z.object({
    name: z.string().min(1),
    pubkey: z.string().min(32),
    maxSolToUse: z.number().nonnegative(),
    minSolReserve: z.number().nonnegative(),
    maxTokenInventory: z.number().nonnegative(),
    targetTokenInventory: z.number().nonnegative()
  })).min(1),
  globalRisk: z.object({
    maxTotalSolExposure: z.number().positive(),
    maxTradeSol: z.number().positive(),
    maxTradesPerMinute: z.number().int().positive(),
    maxSlippageBps: z.number().int().positive(),
    maxDailyLossSol: z.number().positive(),
    killSwitchDrawdownBps: z.number().int().positive(),
    maxMarketDataAgeMs: z.number().int().positive()
  }),
  quoting: z.object({
    baseSpreadBps: z.number().int().nonnegative(),
    minSpreadBps: z.number().int().nonnegative(),
    maxSpreadBps: z.number().int().positive(),
    inventorySkewBps: z.number().int().nonnegative(),
    volatilitySpreadMultiplier: z.number().positive(),
    minDelayMs: z.number().int().positive(),
    maxDelayMs: z.number().int().positive()
  }),
  execution: z.object({
    venues: z.array(z.enum(['jupiter', 'openbook', 'raydium', 'orca', 'meteora'])).min(1),
    priorityFeeLamports: z.number().int().nonnegative(),
    useJito: z.boolean(),
    maxRetries: z.number().int().nonnegative()
  })
}).superRefine((config, ctx) => {
  if (config.quoting.minSpreadBps > config.quoting.maxSpreadBps) {
    ctx.addIssue({ code: 'custom', message: 'minSpreadBps cannot exceed maxSpreadBps', path: ['quoting'] });
  }
  if (config.quoting.minDelayMs > config.quoting.maxDelayMs) {
    ctx.addIssue({ code: 'custom', message: 'minDelayMs cannot exceed maxDelayMs', path: ['quoting'] });
  }
  if (config.globalRisk.maxTradeSol > config.globalRisk.maxTotalSolExposure) {
    ctx.addIssue({ code: 'custom', message: 'maxTradeSol cannot exceed maxTotalSolExposure', path: ['globalRisk'] });
  }
  if (config.mode === 'live') {
    ctx.addIssue({ code: 'custom', message: 'live mode is not supported in foundation v0', path: ['mode'] });
  }
});
