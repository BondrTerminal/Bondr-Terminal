import fs from 'node:fs';
import path from 'node:path';
import type { Decision, MarketSnapshot, WalletSnapshot } from '../types/decision.js';

export function appendDecisionLog(args: {
  outDir?: string;
  market: MarketSnapshot;
  wallet: WalletSnapshot;
  decision: Decision;
}): void {
  const outDir = args.outDir ?? 'logs';
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'decisions.ndjson');
  const row = {
    type: 'decision',
    writtenAt: new Date().toISOString(),
    ...args
  };
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
}
