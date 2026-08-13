import { Connection, PublicKey } from '@solana/web3.js';
import { type MeridianStore } from '../../../lib/meridian-store';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { meridianAuthConfig, meridianRequestAuthenticated } from '../../../lib/meridian-auth';
import { providerLimitedNote } from '../../../lib/provider-truth';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EP1rH4D9Lr6VY7UG6w';

type TokenBalance = {
  mint: string;
  amount: string;
  uiAmount: number | null;
  uiAmountString: string;
  tokenAccountCount: number;
  source: string;
};

function cleanAddress(value: string | null) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || !ADDRESS_RE.test(trimmed)) return null;
  try { return new PublicKey(trimmed).toBase58(); } catch { return null; }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

async function readSol(connection: Connection | null, address: string | null) {
  if (!address) return { solBalance: null, status: 'not-connected', source: 'browser-wallet', note: 'No address supplied.' };
  if (!connection) return { solBalance: null, status: 'provider-limited', source: 'solana-rpc', note: 'Dedicated RPC is unavailable; live SOL balance cannot be read.' };
  try {
    const lamports = await withTimeout(connection.getBalance(new PublicKey(address), 'confirmed'), 3500, `SOL balance for ${address.slice(0, 6)}`);
    return { solBalance: lamports / LAMPORTS_PER_SOL, status: 'fresh', source: 'solana-rpc-getBalance', note: 'Live SOL balance read from configured RPC.' };
  } catch (error) {
    return { solBalance: null, status: 'provider-limited', source: 'solana-rpc-getBalance', note: providerLimitedNote(error, 'wallet rail SOL balance read') };
  }
}

async function readTokenProgram(connection: Connection, owner: PublicKey, mint: PublicKey, programId: PublicKey) {
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint, programId }, 'confirmed');
  return accounts.value.map((entry) => {
    const parsed = entry.account.data.parsed?.info;
    const amount = parsed?.tokenAmount;
    return { rawAmount: amount?.amount ?? '0', uiAmount: amount?.uiAmount ?? null, uiAmountString: amount?.uiAmountString ?? '0' };
  });
}

async function readToken(connection: Connection | null, ownerAddress: string | null, mintAddress: string | null): Promise<TokenBalance | null> {
  if (!ownerAddress || !mintAddress) return null;
  if (!connection) return { mint: mintAddress, amount: 'provider-limited', uiAmount: null, uiAmountString: 'provider-limited', tokenAccountCount: 0, source: 'provider-limited' };
  try {
    const owner = new PublicKey(ownerAddress);
    const mint = new PublicKey(mintAddress);
    const [legacy, token2022] = await Promise.all([
      readTokenProgram(connection, owner, mint, new PublicKey(TOKEN_PROGRAM_ID)).catch(() => []),
      readTokenProgram(connection, owner, mint, new PublicKey(TOKEN_2022_PROGRAM_ID)).catch(() => [])
    ]);
    const rows = [...legacy, ...token2022];
    const uiAmount = rows.reduce((sum, row) => sum + (row.uiAmount ?? (Number(row.uiAmountString) || 0)), 0);
    const amount = rows.reduce((sum, row) => sum + BigInt(row.rawAmount || '0'), 0n).toString();
    return { mint: mintAddress, amount, uiAmount, uiAmountString: String(uiAmount), tokenAccountCount: rows.length, source: 'solana-rpc-getParsedTokenAccountsByOwner' };
  } catch {
    return { mint: mintAddress, amount: 'provider-limited', uiAmount: null, uiAmountString: 'provider-limited', tokenAccountCount: 0, source: 'provider-limited' };
  }
}

function matchWallet(store: MeridianStore, address: string | null) {
  if (!address) return null;
  const wallet = store.wallets.find((item) => !item.archived && item.address === address) ?? null;
  if (!wallet) return null;
  const group = store.walletGroups.find((item) => item.id === wallet.groupId) ?? null;
  const project = store.projects.find((item) => item.walletGroupId === wallet.groupId) ?? null;
  return { id: wallet.id, role: wallet.role, address: wallet.address, groupId: wallet.groupId, groupName: group?.name ?? wallet.groupId, projectId: project?.id ?? null, projectName: project?.name ?? null, custodyMode: wallet.custodyMode ?? 'watch-only', status: wallet.status };
}

