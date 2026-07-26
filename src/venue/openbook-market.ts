import { createHash } from 'node:crypto';
import { PublicKey, type Connection } from '@solana/web3.js';
import {
  OPENBOOK_V2_RAW_FEE_UNITS_PER_BPS,
  openBookV2RawFeeUnitsToBps
} from '../runtime/paper-fee-presets.js';

export const OPENBOOK_V2_PROGRAM_ID = 'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb';
export const OPENBOOK_V2_MARKET_ACCOUNT_SIZE = 848;
export const OPENBOOK_V2_MARKET_DATA_SIZE = 840;
export const OPENBOOK_V2_ACCOUNT_DISCRIMINATOR_SIZE = 8;
export const OPENBOOK_V2_MARKET_ACCOUNT_NAME = 'market';

const MARKET_NAME_OFFSET = OPENBOOK_V2_ACCOUNT_DISCRIMINATOR_SIZE + 176;
const MARKET_NAME_LENGTH = 16;
const MAKER_FEE_OFFSET = OPENBOOK_V2_ACCOUNT_DISCRIMINATOR_SIZE + 472;
const TAKER_FEE_OFFSET = OPENBOOK_V2_ACCOUNT_DISCRIMINATOR_SIZE + 480;
const BASE_MINT_OFFSET = OPENBOOK_V2_ACCOUNT_DISCRIMINATOR_SIZE + 584;
const QUOTE_MINT_OFFSET = OPENBOOK_V2_ACCOUNT_DISCRIMINATOR_SIZE + 616;

export type DecodedOpenBookV2MarketFees = {
  market: string;
  programId: string;
  accountSize: number;
  name: string;
  baseMint: string;
  quoteMint: string;
  makerFeeRaw: number;
  takerFeeRaw: number;
  makerFeeBps: number;
  takerFeeBps: number;
  makerRebateBps: number;
  rawFeeUnitsPerBps: number;
  paperOnly: true;
  liveExecution: false;
  notes: string[];
};

export function openBookV2MarketDiscriminator(): Buffer {
  return createHash('sha256')
    .update(`account:${OPENBOOK_V2_MARKET_ACCOUNT_NAME}`)
    .digest()
    .subarray(0, OPENBOOK_V2_ACCOUNT_DISCRIMINATOR_SIZE);
}

function readI64AsNumber(data: Buffer, offset: number, fieldName: string): number {
  const value = data.readBigInt64LE(offset);
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error(`OpenBook v2 ${fieldName} exceeds JavaScript safe integer range`);
  }
  return asNumber;
}

function readPubkey(data: Buffer, offset: number): string {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function readMarketName(data: Buffer): string {
  return data
    .subarray(MARKET_NAME_OFFSET, MARKET_NAME_OFFSET + MARKET_NAME_LENGTH)
    .toString('utf8')
    .replace(/\0+$/g, '');
}

export function decodeOpenBookV2MarketFees(args: {
  market: PublicKey | string;
  data: Buffer;
  programId?: PublicKey | string;
}): DecodedOpenBookV2MarketFees {
  const market = typeof args.market === 'string' ? args.market : args.market.toBase58();
  const programId = typeof args.programId === 'string'
    ? args.programId
    : args.programId?.toBase58() ?? OPENBOOK_V2_PROGRAM_ID;

  if (args.data.length < OPENBOOK_V2_MARKET_ACCOUNT_SIZE) {
    throw new Error(`OpenBook v2 market account data too short: expected at least ${OPENBOOK_V2_MARKET_ACCOUNT_SIZE}, received ${args.data.length}`);
  }

  const expectedDiscriminator = openBookV2MarketDiscriminator();
  const actualDiscriminator = args.data.subarray(0, OPENBOOK_V2_ACCOUNT_DISCRIMINATOR_SIZE);
  if (!actualDiscriminator.equals(expectedDiscriminator)) {
    throw new Error('OpenBook v2 market account discriminator mismatch');
  }

  const makerFeeRaw = readI64AsNumber(args.data, MAKER_FEE_OFFSET, 'makerFee');
  const takerFeeRaw = readI64AsNumber(args.data, TAKER_FEE_OFFSET, 'takerFee');
  if (takerFeeRaw < 0) {
    throw new Error(`OpenBook v2 takerFee must be non-negative; decoded ${takerFeeRaw}`);
  }

  const makerFeeBps = openBookV2RawFeeUnitsToBps(makerFeeRaw);
  const takerFeeBps = openBookV2RawFeeUnitsToBps(takerFeeRaw);

  return {
    market,
    programId,
    accountSize: args.data.length,
    name: readMarketName(args.data),
    baseMint: readPubkey(args.data, BASE_MINT_OFFSET),
    quoteMint: readPubkey(args.data, QUOTE_MINT_OFFSET),
    makerFeeRaw,
    takerFeeRaw,
    makerFeeBps,
    takerFeeBps,
    makerRebateBps: makerFeeBps < 0 ? Math.abs(makerFeeBps) : 0,
    rawFeeUnitsPerBps: OPENBOOK_V2_RAW_FEE_UNITS_PER_BPS,
    paperOnly: true,
    liveExecution: false,
    notes: [
      'Decoded from the public OpenBook v2 Market account data only.',
      'OpenBook v2 raw fee units convert to bps by dividing by 100.',
      'Negative makerFee values represent maker rebates; takerFee must be non-negative.',
      'This output is safe for paper fee assumptions, not live execution approval.'
    ]
  };
}

export async function fetchOpenBookV2MarketFees(args: {
  connection: Connection;
  market: PublicKey | string;
  expectedProgramId?: PublicKey | string;
}): Promise<DecodedOpenBookV2MarketFees> {
  const market = typeof args.market === 'string' ? new PublicKey(args.market) : args.market;
  const account = await args.connection.getAccountInfo(market, 'confirmed');
  if (account === null) {
    throw new Error(`OpenBook v2 market account not found: ${market.toBase58()}`);
  }

  const expectedProgramId = args.expectedProgramId
    ? (typeof args.expectedProgramId === 'string' ? new PublicKey(args.expectedProgramId) : args.expectedProgramId)
    : new PublicKey(OPENBOOK_V2_PROGRAM_ID);
  if (!account.owner.equals(expectedProgramId)) {
    throw new Error(`OpenBook v2 market owner mismatch: expected ${expectedProgramId.toBase58()}, received ${account.owner.toBase58()}`);
  }

  return decodeOpenBookV2MarketFees({
    market,
    data: account.data,
    programId: account.owner
  });
}
