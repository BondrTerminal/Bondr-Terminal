import type { Decision } from '../types/decision.js';

export function liveExecutionDisabled(_decision: Decision): never {
  throw new Error('live execution is intentionally disabled in foundation v0; add signer, simulation, kill switch, and explicit approval first');
}