function defaultWatchOnlyGroup(store: MeridianStore) {
  const preferred = store.walletGroups.find((group) => group.id === 'trading-lab')
    ?? store.walletGroups.find((group) => group.scope === 'global')
    ?? store.walletGroups[0]
    ?? null;
  return preferred ? { id: preferred.id, name: preferred.name, scope: preferred.scope } : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const connectedSigner = cleanAddress(url.searchParams.get('connectedSigner'));
  const selectedWallet = cleanAddress(url.searchParams.get('selectedWallet'));
  const activeMint = cleanAddress(url.searchParams.get('mint'));
  const rpc = configuredSolanaRpc();
  const auth = await meridianRequestAuthenticated(request);
  const connection = rpc.configured ? new Connection(rpc.url, 'confirmed') : null;
  const store = await getMeridianWalletStore();
  const observedAt = new Date().toISOString();

  const [connectedSol, selectedSol, connectedToken, selectedToken] = await Promise.all([
    readSol(connection, connectedSigner),
    selectedWallet && selectedWallet !== connectedSigner ? readSol(connection, selectedWallet) : Promise.resolve(null),
    readToken(connection, connectedSigner, activeMint),
    selectedWallet && selectedWallet !== connectedSigner ? readToken(connection, selectedWallet, activeMint) : Promise.resolve(null)
  ]);

  const connectedInventory = matchWallet(store, connectedSigner);
  const selectedInventory = matchWallet(store, selectedWallet);
  const walletMode = connectedSigner ? 'browser-wallet' : selectedWallet ? 'watch-only' : 'not-connected';
  const balanceStatus = connectedSol.status === 'fresh' || selectedSol?.status === 'fresh' ? 'fresh' : connectedSol.status;
  const warnings = [
    connectedSigner && !connectedInventory ? 'Connected signer is not in Wallet Ops.' : null,
    connectedSigner && selectedWallet && connectedSigner !== selectedWallet ? 'Wallet mismatch: selected wallet and connected signer differ.' : null,
    !rpc.configured || balanceStatus === 'provider-limited' ? 'Balance provider-limited.' : null,
    'Vault custody unavailable, but A-profile uses browser-wallet signing.'
  ].filter(Boolean);
  const blockers = [
    !connectedSigner ? 'Connect a Solana browser wallet.' : null
  ].filter(Boolean);

  return Response.json({
    status: 'ok',
    observedAt,
    connectedSigner,
    selectedWallet,
    activeMint,
    inventoryMatch: Boolean(connectedSigner && connectedInventory),
    selectedInventoryMatch: Boolean(selectedWallet && selectedInventory),
    inventoryWallet: connectedInventory,
    selectedInventoryWallet: selectedInventory,
    defaultWatchOnlyGroup: defaultWatchOnlyGroup(store),
    walletMode,
    authState: meridianAuthConfig().configured ? auth.authenticated ? 'authenticated' : 'required' : 'not-configured',
    solBalance: connectedSol.solBalance,
    selectedSolBalance: selectedSol?.solBalance ?? (selectedWallet === connectedSigner ? connectedSol.solBalance : null),
    tokenBalances: connectedToken ? [connectedToken] : [],
    selectedTokenBalances: selectedToken ? [selectedToken] : selectedWallet === connectedSigner && connectedToken ? [connectedToken] : [],
    balanceStatus,
    balanceSource: connectedSol.source,
    balanceNote: connectedSol.note,
    provider: rpc.provider,
    configured: rpc.configured,
    lastUpdated: observedAt,
    blockers,
    warnings,
    execution: 'read-only-wallet-rail-no-signing-no-broadcast'
  }, { headers: { 'cache-control': 'no-store' } });
}
