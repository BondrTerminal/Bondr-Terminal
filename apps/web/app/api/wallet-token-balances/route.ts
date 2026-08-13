import { Connection, PublicKey } from '@solana/web3.js';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { isProviderLimitedError, providerLimitedNote } from '../../../lib/provider-truth';

export const dynamic = 'force-dynamic';

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EP1rH4D9Lr6VY7UG6w';

type ParsedTokenAccount = {
  account: {
    data: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: { uiAmount?: number | null; amount?: string; decimals?: number; uiAmountString?: string };
        };
      };
    };
  };
  pubkey: PublicKey;
};

async function readOwnerMintBalance(connection: Connection, owner: PublicKey, mint: PublicKey, programId: PublicKey) {
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint, programId }, 'confirmed');
  return accounts.value.map((entry) => {
    const parsed = (entry as ParsedTokenAccount).account.data.parsed?.info;
    const tokenAmount = parsed?.tokenAmount;
    return {
      tokenAccount: entry.pubkey.toBase58(),
      programId: programId.toBase58(),
      rawAmount: tokenAmount?.amount ?? '0',
      decimals: tokenAmount?.decimals ?? null,
      uiAmount: tokenAmount?.uiAmount ?? null,
      uiAmountString: tokenAmount?.uiAmountString ?? '0'
    };
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mintRaw = searchParams.get('mint')?.trim();
  const group = searchParams.get('group')?.trim();
  const includeArchived = searchParams.get('includeArchived') === 'true';

  if (!mintRaw || !MINT_RE.test(mintRaw)) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Missing or invalid mint query parameter.', execution: 'live-index-read' }, { status: 400 });

  let mint: PublicKey;
  try {
    mint = new PublicKey(mintRaw);
  } catch {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Invalid Solana mint public key.', execution: 'live-index-read' }, { status: 400 });
  }

  const rpc = configuredSolanaRpc();
  const store = await getMeridianWalletStore();
  const wallets = store.wallets.filter((wallet) => (!group || wallet.groupId === group) && (includeArchived || !wallet.archived));

  if (!rpc.configured) {
    return Response.json({
      status: 'ok',
      observedAt: new Date().toISOString(),
      mint: mint.toBase58(),
      provider: rpc.provider,
      confidence: 'low',
      historyCoverage: 'modeled',
      missingProviders: ['dedicated-solana-rpc'],
      note: 'Dedicated Solana RPC is not configured; SPL token balances are unavailable, not zero.',
      configured: false,
      wallets: wallets.map((wallet) => ({ id: wallet.id, wallet: wallet.address, role: wallet.role, address: wallet.address, groupId: wallet.groupId, scope: wallet.scope, mint: mint.toBase58(), tokenAccounts: [], tokenAccountCount: 0, uiAmount: null, uiAmountString: 'unavailable', source: 'unavailable', status: 'unavailable', balanceStatus: 'unavailable', note: 'Set SOLANA_RPC_URL, HELIUS_RPC_URL, QUICKNODE_RPC_URL, or TRITON_RPC_URL for live token holdings.' })),
      totals: { walletCount: wallets.length, tokenAccountCount: 0, uiAmount: null },
      execution: 'read-only-modeled-no-dedicated-rpc'
    });
  }

  const connection = new Connection(rpc.url, 'confirmed');

  const indexed = await Promise.all(wallets.map(async (wallet) => {
    try {
      const owner = new PublicKey(wallet.address);
      const [legacy, token2022] = await Promise.all([
        readOwnerMintBalance(connection, owner, mint, new PublicKey(TOKEN_PROGRAM_ID)).catch(() => []),
        readOwnerMintBalance(connection, owner, mint, new PublicKey(TOKEN_2022_PROGRAM_ID)).catch(() => [])
      ]);
      const accounts = [...legacy, ...token2022];
      const uiAmount = accounts.reduce((sum, account) => sum + (account.uiAmount ?? (Number(account.uiAmountString) || 0)), 0);
      return {
        id: wallet.id,
        wallet: wallet.address,
        role: wallet.role,
        address: wallet.address,
        groupId: wallet.groupId,
        scope: wallet.scope,
        mint: mint.toBase58(),
        tokenAccounts: accounts,
        tokenAccountCount: accounts.length,
        uiAmount,
        uiAmountString: String(uiAmount),
        source: 'solana-rpc-getParsedTokenAccountsByOwner',
        status: 'ok',
        balanceStatus: accounts.length ? 'live-token-account' : 'live-zero-balance'
      };
    } catch (error) {
      return {
        id: wallet.id,
        wallet: wallet.address,
        role: wallet.role,
        address: wallet.address,
        groupId: wallet.groupId,
        scope: wallet.scope,
        mint: mint.toBase58(),
        tokenAccounts: [],
        tokenAccountCount: 0,
        uiAmount: null,
        uiAmountString: 'provider-limited',
        source: 'solana-rpc-getParsedTokenAccountsByOwner',
        status: isProviderLimitedError(error) ? 'provider-limited' : 'unavailable',
        balanceStatus: isProviderLimitedError(error) ? 'provider-limited' : 'unavailable',
        error: isProviderLimitedError(error) ? providerLimitedNote(error, 'token balance read') : error instanceof Error ? error.message : 'Token balance read failed.'
      };
    }
  }));

  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    mint: mint.toBase58(),
    provider: rpc.provider,
    confidence: 'high',
    historyCoverage: 'rpc-current-holdings',
    missingProviders: [],
    note: 'Balances are current RPC token account holdings, not historical PnL.',
    configured: rpc.configured,
    wallets: indexed,
    totals: {
      walletCount: indexed.length,
      tokenAccountCount: indexed.reduce((sum, wallet) => sum + wallet.tokenAccountCount, 0),
      uiAmount: indexed.every((wallet) => wallet.uiAmount === null) ? null : indexed.reduce((sum, wallet) => sum + (wallet.uiAmount ?? 0), 0)
    },
    execution: 'live-index-read'
  });
}
