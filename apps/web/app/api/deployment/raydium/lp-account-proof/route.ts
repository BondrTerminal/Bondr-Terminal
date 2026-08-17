import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../../../lib/solana-rpc';
import { providerSecretSafeMessage } from '../../../../../lib/provider-truth';
import { buildRaydiumPostBroadcastLpAccountProofFromObservation, resolveRaydiumAmmV4LpMintProof } from '../../../../../lib/raydium-lp-proof';

export const dynamic = 'force-dynamic';

type Body = {
  signature?: unknown;
  expectedPoolId?: unknown;
  expectedOwner?: unknown;
  lpTokenAccount?: unknown;
  transactionMessageHash?: unknown;
  simulationTransactionMessageHash?: unknown;
};

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function param(request: Request, body: Body | null, key: keyof Body) {
  const { searchParams } = new URL(request.url);
  return textValue(body?.[key]) ?? textValue(searchParams.get(String(key)));
}

function publicKey(value: string | null) {
  if (!value) return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

function accountKeys(transaction: Awaited<ReturnType<Connection['getTransaction']>>) {
  const message = transaction?.transaction.message as unknown as {
    accountKeys?: unknown[];
    staticAccountKeys?: unknown[];
  } | null;
  const keys = message?.accountKeys ?? message?.staticAccountKeys ?? [];
  return keys.map((key) => {
    if (typeof key === 'string') return key;
    if (key instanceof PublicKey) return key.toBase58();
    if (!key || typeof key !== 'object') return null;
    const shaped = key as { pubkey?: unknown; toBase58?: unknown };
    if (shaped.pubkey instanceof PublicKey) return shaped.pubkey.toBase58();
    if (typeof shaped.pubkey === 'string') return shaped.pubkey;
    if (typeof shaped.toBase58 === 'function') return shaped.toBase58();
    return null;
  }).filter((key): key is string => Boolean(key));
}

function parsedTokenInfo(account: Awaited<ReturnType<Connection['getParsedAccountInfo']>>['value']) {
  const parsed = account?.data && typeof account.data !== 'string' && 'parsed' in account.data
    ? account.data.parsed as { info?: { owner?: string; mint?: string; tokenAmount?: { amount?: string } } }
    : null;
  const info = parsed?.info;
  return info ? {
    owner: textValue(info.owner),
    mint: textValue(info.mint),
    amountRaw: textValue(info.tokenAmount?.amount)
  } : null;
}

async function readOwnerLpTokenAccount(connection: Connection, owner: string, lpMint: string, explicitAccount: string | null) {
  if (explicitAccount) {
    const account = await connection.getParsedAccountInfo(new PublicKey(explicitAccount), 'confirmed');
    const parsed = parsedTokenInfo(account.value);
    return {
      lpTokenAccount: publicKey(explicitAccount),
      owner: parsed?.owner ?? null,
      mint: parsed?.mint ?? null,
      amountRaw: parsed?.amountRaw ?? null
    };
  }

  const response = await connection.getParsedTokenAccountsByOwner(
    new PublicKey(owner),
    { mint: new PublicKey(lpMint) },
    'confirmed'
  );
  const accounts = response.value.map((entry) => {
    const parsed = parsedTokenInfo(entry.account);
    return {
      lpTokenAccount: entry.pubkey.toBase58(),
      owner: parsed?.owner ?? null,
      mint: parsed?.mint ?? null,
      amountRaw: parsed?.amountRaw ?? null
    };
  }).filter((entry) => BigInt(entry.amountRaw ?? '0') > 0n);
  accounts.sort((a, b) => {
    const left = BigInt(a.amountRaw ?? '0');
    const right = BigInt(b.amountRaw ?? '0');
    return right > left ? 1 : right < left ? -1 : 0;
  });
  return accounts[0] ?? null;
}

async function responseFor(request: Request, body: Body | null = null) {
  const observedAt = new Date().toISOString();
  const signature = param(request, body, 'signature');
  const expectedPoolId = publicKey(param(request, body, 'expectedPoolId'));
  const expectedOwner = publicKey(param(request, body, 'expectedOwner'));
  const explicitLpTokenAccount = publicKey(param(request, body, 'lpTokenAccount'));
  const transactionMessageHash = param(request, body, 'transactionMessageHash');
  const simulationTransactionMessageHash = param(request, body, 'simulationTransactionMessageHash');

  if (!signature || !expectedPoolId || !expectedOwner) {
    return Response.json({
      status: 'blocked',
      observedAt,
      error: 'signature, expectedPoolId, and expectedOwner are required.',
      blockers: [
        signature ? null : 'raydium-lp-signature-required',
        expectedPoolId ? null : 'expected-raydium-pool-id-required',
        expectedOwner ? null : 'expected-owner-required'
      ].filter(Boolean),
      execution: 'raydium-lp-account-proof-read-only-no-signing-no-broadcast'
    }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');

  try {
    const [transaction, poolAccount] = await Promise.all([
      connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }),
      connection.getAccountInfo(new PublicKey(expectedPoolId), 'confirmed')
    ]);
    const poolObservation = poolAccount ? {
      poolId: expectedPoolId,
      ownerProgram: poolAccount.owner.toBase58(),
      accountData: Buffer.from(poolAccount.data)
    } : null;
    const mintProof = poolObservation
      ? resolveRaydiumAmmV4LpMintProof(poolObservation.ownerProgram, Buffer.from(poolObservation.accountData))
      : null;
    const lpObservation = mintProof?.lpMint
      ? await readOwnerLpTokenAccount(connection, expectedOwner, mintProof.lpMint, explicitLpTokenAccount)
      : null;
    const proof = buildRaydiumPostBroadcastLpAccountProofFromObservation({
      expectedPoolId,
      expectedOwner,
      transaction: transaction ? {
        signature,
        slot: transaction.slot,
        err: transaction.meta?.err ?? null,
        accountKeys: accountKeys(transaction),
        blockTime: transaction.blockTime ?? null
      } : null,
      poolAccount: poolObservation,
      lpTokenAccount: lpObservation,
      transactionMessageHash,
      simulationTransactionMessageHash
    });

    return Response.json({
      status: proof.status,
      observedAt,
      rpcProvider: rpc.provider,
      proof,
      execution: 'raydium-lp-account-proof-read-only-no-signing-no-broadcast'
    }, { status: proof.status === 'verified' ? 200 : 409, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({
      status: 'provider-error',
      observedAt,
      rpcProvider: rpc.provider,
      error: providerSecretSafeMessage(error instanceof Error ? error.message : 'Raydium LP account proof failed.') ?? 'Raydium LP account proof failed.',
      execution: 'raydium-lp-account-proof-read-only-no-signing-no-broadcast'
    }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
}

export async function GET(request: Request) {
  return responseFor(request);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Body;
  return responseFor(request, body);
}
