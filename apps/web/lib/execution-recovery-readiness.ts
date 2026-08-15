import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type ExecutionRecoveryReadiness = {
  contract: 'bondr-execution-recovery-readiness-v1';
  status: 'blocked' | 'rehearsal-only';
  monitors: Array<{
    name: string;
    status: 'ready' | 'rehearsal-only' | 'missing-implementation' | 'blocked';
    detail: string;
  }>;
  recoveryPolicy: {
    retryable: string[];
    noRetry: string[];
    maxRetriesRequired: true;
    rebuildRequiredForExpiredBlockhash: true;
    noBlindRetry: true;
  };
  killSwitch: {
    active: boolean;
    checkedPaths: string[];
    blocker: 'kill-switch-active' | null;
  };
  blockers: string[];
  execution: 'recovery-readiness-only-no-monitor-no-retry-no-broadcast';
};

function haltPaths() {
  return Array.from(new Set([
    resolve(process.cwd(), 'HALT'),
    resolve(process.cwd(), '..', '..', 'HALT')
  ]));
}

export function buildExecutionRecoveryReadiness(): ExecutionRecoveryReadiness {
  const checkedPaths = haltPaths();
  const killSwitchActive = checkedPaths.some((path) => existsSync(path));
  const monitors: ExecutionRecoveryReadiness['monitors'] = [
    { name: 'launch tx', status: 'missing-implementation', detail: 'Needs deploy transaction signature and confirmation watcher.' },
    { name: 'bundle txs', status: 'rehearsal-only', detail: 'Jito bundle receipt contract exists; automatic polling is not durable yet.' },
    { name: 'wallet balances', status: 'ready', detail: 'Wallet balance surfaces exist, but live freshness depends on provider health.' },
    { name: 'token balances', status: 'ready', detail: 'Token balance surfaces exist for portfolio and post-launch checks.' },
    { name: 'pool/graduation', status: 'missing-implementation', detail: 'Needs pool state and graduation/migration monitor.' }
  ];
  const blockers = [
    killSwitchActive ? 'kill-switch-active' : null,
    'durable-monitor-worker-missing',
    'receipt-ledger-persistence-missing',
    'automatic-recovery-runner-missing'
  ].filter((item): item is string => Boolean(item));
  return {
    contract: 'bondr-execution-recovery-readiness-v1',
    status: killSwitchActive ? 'blocked' : 'rehearsal-only',
    monitors,
    recoveryPolicy: {
      retryable: ['blockhash-expired-rebuild', 'account-in-use-backoff', 'rate-limited-backoff', 'transient-network-backoff'],
      noRetry: ['slippage-or-stale-market', 'insufficient-funds', 'signer-or-auth', 'risk-or-halt', 'invalid-transaction', 'unknown-failure'],
      maxRetriesRequired: true,
      rebuildRequiredForExpiredBlockhash: true,
      noBlindRetry: true
    },
    killSwitch: {
      active: killSwitchActive,
      checkedPaths,
      blocker: killSwitchActive ? 'kill-switch-active' : null
    },
    blockers,
    execution: 'recovery-readiness-only-no-monitor-no-retry-no-broadcast'
  };
}
