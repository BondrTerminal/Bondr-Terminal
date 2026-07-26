import fs from 'node:fs';
import path from 'node:path';

const LOADED_FLAG = Symbol.for('meridian.serverEnv.loaded');

type GlobalWithEnvFlag = typeof globalThis & { [LOADED_FLAG]?: boolean };

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
  const index = normalized.indexOf('=');
  if (index <= 0) return null;
  const key = normalized.slice(0, index).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = normalized.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key] === undefined && value !== '') process.env[key] = value;
  }
}

export function ensureServerEnvLoaded() {
  const globalWithFlag = globalThis as GlobalWithEnvFlag;
  if (globalWithFlag[LOADED_FLAG]) return;
  globalWithFlag[LOADED_FLAG] = true;

  const appDir = process.cwd();
  const repoRoot = path.resolve(appDir, '../..');
  const candidates = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(appDir, '.env'),
    path.join(appDir, '.env.local')
  ];

  for (const filePath of candidates) loadEnvFile(filePath);
}

export function serverEnvConfigured(name: string) {
  ensureServerEnvLoaded();
  return Boolean(process.env[name]?.trim());
}
