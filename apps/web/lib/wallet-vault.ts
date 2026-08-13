import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { Keypair } from '@solana/web3.js';
import { atomicJsonWrite } from './mutation-safety';

export type VaultKey = {
  id: string;
  walletId: string;
  publicKey: string;
  encryptedSecretKey: string;
  salt: string;
  iv: string;
  authTag: string;
  kdf: 'scrypt';
  iterations: number;
  createdAt: string;
  importedAt?: string;
  lastExportedAt?: string;
};

export type WalletVault = {
  version: 1;
  createdAt: string;
  updatedAt: string;
  keys: VaultKey[];
};

const VAULT_PATH = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'meridian-wallet-vault.local.json');
const SCRYPT_N = 16384;

export function getWalletVaultPath() { return VAULT_PATH; }

export function emptyVault(): WalletVault {
  const now = new Date().toISOString();
  return { version: 1, createdAt: now, updatedAt: now, keys: [] };
}

export function readWalletVault(): WalletVault {
  if (!existsSync(VAULT_PATH)) return emptyVault();
  return JSON.parse(readFileSync(VAULT_PATH, 'utf8')) as WalletVault;
}

export function writeWalletVault(vault: WalletVault) {
  vault.updatedAt = new Date().toISOString();
  atomicJsonWrite(VAULT_PATH, vault);
}

export function vaultStatus() {
  const exists = existsSync(VAULT_PATH);
  const vault = readWalletVault();
  return {
    exists,
    version: vault.version,
    createdAt: vault.createdAt,
    updatedAt: vault.updatedAt,
    managedWalletCount: vault.keys.length,
    wallets: vault.keys.map((key) => ({ id: key.id, walletId: key.walletId, publicKey: key.publicKey, createdAt: key.createdAt, importedAt: key.importedAt ?? null, lastExportedAt: key.lastExportedAt ?? null, hasVaultEntry: true }))
  };
}

function derive(passphrase: string, salt: Buffer) {
  if (passphrase.length < 8) throw new Error('Vault passphrase must be at least 8 characters.');
  return scryptSync(passphrase, salt, 32, { N: SCRYPT_N, r: 8, p: 1 });
}

export function encryptSecretKey(secretKey: Uint8Array, passphrase: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = derive(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(secretKey)), cipher.final()]);
  const authTag = cipher.getAuthTag();
  key.fill(0);
  return { encryptedSecretKey: encrypted.toString('base64'), salt: salt.toString('base64'), iv: iv.toString('base64'), authTag: authTag.toString('base64'), kdf: 'scrypt' as const, iterations: SCRYPT_N };
}

export function decryptSecretKey(vaultKey: VaultKey, passphrase: string) {
  const key = derive(passphrase, Buffer.from(vaultKey.salt, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(vaultKey.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(vaultKey.authTag, 'base64'));
  try {
    const decrypted = Buffer.concat([decipher.update(Buffer.from(vaultKey.encryptedSecretKey, 'base64')), decipher.final()]);
    return new Uint8Array(decrypted);
  } finally {
    key.fill(0);
  }
}

export function base58Encode(bytes: Uint8Array) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  for (const byte of bytes) { if (byte === 0) digits.push(0); else break; }
  return digits.reverse().map((digit) => alphabet[digit]).join('');
}

export function base58Decode(value: string) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const map = new Map([...alphabet].map((char, index) => [char, index]));
  const bytes = [0];
  for (const char of value) {
    const val = map.get(char);
    if (val === undefined) throw new Error('Invalid base58 private key.');
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const char of value) { if (char === '1') bytes.push(0); else break; }
  return new Uint8Array(bytes.reverse());
}

export function parseSecretKeyInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Private key input is required.');
  let bytes: Uint8Array;
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) throw new Error('JSON private key must be an array of bytes.');
    bytes = new Uint8Array(parsed as number[]);
  } else {
    bytes = base58Decode(trimmed);
  }
  if (![64, 32].includes(bytes.length)) throw new Error('Private key must decode to a 64-byte Solana secret key or 32-byte seed.');
  return bytes.length === 64 ? Keypair.fromSecretKey(bytes) : Keypair.fromSeed(bytes);
}

export function makeVaultKey(walletId: string, publicKey: string, secretKey: Uint8Array, passphrase: string, imported = false): VaultKey {
  const encrypted = encryptSecretKey(secretKey, passphrase);
  const now = new Date().toISOString();
  return { id: `vkey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, walletId, publicKey, ...encrypted, createdAt: now, importedAt: imported ? now : undefined };
}
