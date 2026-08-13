#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const read = (path) => readFileSync(resolve(appRoot, path), 'utf8');

const terminalSnapshot = read('app/api/terminal-token-snapshot/route.ts');
const tokenStats = read('app/api/token-stats/route.ts');
const terminalBooth = read('app/sniper/components/TerminalInfoBooth.tsx');
const tokenLoader = read('app/sniper/components/TradingTokenLoader.tsx');

assert.match(
  terminalBooth,
  /holderLimit:\s*'100'/,
  'TerminalInfoBooth must request holderLimit=100 from the UI.'
);

assert.match(
  tokenLoader,
  /holderLimit=100/,
  'TradingTokenLoader must request holderLimit=100 from the UI.'
);

assert.match(
  terminalSnapshot,
  /liveRead\s*\?\s*100\s*:\s*250/,
  'Terminal snapshot live-read holder cap must allow 100 rows.'
);

assert.match(
  terminalSnapshot,
  /holderListLimit=\$\{boundedHolderLimit\}/,
  'Terminal snapshot must pass boundedHolderLimit through to token-stats.'
);

assert.match(
  terminalSnapshot,
  /liveRead\s*\?\s*'&fastHolders=1'/,
  'Terminal snapshot live-read path must use fastHolders=1 instead of prototype mode.'
);

assert.match(
  tokenStats,
  /fastHolders\s*\?\s*100\s*:\s*prototype\s*\?\s*50\s*:\s*250/,
  'token-stats fastHolders cap must allow 100 rows.'
);

assert.match(
  tokenStats,
  /const targetRows\s*=\s*Math\.min\(Math\.max\(limit,\s*1\),\s*100\)/,
  'Solscan holder adapter must target up to 100 rows.'
);

assert.match(
  tokenStats,
  /for \(let page = 1; page <= maxPages && items\.length < targetRows; page \+= 1\)/,
  'Solscan holder adapter must paginate until targetRows is reached.'
);

assert.doesNotMatch(
  tokenStats,
  /const prototypeRugRows\s*=\s*lightweightHolders\s*\?/,
  'fastHolders must not take the RugCheck-first prototype shortcut, because RugCheck often only returns ~20.'
);

assert.match(
  tokenStats,
  /requestedLimit:\s*holderListLimit/,
  'token-stats holder response must expose the requested holder limit.'
);

assert.match(
  tokenStats,
  /providerLimitSuspected/,
  'token-stats holder response must flag suspected provider/fallback caps.'
);

console.log('holder-limit-contract ok: UI → snapshot → token-stats preserves holderLimit=100 and exposes fallback cap status.');
