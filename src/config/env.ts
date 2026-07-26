import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  MARKET_MAKER_MODE: z.enum(['dry-run', 'paper', 'live']).default('dry-run'),
  HELIUS_RPC_URL: z.string().url().optional(),
  HELIUS_API_KEY: z.string().optional(),
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SOLANA_WS_URL: z.string().url().optional(),
  LOG_LEVEL: z.string().default('info'),
  LEDGER_DB_PATH: z.string().default('./market-maker.sqlite3'),
  JUPITER_API_KEY: z.string().optional(),
  JUPITER_QUOTE_URL: z.string().url().default('https://api.jup.ag/swap/v1/quote')
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(): AppEnv {
  return envSchema.parse(process.env);
}

export function resolveSolanaRpcUrl(env: AppEnv): { url: string; provider: string; configured: boolean } {
  if (env.HELIUS_RPC_URL) return { url: env.HELIUS_RPC_URL, provider: 'helius-rpc-url', configured: true };
  if (env.HELIUS_API_KEY) {
    return { url: `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`, provider: 'helius-api-key', configured: true };
  }
  if (env.SOLANA_RPC_URL !== 'https://api.mainnet-beta.solana.com') {
    return { url: env.SOLANA_RPC_URL, provider: 'custom-solana-rpc', configured: true };
  }
  return { url: env.SOLANA_RPC_URL, provider: 'public-solana-rpc', configured: false };
}
