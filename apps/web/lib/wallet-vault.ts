import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const VAULT_PATH = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'meridian-wallet-vault.local.json');

type StoredVaultShape = {
  version?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  keys?: Array<{
    id?: unknown;
    walletId?: unknown;
    publicKey?: unknown;
    createdAt?: unknown;
    importedAt?: unknown;
    lastExportedAt?: unknown;
  }>;
};

export function getWalletVaultPath() {
  return VAULT_PATH;
}

export function vaultStatus() {
  const exists = existsSync(VAULT_PATH);
  let parsed: StoredVaultShape = {};
  if (exists) {
    try {
      parsed = JSON.parse(readFileSync(VAULT_PATH, 'utf8')) as StoredVaultShape;
    } catch {
      parsed = {};
    }
  }
  const keys = Array.isArray(parsed.keys) ? parsed.keys : [];
  return {
    exists,
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    managedWalletCount: keys.length,
    wallets: keys.map((key) => ({
      id: typeof key.id === 'string' ? key.id : null,
      walletId: typeof key.walletId === 'string' ? key.walletId : null,
      publicKey: typeof key.publicKey === 'string' ? key.publicKey : null,
      createdAt: typeof key.createdAt === 'string' ? key.createdAt : null,
      importedAt: typeof key.importedAt === 'string' ? key.importedAt : null,
      lastExportedAt: typeof key.lastExportedAt === 'string' ? key.lastExportedAt : null,
      hasVaultEntry: true
    })),
    custody: 'server-disabled'
  };
}
