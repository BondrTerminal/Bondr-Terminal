#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const read = (path) => readFileSync(resolve(appRoot, path), 'utf8');

const snapshotRoute = read('app/api/terminal-token-snapshot/route.ts');
const terminalSnapshotRoute = read('app/api/terminal/snapshot/route.ts');
const contracts = read('lib/terminal/contracts.ts');
const terminalBooth = read('app/sniper/components/TerminalInfoBooth.tsx');
const liquidityProbe = read('app/liquidity/components/LiquidityEngineProbe.tsx');

const lpScannerRoute = read('app/api/lp-lock-burn-scanner/route.ts');
const tokenStatsRoute = read('app/api/token-stats/route.ts');
const walletGraphRoute = read('app/api/wallet-graph-insider-index/route.ts');
const lpPositionRoute = read('app/api/lp-position-ownership-index/route.ts');


for (const section of [
  'tokenIdentity',
  'pairIdentity',
  'market',
  'chart',
  'holderCoverage',
  'security',
  'liquidity',
  'migration',
  'wallets',
  'paperTrading',
  'discovery',
  'providerHealth',
  'sourceStatus'
]) {
  assert.match(snapshotRoute, new RegExp(`${section}\\s*[: ,]`), `terminal-token-snapshot must expose canonical ${section}.`);
}

for (const metadata of ['status', 'source', 'observedAt', 'coverageLabel', 'isTruncated', 'blockers', 'nextCredentialNeeded']) {
  assert.match(snapshotRoute, new RegExp(metadata), `canonical snapshot must include source metadata field ${metadata}.`);
}

assert.match(terminalSnapshotRoute, /canonicalChart/, 'terminal/snapshot normalized harness must forward canonical chart.');
assert.match(terminalSnapshotRoute, /canonicalLiquidity/, 'terminal/snapshot normalized harness must forward canonical liquidity.');
assert.match(terminalSnapshotRoute, /canonicalDiscovery/, 'terminal/snapshot normalized harness must forward canonical discovery.');
assert.match(terminalSnapshotRoute, /terminal-provider-env-audit/, 'terminal/snapshot must prefer provider env audit/readiness metadata when normalizing providers.');
assert.match(contracts, /CanonicalTerminalSnapshotSections/, 'contracts must define canonical terminal snapshot sections.');
assert.match(contracts, /TerminalSectionSource/, 'contracts must define per-section source metadata.');
assert.match(terminalBooth, /terminalInfoBooth axiomIntelBooth/, 'sniper terminal must render the Terminal Intelligence surface.');
assert.match(terminalBooth, /axiomIntelHeaderStats/, 'sniper terminal must render canonical header stats.');
assert.match(terminalBooth, /axiomIntelTabs/, 'sniper terminal must render persistent intelligence tabs.');
assert.match(terminalBooth, /data-contract="terminal-snapshot-v1"/, 'sniper terminal must advertise the canonical snapshot contract.');


