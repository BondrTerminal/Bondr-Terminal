#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.env.BONDR_BASE_URL ?? process.env.TERMINAL_BASE_URL ?? 'https://solana-spl-market-maker.vercel.app').replace(/\/$/, '');
const timeoutMs = Number(process.env.BONDR_SMOKE_TIMEOUT_MS ?? 15_000);
const startedAt = new Date().toISOString();

const pageRoutes = [
  '/',
  '/profile',
  '/portfolio',
  '/portfolio?view=wallets',
  '/sniper',
  '/sniper?project=sda',
  '/deployment',
  '/deployment?project=sda',
  '/projects',
  '/projects/sda',
  '/wallets',
  '/liquidity',
  '/token-analyzer',
  '/project-dashboard',
  '/github',
  '/whitepaper'
];
const apiRoutes = [
  '/api/execution-capabilities',
  '/api/wallets',
  '/api/wallet-rail',
  '/api/wallet-balances',
  '/api/terminal/live-readiness',
  '/api/wallet-live-readiness'
];

const checks = [];
const failures = [];

const SECRET_KEY_RE = /private|secret|mnemonic|seed|keypair|authorization|cookie|token/i;
const LONG_SECRET_RE = /[A-Za-z0-9+/=_-]{48,}/g;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function redact(value, key = '') {
  if (SECRET_KEY_RE.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  }
  if (typeof value === 'string') {
    if (SOLANA_RE.test(value)) return `${value.slice(0, 4)}…${value.slice(-4)}`;
    return value.replace(LONG_SECRET_RE, (match) => `${match.slice(0, 6)}…[REDACTED:${match.length}]`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function request(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${base}${path}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'accept': init.body ? 'application/json' : '*/*',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {})
      }
    });
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    let json = null;
    if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try { json = JSON.parse(text); } catch { json = null; }
    }
    const result = {
      path,
      method: init.method ?? 'GET',
      ok: response.ok,
      status: response.status,
      contentType,
      ms: Date.now() - started,
      json: redact(json),
      textSample: json ? undefined : text.slice(0, 240).replace(/\s+/g, ' ')
    };
    checks.push(result);
    return { response, text, json, result };
  } catch (error) {
    const result = {
      path,
      method: init.method ?? 'GET',
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
    checks.push(result);
    failures.push(`${init.method ?? 'GET'} ${path} failed: ${result.error}`);
    return { response: null, text: '', json: null, result };
  } finally {
    clearTimeout(timer);
  }
}

function findCheck(path, method = 'GET') {
  return checks.find((check) => check.path === path && check.method === method);
}

