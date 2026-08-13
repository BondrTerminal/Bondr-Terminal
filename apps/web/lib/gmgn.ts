import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const TIMEOUT_MS = 8_000;

export type GmgnChain = 'sol' | 'bsc' | 'base' | 'eth' | 'robinhood';
export type GmgnReadOnlyCommand = 'token-info' | 'token-security' | 'token-pool' | 'token-holders' | 'token-traders' | 'market-trending' | 'hot-searches';

const CHAIN_SET = new Set<GmgnChain>(['sol', 'bsc', 'base', 'eth', 'robinhood']);
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const INTERVAL_SET = new Set(['1m', '5m', '1h', '6h', '24h']);

export function gmgnApiConfigured() {
  return Boolean(process.env.GMGN_API_KEY?.trim());
}

export function normalizeGmgnChain(value: string | null | undefined): GmgnChain {
  const chain = String(value ?? 'sol').toLowerCase() as GmgnChain;
  return CHAIN_SET.has(chain) ? chain : 'sol';
}

function resolveGmgnCli() {
  const candidates: Array<{ command: string; prefixArgs: string[] }> = [];
  try { candidates.push({ command: process.execPath, prefixArgs: [require.resolve('gmgn-cli')] }); } catch {}
  try {
    const packageJson = require.resolve('gmgn-cli/package.json');
    candidates.push({ command: process.execPath, prefixArgs: [join(dirname(packageJson), 'dist', 'index.js')] });
  } catch {}
  candidates.push(
    { command: join(process.cwd(), 'node_modules', '.bin', 'gmgn-cli'), prefixArgs: [] },
    { command: join(process.cwd(), 'apps', 'web', 'node_modules', '.bin', 'gmgn-cli'), prefixArgs: [] }
  );
  for (const candidate of candidates) {
    const target = candidate.prefixArgs[0] ?? candidate.command;
    if (existsSync(target)) return { installed: true, ...candidate };
  }
  return { installed: false, command: 'gmgn-cli', prefixArgs: [] };
}

export function gmgnReadiness() {
  const cli = resolveGmgnCli();
  const apiConfigured = gmgnApiConfigured();
  return {
    status: cli.installed && apiConfigured ? 'ok' : cli.installed ? 'optional-not-configured' : 'unavailable',
    configured: apiConfigured,
    cliInstalled: cli.installed,
    execution: 'read-only-cli-adapter-no-swap-no-cooking',
    featuresUnlockedIfConfigured: ['GMGN token info', 'GMGN token security', 'GMGN pools', 'GMGN holders/traders', 'GMGN trending/hot-search intelligence'],
    disabledCapabilities: ['swap', 'multi-swap', 'order create/update', 'cooking token launch', 'private-key execution'],
    note: cli.installed
      ? apiConfigured
        ? 'gmgn-cli package is installed and GMGN_API_KEY is configured server-side. Only read-only allowlisted commands are exposed.'
        : 'gmgn-cli package is installed. Set GMGN_API_KEY server-side to unlock read-only GMGN intelligence.'
      : 'gmgn-cli package is not installed in the web backend.'
  };
}

function parseJson(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {
    const firstJson = trimmed.indexOf('{');
    const firstArray = trimmed.indexOf('[');
    const start = [firstJson, firstArray].filter((n) => n >= 0).sort((a, b) => a - b)[0];
    if (start === undefined) throw new Error('GMGN CLI returned non-JSON output.');
    return JSON.parse(trimmed.slice(start));
  }
}

async function runGmgn(args: string[]) {
  const readiness = gmgnReadiness();
  if (!readiness.cliInstalled) return { status: 'unavailable', error: 'gmgn-cli package is not installed.', readiness };
  if (!readiness.configured) return { status: 'optional-not-configured', error: 'GMGN_API_KEY is not configured server-side.', readiness };
  const cli = resolveGmgnCli();
  try {
    const result = await execFileAsync(cli.command, [...cli.prefixArgs, ...args], {
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: { ...process.env }
    });
    return { status: 'ok', data: parseJson(result.stdout), stderr: result.stderr?.trim() || null, readiness };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string; code?: number | string };
    return {
      status: 'error',
      error: err.stderr?.trim() || err.message || 'GMGN CLI command failed.',
      exitCode: err.code ?? null,
      stdout: err.stdout ? String(err.stdout).slice(0, 500) : null,
      readiness
    };
  }
}

export async function runGmgnReadOnly(command: GmgnReadOnlyCommand, options: { chain?: string | null; address?: string | null; interval?: string | null; limit?: number | null }) {
  const chain = normalizeGmgnChain(options.chain);
  const address = options.address?.trim();
  const limit = Math.min(Math.max(Number(options.limit ?? 50) || 50, 1), 100);
  const interval = INTERVAL_SET.has(String(options.interval ?? '1h')) ? String(options.interval ?? '1h') : '1h';

  if (command.startsWith('token-') && (!address || !ADDRESS_RE.test(address))) {
    return { status: 'error', error: 'A valid token address is required for GMGN token commands.', readiness: gmgnReadiness() };
  }

  const commandArgs: Record<GmgnReadOnlyCommand, string[]> = {
    'token-info': ['token', 'info', '--chain', chain, '--address', address ?? '', '--raw'],
    'token-security': ['token', 'security', '--chain', chain, '--address', address ?? '', '--raw'],
    'token-pool': ['token', 'pool', '--chain', chain, '--address', address ?? '', '--raw'],
    'token-holders': ['token', 'holders', '--chain', chain, '--address', address ?? '', '--raw'],
    'token-traders': ['token', 'traders', '--chain', chain, '--address', address ?? '', '--raw'],
    'market-trending': ['market', 'trending', '--chain', chain, '--interval', interval, '--limit', String(limit), '--raw'],
    'hot-searches': ['market', 'hot-searches', '--chain', chain, '--interval', interval, '--raw']
  };

  return runGmgn(commandArgs[command]);
}
