import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { providerSecretSafeMessage, providerStateFromRpcHealth } from '../apps/web/lib/provider-truth.js';

test('provider readiness maps shared RPC health states into provider states', () => {
  assert.equal(providerStateFromRpcHealth('live'), 'ok');
  assert.equal(providerStateFromRpcHealth('provider-limited'), 'provider-limited');
  assert.equal(providerStateFromRpcHealth('modeled'), 'modeled');
  assert.equal(providerStateFromRpcHealth('unavailable'), 'unavailable');
});

test('provider readiness redacts secret-shaped provider messages', () => {
  const message = providerSecretSafeMessage(
    'POST https://rpc.example.com/private/path?api-key=abc123secretxyz&token=anothersecret failed Authorization=Bearer abc.def.ghi'
  );

  assert.equal(
    message,
    'POST https://rpc.example.com/redacted?api-key=redacted&token=redacted failed Authorization=Bearer [redacted]'
  );
  assert.doesNotMatch(message ?? '', /abc123secretxyz|anothersecret|abc\.def\.ghi|private\/path/);
});

test('provider readiness uses shared RPC health model instead of independent slot truth', () => {
  const source = readFileSync(new URL('../apps/web/lib/provider-readiness.ts', import.meta.url), 'utf8');

  assert.match(source, /getSolanaRpcHealth/);
  assert.match(source, /providerStateFromRpcHealth\(rpcHealth\.status\)/);
  assert.doesNotMatch(source, /connection\.getSlot\('confirmed'\)/);
});

test('RPC health and provider readiness error paths sanitize provider secrets before responses', () => {
  const rpcHealthSource = readFileSync(new URL('../apps/web/lib/rpc-health.ts', import.meta.url), 'utf8');
  const providerRouteSource = readFileSync(new URL('../apps/web/app/api/provider-readiness/route.ts', import.meta.url), 'utf8');

  assert.match(rpcHealthSource, /providerSecretSafeMessage\(message\)/);
  assert.match(rpcHealthSource, /safeMessage/);
  assert.doesNotMatch(rpcHealthSource, /request: \\$\\{message\\}/);
  assert.ok(providerRouteSource.includes("error: providerSecretSafeMessage(error instanceof Error ? error.message : 'Provider readiness failed.')"));
  assert.match(providerRouteSource, /secretsExposed: false/);
});