async function main() {
  for (const route of pageRoutes) {
    const { response, text } = await request(route);
    assert(response?.status === 200, `GET ${route} expected 200, got ${response?.status ?? 0}`);
    assert(/text\/html/i.test(response?.headers.get('content-type') ?? ''), `GET ${route} expected HTML content-type`);
    assert(text.length > 500, `GET ${route} returned unexpectedly small HTML body`);
    assert(!/This view failed closed/i.test(text), `GET ${route} rendered failed-closed route guard`);
    assert(!/:E\{"digest"|"digest":"[0-9]+"/.test(text), `GET ${route} contained embedded RSC route error digest`);
  }

  const apiPayloads = new Map();
  for (const route of apiRoutes) {
    const { response, json } = await request(route);
    apiPayloads.set(route, json);
    assert(response?.status === 200, `GET ${route} expected 200, got ${response?.status ?? 0}`);
    assert(json && typeof json === 'object', `GET ${route} expected JSON object`);
    if (json && typeof json === 'object') assert(json.status === 'ok' || json.status === 'partial', `GET ${route} expected status ok/partial`);
  }

  const send = await request('/api/send-signed-transaction', { method: 'POST', body: JSON.stringify({}) });
  assert([401, 403].includes(send.response?.status ?? 0), `POST /api/send-signed-transaction expected auth/live gate, got ${send.response?.status ?? 0}`);
  assert(
    ['blocked-by-live-gate', 'error'].includes(send.json?.status) || send.json?.execution === 'blocked-by-meridian-session-gate',
    'send-signed-transaction must be blocked by auth or live gate during unauthenticated smoke'
  );
  assert(send.json?.signature === undefined, 'send-signed-transaction smoke must not return a signature');
  assert(send.json?.execution !== 'broadcast-signed-transaction', 'send-signed-transaction smoke must not broadcast');

  const capabilities = apiPayloads.get('/api/execution-capabilities') ?? {};
  assert(capabilities.signer === 'browser-wallet', 'execution-capabilities must use browser-wallet signer');
  assert(capabilities.broadcastEnabled === false, 'execution-capabilities must report broadcastEnabled=false');
  assert(capabilities.deploymentEnabled === false, 'execution-capabilities must report deploymentEnabled=false');
  assert(capabilities.serverSigning !== true, 'execution-capabilities must not enable server signing');

  const terminalReadiness = apiPayloads.get('/api/terminal/live-readiness') ?? {};
  assert(terminalReadiness.summary?.broadcastEnabled === false, 'terminal live readiness must report broadcast disabled');
  assert(terminalReadiness.summary?.deploymentEnabled === false, 'terminal live readiness must report deployment disabled');
  assert(terminalReadiness.liveActivation?.serverSigning !== true, 'terminal live readiness must not enable server signing');
  assert(terminalReadiness.categories?.walletConnection, 'terminal live readiness must expose walletConnection signing-readiness category');

  const walletReadiness = apiPayloads.get('/api/wallet-live-readiness') ?? {};
  assert(walletReadiness.execution === 'read-only-live-readiness-no-signing', 'wallet-live-readiness must be read-only/no-signing');
  assert(walletReadiness.readiness, 'wallet-live-readiness must include readiness block');

  const walletRail = apiPayloads.get('/api/wallet-rail') ?? {};
  assert(walletRail.execution === 'read-only-wallet-rail-no-signing-no-broadcast', 'wallet-rail must be read-only/no-signing/no-broadcast');

  const wallets = apiPayloads.get('/api/wallets') ?? {};
  assert(wallets.execution === 'read-only-wallet-records', 'wallets GET must be read-only wallet records');

  const walletBalances = apiPayloads.get('/api/wallet-balances') ?? {};
  assert(walletBalances.execution === 'read-only', 'wallet-balances GET must be read-only');

  const finishedAt = new Date().toISOString();
  const report = {
    contract: 'bondr-production-smoke-v1',
    baseUrl: base,
    startedAt,
    finishedAt,
    passed: failures.length === 0,
    summary: {
      pagesChecked: pageRoutes.length,
      apisChecked: apiRoutes.length + 1,
      failures: failures.length,
      broadcastDisabled: capabilities.broadcastEnabled === false && terminalReadiness.summary?.broadcastEnabled === false && send.json?.execution !== 'broadcast-signed-transaction' && send.json?.signature === undefined,
      deploymentDisabled: capabilities.deploymentEnabled === false && terminalReadiness.summary?.deploymentEnabled === false,
      signer: capabilities.signer ?? null,
      signingEnabled: capabilities.signingEnabled ?? null,
      liveTradingEnabled: capabilities.liveTradingEnabled ?? null,
      readinessLevel: capabilities.readinessLevel ?? terminalReadiness.summary?.readinessLevel ?? null
    },
    failures,
    checks
  };
  const safeBase = base.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]+/gi, '-');
  const outPath = join('/tmp', `bondr-smoke-${safeBase}-${startedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, `${JSON.stringify(redact(report), null, 2)}\n`);

  console.log(`BONDR smoke ${report.passed ? 'PASS' : 'FAIL'}`);
  console.log(`base=${base}`);
  console.log(`artifact=${outPath}`);
  console.log(`pages=${report.summary.pagesChecked} apis=${report.summary.apisChecked} failures=${report.summary.failures}`);
  console.log(`broadcastDisabled=${report.summary.broadcastDisabled} deploymentDisabled=${report.summary.deploymentDisabled} signer=${report.summary.signer} signingEnabled=${report.summary.signingEnabled} readiness=${report.summary.readinessLevel}`);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
