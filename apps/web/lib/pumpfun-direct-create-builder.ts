import { createHash } from 'node:crypto';
import BN from 'bn.js';
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { getBuyTokenAmountFromSolAmount, OnlinePumpSdk, PUMP_PROGRAM_ID, PUMP_SDK } from '@pump-fun/pump-sdk';
import { configuredSolanaRpc } from './solana-rpc';
import { decodeTransactionPolicy } from './transaction-policy';

export type PumpFunDirectCreateMode = 'legacy-create-and-buy' | 'v2-create-and-buy';

export type PumpFunDirectCreateRequest = {
  publicKey: string | null;
  tokenMetadata: {
    name: string;
    symbol: string;
    uri: string | null;
  };
  mint: string | null;
  amount: number;
  tokenMode?: 'classic' | 'mayhem' | string | null;
};

export type PumpFunDirectCreateBuild = {
  builderId: 'pump-sdk-direct-create';
  sdkPackage: '@pump-fun/pump-sdk';
  sdkVersion: '1.36.0';
  mode: PumpFunDirectCreateMode;
  rpcProvider: string;
  transactionBytes: number;
  transactionHash: string;
  transactionBase64: string;
  requiredSigners: string[];
  mint: string;
  feePayer: string | null;
  messageHash: string;
  programs: string[];
  accountKeys: string[];
  usesAddressLookupTables: boolean;
  solAmountLamports: string;
  tokenAmount: string;
};

function solToLamports(sol: number) {
  if (!Number.isFinite(sol) || sol <= 0) throw new Error('Initial buy SOL must be positive for Pump.fun direct create.');
  return new BN(Math.round(sol * 1_000_000_000));
}

function modeForTokenMode(tokenMode?: PumpFunDirectCreateRequest['tokenMode']): PumpFunDirectCreateMode {
  return tokenMode === 'mayhem' ? 'v2-create-and-buy' : 'legacy-create-and-buy';
}

export async function buildPumpFunDirectCreateTransaction(request: PumpFunDirectCreateRequest): Promise<PumpFunDirectCreateBuild> {
  if (!request.publicKey) throw new Error('Deployer public key is required.');
  if (!request.mint) throw new Error('Client mint public key is required.');
  if (!request.tokenMetadata.uri) throw new Error('IPFS metadata URI is required.');

  const user = new PublicKey(request.publicKey);
  const mint = new PublicKey(request.mint);
  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  const online = new OnlinePumpSdk(connection);
  const global = await online.fetchGlobal();
  const feeConfig = await online.fetchFeeConfig().catch(() => null);
  const solAmount = solToLamports(request.amount);
  const tokenAmount = getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: null,
    bondingCurve: null,
    amount: solAmount,
    quoteMint: NATIVE_MINT
  });
  const mode = modeForTokenMode(request.tokenMode);
  const common = {
    global,
    mint,
    name: request.tokenMetadata.name,
    symbol: request.tokenMetadata.symbol,
    uri: request.tokenMetadata.uri,
    creator: user,
    user,
    solAmount,
    amount: tokenAmount
  };
  const instructions = mode === 'v2-create-and-buy'
    ? await PUMP_SDK.createV2AndBuyInstructions({ ...common, mayhemMode: true })
    : await PUMP_SDK.createAndBuyInstructions(common);
  const latest = await connection.getLatestBlockhash('confirmed');
  const transaction = new VersionedTransaction(new TransactionMessage({
    payerKey: user,
    recentBlockhash: latest.blockhash,
    instructions
  }).compileToV0Message());
  const bytes = Buffer.from(transaction.serialize());
  const decoded = decodeTransactionPolicy(bytes);

  return {
    builderId: 'pump-sdk-direct-create',
    sdkPackage: '@pump-fun/pump-sdk',
    sdkVersion: '1.36.0',
    mode,
    rpcProvider: rpc.provider,
    transactionBytes: bytes.length,
    transactionHash: createHash('sha256').update(bytes).digest('hex'),
    transactionBase64: bytes.toString('base64'),
    requiredSigners: transaction.message.staticAccountKeys
      .slice(0, transaction.message.header.numRequiredSignatures)
      .map((key) => key.toBase58()),
    mint: mint.toBase58(),
    feePayer: transaction.message.staticAccountKeys[0]?.toBase58() ?? null,
    messageHash: decoded.messageHash,
    programs: decoded.programs,
    accountKeys: decoded.accountKeys,
    usesAddressLookupTables: Boolean(decoded.usesAddressLookupTables),
    solAmountLamports: solAmount.toString(),
    tokenAmount: tokenAmount.toString()
  };
}

export function pumpFunDirectBuildEnabled() {
  return process.env.PUMP_DIRECT_BUILD_ENABLED === 'true';
}

export const PUMP_FUN_DIRECT_CREATE_PROGRAM_ID = PUMP_PROGRAM_ID.toBase58();
