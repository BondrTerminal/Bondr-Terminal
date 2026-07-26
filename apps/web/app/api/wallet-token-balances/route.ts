import { Connection, PublicKey } from '@solana/web3.js';
import { getMeridianStore } from '../../../lib/meridian-store';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';

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
  const connection = new Connection(rpc.url, 'confirmed');
  const store = getMeridianStore();
  const wallets = store.wallets.filter((wallet) => (!group || wallet.groupId === group) && (includeArchived || !wallet.archived));

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
        role: wallet.role,
        address: wallet.address,
        groupId: wallet.groupId,
        scope: wallet.scope,
        tokenAccounts: accounts,
        tokenAccountCount: accounts.length,
        uiAmount,
        uiAmountString: String(uiAmount),
        status: 'ok'
      };
    } catch (error) {
      return {
        id: wallet.id,
        role: wallet.role,
        address: wallet.address,
        groupId: wallet.groupId,
        scope: wallet.scope,
        tokenAccounts: [],
        tokenAccountCount: 0,
        uiAmount: 0,
        uiAmountString: '0',
        status: 'error',
        error: error instanceof Error ? error.message : 'Token balance read failed.'
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
      uiAmount: indexed.reduce((sum, wallet) => sum + wallet.uiAmount, 0)
    },
    execution: 'live-index-read'
  });
}
