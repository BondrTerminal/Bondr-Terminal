import pino from 'pino';
import { PublicKey } from '@solana/web3.js';
import { loadEnv } from '../src/config/env.js';
import { createConnection } from '../src/solana/connection.js';
import { fetchOpenBookV2MarketFees } from '../src/venue/openbook-market.js';

const marketArg = process.argv.slice(2).find((arg) => arg !== '--');
if (!marketArg) {
  throw new Error('Usage: pnpm openbook:market <OPENBOOK_V2_MARKET_PUBKEY>');
}

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL });
const connection = createConnection(env);
const market = new PublicKey(marketArg);

logger.info({ market: market.toBase58() }, 'decoding OpenBook v2 market fees from public account data');

const decoded = await fetchOpenBookV2MarketFees({ connection, market });

console.log(JSON.stringify(decoded, null, 2));

logger.info({ market: decoded.market, makerFeeBps: decoded.makerFeeBps, takerFeeBps: decoded.takerFeeBps }, 'decoded OpenBook v2 market fees');
