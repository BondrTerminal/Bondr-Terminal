import fs from 'node:fs';

export function isHalted(haltFile = 'HALT'): boolean {
  return fs.existsSync(haltFile);
}

export function assertNotHalted(haltFile = 'HALT'): void {
  if (isHalted(haltFile)) {
    throw new Error(`halt file present at ${haltFile}; execution disabled`);
  }
}
