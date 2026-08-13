import { readFileSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';
import { getMeridianStorePath, type MeridianStore, type Wallet, type WalletActivity } from '../../../lib/meridian-store';
import { atomicJsonWrite, mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../lib/mutation-safety';
import { base58Encode, decryptSecretKey, makeVaultKey, parseSecretKeyInput, readWalletVault, vaultStatus, writeWalletVault } from '../../../lib/wallet-vault';
import { meridianAuthRequiredResponse } from '../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

type VaultAction = 'create-managed-wallet' | 'import-managed-wallet' | 'preview-import-private-key' | 'export-private-key' | 'verify-vault-passphrase';
type Body = { action?: VaultAction; role?: unknown; groupId?: unknown; purpose?: unknown; vaultPassphrase?: unknown; privateKey?: unknown; walletId?: unknown; confirmation?: unknown };
function readStore(): MeridianStore { return JSON.parse(readFileSync(getMeridianStorePath(), 'utf8')) as MeridianStore; }
function clean(value: unknown, fallback = '', max = 240) { return typeof value === 'string' ? value.trim().slice(0, max) : fallback; }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'wallet'; }
function nextWalletId(store: MeridianStore, role: string) { const base = slug(role); let id = base; let i = 1; while (store.wallets.some((w) => w.id === id)) id = `${base}-${String(i++).padStart(2, '0')}`; return id; }
function activity(walletId: string, type: string, message: string, status: WalletActivity['status'] = 'info'): WalletActivity { return { id: `wact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, walletId, timestamp: new Date().toISOString(), type, status, message }; }
function passphrase(body: Body) { const value = clean(body.vaultPassphrase, '', 1000); if (value.length < 8) throw new Error('Vault passphrase must be at least 8 characters.'); return value; }
function noStore(json: unknown, status = 200) { return Response.json(json, { status, headers: { 'cache-control': 'no-store, no-cache, must-revalidate, private' } }); }
function walletVaultBetaEnabled() { return process.env.WALLET_VAULT_BETA_ENABLED === 'true'; }
function betaVaultBlocked(action: unknown) { return noStore({ status: 'blocked', action, error: 'Managed local wallet vault is disabled for browser-wallet beta.', execution: 'wallet-vault-beta-disabled-no-private-key-custody' }, 403); }
function managedWalletRecord(store: MeridianStore, role: string, publicKey: string, groupId: string, purpose: string): Wallet {
  const group = store.walletGroups.find((item) => item.id === groupId);
  if (!group) throw new Error('Wallet group does not exist.');
  if (store.wallets.some((wallet) => wallet.address === publicKey)) throw new Error('Wallet address already exists in Bond.Terminal store.');
  return { id: nextWalletId(store, role), role, address: publicKey, scope: group.scope, groupId, status: 'active', balanceSol: 0, purpose, custodyMode: 'managed-local', createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() };
}
function persistManagedWallet(store: MeridianStore, wallet: Wallet, secretKey: Uint8Array, vaultPassphrase: string, imported: boolean) {
  const vault = readWalletVault();
  const vaultKey = makeVaultKey(wallet.id, wallet.address, secretKey, vaultPassphrase, imported);
  wallet.vaultKeyId = vaultKey.id;
  store.wallets.push(wallet);
  const group = store.walletGroups.find((item) => item.id === wallet.groupId)!;
  if (!group.walletIds.includes(wallet.id)) group.walletIds.push(wallet.id);
  store.walletActivity = [activity(wallet.id, imported ? 'imported_managed' : 'created_managed', imported ? 'Managed-local wallet imported into encrypted vault.' : 'Managed-local wallet created and encrypted in vault.'), ...(store.walletActivity ?? [])];
  vault.keys.push(vaultKey);
  if (mutationMode() === 'local-json') {
    writeWalletVault(vault);
    atomicJsonWrite(getMeridianStorePath(), store);
  }
  secretKey.fill(0);
  return { wallet, vaultKeyId: vaultKey.id };
}
export async function GET() {
  const store = readStore();
  const status = vaultStatus();
  const managed = store.wallets.filter((wallet) => wallet.custodyMode === 'managed-local').map((wallet) => ({ walletId: wallet.id, address: wallet.address, role: wallet.role, vaultKeyId: wallet.vaultKeyId ?? null, keyExportedAt: wallet.keyExportedAt ?? null, hasVaultEntry: status.wallets.some((entry) => entry.walletId === wallet.id) }));
  return noStore({ status: 'ok', vault: status, managedWallets: managed, ...mutationMeta('Vault status only; no encrypted or plaintext secrets returned.'), execution: 'vault-status-no-secrets' });
}
export async function POST(request: Request) {
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.action) return noStore({ status: 'error', error: 'Missing vault action.', ...mutationMeta('Vault action rejected.') }, 400);
  if (!walletVaultBetaEnabled()) return betaVaultBlocked(body.action);
  try {
    const store = readStore();
    if (body.action === 'create-managed-wallet') {
      const kp = Keypair.generate();
      const wallet = managedWalletRecord(store, clean(body.role, 'managed wallet', 80), kp.publicKey.toBase58(), clean(body.groupId, '', 100), clean(body.purpose, 'Managed-local encrypted wallet.', 240));
      const persisted = persistManagedWallet(store, wallet, kp.secretKey, passphrase(body), false);
      return noStore({ status: 'ok', wallet: persisted.wallet, vaultKeyId: persisted.vaultKeyId, warning: 'Backup/export this key through the vault export flow. If you lose the vault passphrase, Bond.Terminal cannot recover it.', ...mutationMeta('Managed wallet created and encrypted locally.'), execution: 'local-encrypted-vault-no-signing' });
    }
    if (body.action === 'import-managed-wallet') {
      const keypair = parseSecretKeyInput(clean(body.privateKey, '', 2000));
      const wallet = managedWalletRecord(store, clean(body.role, 'managed imported wallet', 80), keypair.publicKey.toBase58(), clean(body.groupId, '', 100), clean(body.purpose, 'Managed-local imported encrypted wallet.', 240));
      const persisted = persistManagedWallet(store, wallet, keypair.secretKey, passphrase(body), true);
      return noStore({ status: 'ok', wallet: persisted.wallet, vaultKeyId: persisted.vaultKeyId, warning: 'Private key encrypted at rest. Plaintext was not stored in Bond.Terminal project JSON.', ...mutationMeta('Managed wallet imported and encrypted locally.'), execution: 'local-encrypted-vault-no-signing' });
    }
    if (body.action === 'preview-import-private-key') {
      const keypair = parseSecretKeyInput(clean(body.privateKey, '', 2000));
      const publicKey = keypair.publicKey.toBase58();
      keypair.secretKey.fill(0);
      return noStore({ status: 'ok', publicKey, exists: store.wallets.some((wallet) => wallet.address === publicKey), warning: 'Preview only. The private key was parsed to derive the public address and was not stored.', ...mutationMeta('Import preview only; no wallet or vault entry persisted.'), execution: 'preview-only-no-signing-no-broadcast' });
    }
    if (body.action === 'export-private-key') {
      const walletId = clean(body.walletId, '', 120);
      if (clean(body.confirmation, '', 80) !== 'EXPORT PRIVATE KEY') throw new Error('Confirmation text must be EXPORT PRIVATE KEY.');
      const wallet = store.wallets.find((item) => item.id === walletId);
      if (!wallet) throw new Error('Wallet not found.');
      if (wallet.custodyMode !== 'managed-local' || !wallet.vaultKeyId) throw new Error('This wallet is watch-only or has no vault key; private key export unavailable.');
      const vault = readWalletVault();
      const vaultKey = vault.keys.find((key) => key.id === wallet.vaultKeyId && key.walletId === wallet.id);
      if (!vaultKey) throw new Error('Vault key not found for wallet.');
      const secretKey = decryptSecretKey(vaultKey, passphrase(body));
      const privateKeyBase58 = base58Encode(secretKey);
      const timestamp = new Date().toISOString();
      vaultKey.lastExportedAt = timestamp;
      wallet.keyExportedAt = timestamp;
      wallet.lastActivityAt = timestamp;
      store.walletActivity = [activity(wallet.id, 'private_key_exported', 'Private key exported after passphrase unlock and explicit confirmation.', 'warn'), ...(store.walletActivity ?? [])];
      if (mutationMode() === 'local-json') { atomicJsonWrite(getMeridianStorePath(), store); writeWalletVault(vault); }
      secretKey.fill(0);
      return noStore({ status: 'ok', walletId: wallet.id, publicKey: wallet.address, privateKeyBase58, exportedAt: timestamp, warning: 'Store this private key securely. Anyone with it can control funds. Bond.Terminal did not sign or broadcast any transaction.', ...mutationMeta('Private key exported after explicit confirmation.'), execution: 'secret-export-only-no-signing-no-broadcast' });
    }
    if (body.action === 'verify-vault-passphrase') {
      const walletId = clean(body.walletId, '', 120);
      const wallet = store.wallets.find((item) => item.id === walletId);
      const vault = readWalletVault();
      const vaultKey = wallet ? vault.keys.find((key) => key.id === wallet.vaultKeyId) : vault.keys[0];
      if (!vaultKey) throw new Error('No vault key available to verify.');
      const secret = decryptSecretKey(vaultKey, passphrase(body));
      secret.fill(0);
      return noStore({ status: 'ok', verified: true, ...mutationMeta('Vault passphrase verified without returning secrets.'), execution: 'verify-only-no-secret-returned' });
    }
    return noStore({ status: 'error', error: 'Unsupported vault action.', ...mutationMeta('Vault action rejected.') }, 400);
  } catch (error) {
    return noStore({ status: 'error', error: error instanceof Error ? error.message : 'Vault action failed.', ...mutationMeta('Vault action rejected.') }, 400);
  }
}
