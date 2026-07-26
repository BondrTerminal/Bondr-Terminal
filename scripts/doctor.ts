import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const commands = ['node', 'npm', 'pnpm', 'solana', 'anchor', 'spl-token', 'git'];

function version(command: string): string {
  try {
    return execFileSync(command, ['--version'], { encoding: 'utf8' }).trim().split('\n')[0] ?? 'ok';
  } catch {
    return 'not found';
  }
}

function hasForbiddenText(path: string, patterns: RegExp[]): string[] {
  if (!fs.existsSync(path) || fs.statSync(path).isDirectory()) return [];
  const text = fs.readFileSync(path, 'utf8');
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

console.log('Solana SPL market-maker doctor');
console.log('--------------------------------');
for (const command of commands) {
  console.log(`${command.padEnd(12)} ${version(command)}`);
}

console.log('\nProject files');
for (const file of [
  'package.json',
  'tsconfig.json',
  '.env.example',
  'config/market-maker.example.json',
  'docs/RPC_METHODS.md',
  'docs/MARKET_MAKER_BENCHMARK.md'
]) {
  console.log(`${file.padEnd(40)} ${fs.existsSync(file) ? 'ok' : 'missing'}`);
}

console.log('\nInstall state');
console.log(`${'node_modules'.padEnd(40)} ${fs.existsSync('node_modules') ? 'present' : 'missing - run install only after approval'}`);
console.log(`${'pnpm-lock.yaml'.padEnd(40)} ${fs.existsSync('pnpm-lock.yaml') ? 'present' : 'missing - expected before install'}`);

console.log('\nConfiguration state');
const exampleConfig = fs.readFileSync('config/market-maker.example.json', 'utf8');
console.log(`${'example token mint placeholder'.padEnd(40)} ${exampleConfig.includes('REPLACE_WITH_SPL_TOKEN_MINT') ? 'present' : 'not found'}`);
console.log(`${'example wallet placeholder'.padEnd(40)} ${exampleConfig.includes('REPLACE_WITH_PUBLIC_KEY_ONLY') ? 'present' : 'not found'}`);
console.log(`${'local config'.padEnd(40)} ${fs.existsSync('config/market-maker.local.json') ? 'present' : 'missing - create only with public keys/risk limits'}`);

console.log('\nSafety scan');
const filesToScan = [
  '.env.example',
  'config/market-maker.example.json',
  'src/execution/live-disabled.ts',
  'src/risk/self-trade.ts',
  'src/risk/halt.ts'
];
for (const file of filesToScan) {
  const hits = hasForbiddenText(file, [/PRIVATE_KEY\s*=/i, /SECRET\s*=/i, /WALLET_SEED/i, /MNEMONIC/i]);
  console.log(`${file.padEnd(40)} ${hits.length === 0 ? 'ok' : `review: ${hits.join(', ')}`}`);
}

console.log('\nSafety gates');
console.log('- default mode must remain dry-run until explicitly changed');
console.log('- no private keys should exist in repo files');
console.log('- live execution remains intentionally disabled in v0');
console.log('- HALT-file guard must be called before any future execution path');
console.log('- self-trade guard must be enforced before any future order placement');
