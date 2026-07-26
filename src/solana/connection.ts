import { Connection } from '@solana/web3.js';
import { resolveSolanaRpcUrl, type AppEnv } from '../config/env.js';

export function createConnection(env: AppEnv): Connection {
  return new Connection(resolveSolanaRpcUrl(env).url, {
    commitment: 'confirmed',
    wsEndpoint: env.SOLANA_WS_URL
  });
}