assert.match(snapshotRoute, /readJson\(origin, `\/api\/token-chart\?mint=\$\{qMint\}/, 'canonical snapshot must hydrate chart candles through /api/token-chart.');
assert.match(snapshotRoute, /readJson\(origin, `\/api\/lp-lock-burn-scanner\?mint=\$\{qMint\}/, 'canonical snapshot must hydrate LP lock/burn data.');
assert.match(liquidityProbe, /\/api\/terminal\/snapshot\?/, 'Liquidity Engine pasted mint path must read canonical terminal snapshot.');
assert.doesNotMatch(liquidityProbe, /\/api\/token-pool-index\?mint=/, 'Liquidity Engine must not bypass canonical liquidity with direct token-pool-index fetch.');
assert.doesNotMatch(liquidityProbe, /\/api\/lp-lock-burn-scanner\?mint=/, 'Liquidity Engine must not bypass canonical liquidity with direct LP scanner fetch.');
assert.match(liquidityProbe, /not-applicable-position-model/, 'Liquidity Engine must label CLMM/DLMM position-model LP lock/burn limitations.');
assert.match(snapshotRoute, /command=market-trending/, 'canonical snapshot must expose read-only trending discovery.');
assert.match(snapshotRoute, /command=hot-searches/, 'canonical snapshot must expose read-only hot-search discovery.');
assert.match(snapshotRoute, /sniperPct/, 'canonical security must expose honest sniper/fresh-wallet percentage metadata.');
assert.match(snapshotRoute, /bundlerPct/, 'canonical security must expose honest bundler percentage metadata.');
assert.match(snapshotRoute, /lpBurnedPct/, 'canonical liquidity/security must expose LP burn metadata.');
assert.match(snapshotRoute, /lpLockedPct/, 'canonical liquidity/security must expose LP lock metadata.');
assert.match(snapshotRoute, /candleCount/, 'canonical snapshot must expose chart candle count/source metadata even when UI chart rendering is handled by the token loader.');
assert.doesNotMatch(terminalBooth, /\['Snipers', 'provider gap'\]/, 'sniper top strip must not hardcode sniper provider gaps after Sprint 2.');
assert.doesNotMatch(terminalBooth, /\['Bundlers', 'provider gap'\]/, 'sniper top strip must not hardcode bundler provider gaps after Sprint 2.');

assert.match(lpScannerRoute, /lpModel/, 'LP scanner must expose lpModel.');
assert.match(lpScannerRoute, /lockBurnApplicability/, 'LP scanner must expose lockBurnApplicability.');
assert.match(lpScannerRoute, /reason/, 'LP scanner must expose human-readable reason metadata.');
assert.match(lpScannerRoute, /nextCredentialNeeded/, 'LP scanner must expose nextCredentialNeeded metadata.');
assert.match(snapshotRoute, /lpModel/, 'canonical snapshot must propagate LP model.');
assert.match(snapshotRoute, /lockBurnApplicability/, 'canonical snapshot must propagate lock/burn applicability.');
assert.match(snapshotRoute, /lpScanStatus/, 'canonical snapshot must propagate LP scan status.');
assert.match(tokenStatsRoute, /insiderGraphEstimate/, 'token-stats must compute conservative insider graph estimate.');
assert.match(tokenStatsRoute, /confidence/, 'insider estimate must expose confidence.');
assert.match(tokenStatsRoute, /evidence/, 'insider estimate must expose evidence.');
assert.match(tokenStatsRoute, /limitations/, 'insider estimate must expose limitations.');
assert.match(snapshotRoute, /insiderConfidence/, 'canonical snapshot must expose insider confidence.');
assert.match(snapshotRoute, /insiderEvidence/, 'canonical snapshot must expose insider evidence.');
assert.match(snapshotRoute, /insiderLimitations/, 'canonical snapshot must expose insider limitations.');
assert.doesNotMatch(terminalBooth, /\['Insiders', 'provider gap'\]/, 'sniper top strip must not hardcode insider provider gaps.');

assert.match(walletGraphRoute, /read-only-wallet-graph-no-trading/, 'wallet graph route must exist and remain read-only.');
assert.match(walletGraphRoute, /supplyPctCoverage/, 'wallet graph route must expose supply percentage coverage.');
assert.match(walletGraphRoute, /edges/, 'wallet graph route must expose graph edges.');
assert.match(walletGraphRoute, /limitations/, 'wallet graph route must expose limitations.');
assert.match(lpPositionRoute, /read-only-position-index-no-trading/, 'LP position ownership route must exist and remain read-only.');
assert.match(lpPositionRoute, /positionIndexStatus/, 'LP position route must expose positionIndexStatus.');
assert.match(lpPositionRoute, /ownerConcentrationPctEstimate/, 'LP position route must expose owner concentration estimate field.');
assert.match(lpPositionRoute, /lock-index-unavailable/, 'LP position route must label unavailable lock index honestly.');
assert.match(snapshotRoute, /insiderSupplyPctCoverage/, 'canonical snapshot must propagate insider supply coverage.');
assert.match(snapshotRoute, /insiderEdges/, 'canonical snapshot must propagate insider graph edges.');
assert.match(snapshotRoute, /positionIndexStatus/, 'canonical snapshot must propagate LP position index status.');
assert.match(snapshotRoute, /positionOwnerConcentrationPctEstimate/, 'canonical snapshot must propagate LP position concentration estimate.');
assert.doesNotMatch(terminalBooth, /exact insider/i, 'UI must not hardcode exact insider claims.');
assert.doesNotMatch(terminalBooth, /exact LP/i, 'UI must not hardcode exact LP claims.');



console.log('terminal-snapshot-contract ok: canonical wallet graph + LP position ownership fields are present.');
