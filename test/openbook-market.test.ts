import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicKey } from '@solana/web3.js';
import {
  decodeOpenBookV2MarketFees,
  openBookV2MarketDiscriminator,
  OPENBOOK_V2_MARKET_ACCOUNT_SIZE,
  OPENBOOK_V2_PROGRAM_ID
} from '../src/venue/openbook-market.js';

const MARKET_NAME_OFFSET = 8 + 176;
const MAKER_FEE_OFFSET = 8 + 472;
const TAKER_FEE_OFFSET = 8 + 480;
const BASE_MINT_OFFSET = 8 + 584;
const QUOTE_MINT_OFFSET = 8 + 616;

function buildMarketData(args: {
  name?: string;
  makerFeeRaw: bigint;
  takerFeeRaw: bigint;
  baseMint?: PublicKey;
  quoteMint?: PublicKey;
}): Buffer {
  const data = Buffer.alloc(OPENBOOK_V2_MARKET_ACCOUNT_SIZE);
  openBookV2MarketDiscriminator().copy(data, 0);
  if (args.name) data.write(args.name, MARKET_NAME_OFFSET, 16, 'utf8');
  data.writeBigInt64LE(args.makerFeeRaw, MAKER_FEE_OFFSET);
  data.writeBigInt64LE(args.takerFeeRaw, TAKER_FEE_OFFSET);
  (args.baseMint ?? PublicKey.unique()).toBuffer().copy(data, BASE_MINT_OFFSET);
  (args.quoteMint ?? PublicKey.unique()).toBuffer().copy(data, QUOTE_MINT_OFFSET);
  return data;
}

test('decodes OpenBook v2 market fees and converts raw units to bps', () => {
  const market = PublicKey.unique();
  const baseMint = PublicKey.unique();
  const quoteMint = PublicKey.unique();
  const decoded = decodeOpenBookV2MarketFees({
    market,
    data: buildMarketData({ name: 'SOL-USDC', makerFeeRaw: -200n, takerFeeRaw: 400n, baseMint, quoteMint })
  });

  assert.equal(decoded.market, market.toBase58());
  assert.equal(decoded.programId, OPENBOOK_V2_PROGRAM_ID);
  assert.equal(decoded.name, 'SOL-USDC');
  assert.equal(decoded.baseMint, baseMint.toBase58());
  assert.equal(decoded.quoteMint, quoteMint.toBase58());
  assert.equal(decoded.makerFeeRaw, -200);
  assert.equal(decoded.takerFeeRaw, 400);
  assert.equal(decoded.makerFeeBps, -2);
  assert.equal(decoded.takerFeeBps, 4);
  assert.equal(decoded.makerRebateBps, 2);
  assert.equal(decoded.rawFeeUnitsPerBps, 100);
  assert.equal(decoded.paperOnly, true);
  assert.equal(decoded.liveExecution, false);

  const raw = JSON.stringify(decoded);
  assert.doesNotMatch(raw, /privateKey|secretKey|seed|mnemonic|signer|apiKey|rpcUrl|env/i);
});

test('rejects non-market account bytes', () => {
  const data = buildMarketData({ makerFeeRaw: 0n, takerFeeRaw: 0n });
  data[0] = data[0] ^ 0xff;
  assert.throws(() => decodeOpenBookV2MarketFees({ market: PublicKey.unique(), data }), /discriminator mismatch/);
});

test('rejects negative OpenBook taker fee', () => {
  const data = buildMarketData({ makerFeeRaw: 0n, takerFeeRaw: -1n });
  assert.throws(() => decodeOpenBookV2MarketFees({ market: PublicKey.unique(), data }), /takerFee must be non-negative/);
});

test('rejects undersized OpenBook market data', () => {
  assert.throws(
    () => decodeOpenBookV2MarketFees({ market: PublicKey.unique(), data: Buffer.alloc(32) }),
    /account data too short/
  );
});
