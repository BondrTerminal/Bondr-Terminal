import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type ExecutionRecoveryReadiness = {
  contract: 'bondr-execution-recovery-readiness-v1';
  status: 'blocked' | 'rehearsal-only';
  deploymentRecovery: {
    contract: 'bondr-deployment-recovery-preview-v1';
    status: 'rehearsal-only' | 'blocked';
    requiredReceiptFields: string[];
    rebuildTriggers: string[];
    noRetryFailures: string[];
    blockers: string[];
    execution: 'deployment-recovery-preview-only-no-monitor-no-retry-no-broadcast';
  };
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
  const deploymentRecoveryBlockers = [
    killSwitchActive ? 'kill-switch-active' : null,
    'deploy-receipt-monitor-worker-missing',
    'deployment-rebuild-runner-missing'
  ].filter((item): item is string => Boolean(item));
  const deploymentRecovery: ExecutionRecoveryReadiness['deploymentRecovery'] = {
    contract: 'bondr-deployment-recovery-preview-v1',
    status: killSwitchActive ? 'blocked' : 'rehearsal-only',
    requiredReceiptFields: ['signature', 'provider', 'route', 'expectedMint', 'transactionMessageHash', 'simulationTransactionMessageHash', 'broadcastPolicy'],
    rebuildTriggers: ['blockhash-expired', 'route-quote-expired', 'simulation-state-changed', 'bundle-wave-expired'],
    noRetryFailures: ['signer-or-auth', 'risk-or-halt', 'invalid-transaction', 'slippage-or-stale-market', 'unknown-failure'],
    blockers: deploymentRecoveryBlockers,
    execution: 'deployment-recovery-preview-only-no-monitor-no-retry-no-broadcast'
  };
  const monitors: ExecutionRecoveryReadiness['monitors'] = [
    { name: 'launch tx', status: deploymentRecovery.status, detail: 'Deployment recovery preview defines receipt fields, rebuild triggers, and no-blind-retry classes; durable polling is not live.' },
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
    deploymentRecovery,
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
