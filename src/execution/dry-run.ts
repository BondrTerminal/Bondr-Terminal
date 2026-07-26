import type { Decision } from '../types/decision.js';

export type ExecutionResult = {
  mode: 'dry-run';
  executed: false;
  signature: null;
  reason: string;
};

export function dryRunExecute(decision: Decision): ExecutionResult {
  return {
    mode: 'dry-run',
    executed: false,
    signature: null,
    reason: `dry-run only; proposed ${decision.side} sizeSol=${decision.sizeSol}`
  };
}
