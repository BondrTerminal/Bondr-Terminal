#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const read = (path) => readFileSync(resolve(appRoot, path), 'utf8');

const contextLib = read('lib/meridian-context.ts');
const contextRoute = read('app/api/meridian/context/route.ts');
const deploymentEngineRoute = read('app/api/deployment-engine/route.ts');
const deploymentPage = read('app/deployment/page.tsx');
const walletsPage = read('app/wallets/page.tsx');
const portfolioPage = read('app/portfolio/page.tsx');
const sniperPage = read('app/sniper/page.tsx');
const packageJson = read('package.json');

for (const contract of ['MeridianProjectContext', 'MeridianHubContext', 'meridian-project-context-v1', 'meridian-hub-context-v1']) {
  assert.match(contextLib, new RegExp(contract), `meridian context must define/expose ${contract}.`);
}

for (const field of [
  'project',
  'walletGroup',
  'wallets',
  'balances',
  'deployment',
  'fundingPlan',
  'launchConfig',
  'portfolio',
  'terminal',
  'preflight',
  'blockers',
  'nextActions',
  'sourceStatus'
]) {
  assert.match(contextLib, new RegExp(`${field}\\??:`), `MeridianProjectContext must expose ${field}.`);
}

assert.match(contextLib, /walletPlan/, 'Meridian context must expose launchConfig.walletPlan.');

for (const field of ['modeled', 'live', 'sourceStatus', 'modeled-only', 'live-gated', 'provider-limited']) {
  assert.match(contextLib, new RegExp(field), `Meridian context must preserve balance/execution source metadata: ${field}.`);
}

assert.match(contextRoute, /status:\s*'ok'/, 'context route must return status ok.');
assert.match(contextRoute, /execution:\s*'read-only-shared-context'/, 'context route must remain read-only-shared-context.');
assert.match(contextRoute, /mutation:\s*'disabled-from-context-route'/, 'context route must not expose mutations.');
assert.match(contextRoute, /buildMeridianHubContext/, 'context route must expose buildMeridianHubContext output.');
assert.match(contextRoute, /Unknown (Meridian|Bond\.Terminal) project/, 'context route must reject unknown project ids.');

assert.match(deploymentEngineRoute, /deployment-engine-v2-shared-context/, 'deployment engine must expose shared-context contract.');
assert.match(deploymentEngineRoute, /projectContext/, 'deployment engine must expose projectContext.');
assert.match(deploymentEngineRoute, /deploymentSnapshot/, 'deployment engine must expose deploymentSnapshot.');
assert.match(deploymentEngineRoute, /disabled until live-gated/, 'deployment engine must preserve live-gated wording.');
assert.match(deploymentEngineRoute, /requires browser-wallet signing/, 'deployment engine must preserve browser-wallet signing wording.');
assert.match(deploymentEngineRoute, /requiresExplicitConfirmation:\s*true/, 'deployment engine must require explicit confirmation metadata.');

for (const [name, source] of [
  ['deployment page', deploymentPage],
  ['wallets page', walletsPage],
  ['portfolio page', portfolioPage],
  ['sniper page', sniperPage]
]) {
  assert.match(source, /buildMeridianHubContext/, `${name} must consume the shared Meridian context.`);
}

assert.doesNotMatch(contextLib, /privateKey|secretKey|mnemonic|seedPhrase|keypair/i, 'context lib must not expose private-key material fields.');
assert.doesNotMatch(contextRoute, /privateKey|secretKey|mnemonic|seedPhrase|keypair/i, 'context route must not expose private-key material fields.');
assert.doesNotMatch(contextRoute, /signAndSend|sendRawTransaction|createKeypair|generateWallet/i, 'context route must not expose signed/live execution helpers.');
assert.match(packageJson, /check:meridian-context/, 'web package must register check:meridian-context script.');

console.log('meridian-context-contract ok: shared read-only Launch Object contract is present and guarded.');
