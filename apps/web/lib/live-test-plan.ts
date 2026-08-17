export type LiveTestHarnessStatus = 'implemented' | 'implemented-gated' | 'manual-only' | 'external-command';
export type LiveTestStatus = 'needs-run' | 'needs-real-inputs' | 'ready-for-controlled-run' | 'manual-review';

export type LiveTestPlanItem = {
  id: string;
  label: string;
  status: LiveTestStatus;
  harnessStatus: LiveTestHarnessStatus;
  harnesses: string[];
  runWhen: string;
  successProof: string[];
  blockers: string[];
  retireHarnessWhen: string;
};

export type RetiredHarness = {
  id: string;
  removedRoute?: string;
  removedFiles: string[];
  replacement: string;
  reason: string;
};

export type RecurringSafetyCheck = {
  id: string;
  label: string;
  status: 'cleared-current-production' | 'recurring-after-deploy' | 'manual-cleared';
  harnesses: string[];
  note: string;
};

export type LiveTestPlan = {
  contract: 'bondr-live-test-plan-v1';
  status: 'new-tests-focused';
  liveExecutionAllowed: false;
  remainingCount: number;
  items: LiveTestPlanItem[];
  recurringSafetyChecks: RecurringSafetyCheck[];
  retainedHarnesses: string[];
  retiredHarnesses: RetiredHarness[];
  safety: {
    readOnly: true;
    noSigning: true;
    noBroadcast: true;
    noFunding: true;
    noDeployment: true;
    noMutation: true;
  };
};

const items: LiveTestPlanItem[] = [
  {
    id: 'jito-bundle-launch',
    label: 'Jito packed bundle launch rail',
    status: 'needs-real-inputs',
    harnessStatus: 'implemented-gated',
    harnesses: ['/api/bundle-sequencer', '/api/relay/jito/address-lookup-table-plan', '/api/relay/jito/packed-transaction-build', '/api/relay/jito/packed-transaction-proof', '/api/relay/jito/multi-wallet-signing-session', '/api/relay/jito/wave-dispatch-plan', '/api/relay/jito/send-bundle', '/api/relay/jito/bundle-status', '/api/relay/jito/chain-effect-proof'],
    runWhen: 'After real route-policy-proven Pump.fun/Raydium/Jupiter prepared transactions and explicit relay approval exist.',
    successProof: ['prepared legs route-policy-passed', 'packed tx proof passes simulation hash', 'all required wallets sign exact message hashes', 'wave dispatch requires approval and prior-wave receipt', 'chain effect proof validates post-landing token deltas'],
    blockers: ['Jito relay disabled', 'needs real prepared route transactions', 'needs explicit relay approval'],
    retireHarnessWhen: 'Only after the Jito orchestration map is fully owned by the Deployment UI and monitored receipt ledger.'
  },
  {
    id: 'sniper-task-automation',
    label: 'Sniper and task automation rails',
    status: 'needs-real-inputs',
    harnessStatus: 'implemented-gated',
    harnesses: ['/api/sniper/readiness', '/api/sniper/trigger-preview', '/api/tasks/readiness', '/api/tasks/queue-preview', '/api/execution/recovery-status'],
    runWhen: 'After durable trigger source, worker, receipt ledger, monitor worker, and operator approval exist.',
    successProof: ['pool freshness proof passes', 'wallet allowlist and signer binding pass', 'TP/SL/trailing/cooldown lifecycle is correct', 'no fake-volume/self-trade path exists'],
    blockers: ['durable trigger source missing', 'durable task worker missing', 'automatic recovery runner missing'],
    retireHarnessWhen: 'Only after durable automation workers expose equivalent dry-run and proof receipts.'
  }
];

const recurringSafetyChecks: RecurringSafetyCheck[] = [
  {
    id: 'baseline-app-smoke',
    label: 'Baseline app route smoke',
    status: 'cleared-current-production',
    harnesses: ['pnpm smoke:bondr', '/api/execution-capabilities', '/api/pre-live-dry-run'],
    note: 'Already run on current production; repeat after every deploy.'
  },
  {
    id: 'auth-profile-wallet-alignment',
    label: 'Auth/Profile and browser-wallet alignment',
    status: 'manual-cleared',
    harnesses: ['/profile', '/api/account/readiness', '/api/turnkey/readiness', '/api/wallet-rail'],
    note: 'Yakuzamoto confirmed Profile Audit aligned for the current Phantom signer; repeat after auth/wallet changes.'
  },
  {
    id: 'provider-rpc-readiness',
    label: 'Provider/RPC readiness agreement',
    status: 'cleared-current-production',
    harnesses: ['/api/provider-readiness', '/api/rpc-health', '/api/terminal/live-readiness'],
    note: 'Already run on current production; repeat before any live-gate ceremony.'
  },
  {
    id: 'quote-build-simulate-sign',
    label: 'Quote -> unsigned build -> simulate -> signed review',
    status: 'cleared-current-production',
    harnesses: ['/api/execution-quote', '/api/execution-swap', '/api/terminal/signer-dry-run', '/api/terminal/signed-review'],
    note: 'Existing browser signing flow was already tested; machine-side policy probes passed on current production.'
  },
  {
    id: 'single-broadcast-gate',
    label: 'Tiny single-broadcast gate test and rollback',
    status: 'recurring-after-deploy',
    harnesses: ['/api/send-signed-transaction', '/api/execution-capabilities', '/api/terminal/live-readiness', 'docs/BONDR_SINGLE_BROADCAST_ROLLBACK_RUNBOOK_2026-08-16.md'],
    note: 'Not new harness work; run only when intentionally opening a live broadcast gate.'
  },
  {
    id: 'pumpfun-controlled-launch',
    label: 'Pump.fun controlled launch path',
    status: 'cleared-current-production',
    harnesses: ['/api/deployment/pumpportal/preview', '/api/deployment/pumpportal/build-create', '/api/pre-live-dry-run', '/api/projects/[id]/launch-receipt', '/api/projects/[id]/launch-reconciliation'],
    note: 'Controlled Pump.fun launch path already tested; retain probes for future launches.'
  },
  {
    id: 'raydium-lp-burn',
    label: 'Raydium LP add, LP account proof, and LP burn',
    status: 'recurring-after-deploy',
    harnesses: ['/api/deployment/raydium/config', '/api/deployment/raydium/build-lp', '/api/transaction-policy/simulate-or-provider-simulate', '/api/deployment/raydium/lp-account-proof'],
    note: 'Not a new test target for this phase unless a real Raydium LP tuple is provided.'
  },
  {
    id: 'risk-kill-switch',
    label: 'Risk limits and kill-switch behavior',
    status: 'cleared-current-production',
    harnesses: ['/api/execution-capabilities', '/api/terminal/live-readiness', '/api/pre-live-dry-run', 'HALT file probe'],
    note: 'Machine-side risk readiness passed; live drawdown source remains a future live-mode requirement.'
  },
  {
    id: 'security-custody',
    label: 'Security, custody, and mutation gate probes',
    status: 'cleared-current-production',
    harnesses: ['/api/wallet-vault', '/api/send-signed-transaction', '/api/projects/[id]/launch-config', '/api/projects/[id]/launch-receipt', '/api/deployment/pumpportal/build-create'],
    note: 'Already run on current production; repeat after every deploy.'
  },
  {
    id: 'observability-recovery',
    label: 'Observability and recovery proof',
    status: 'cleared-current-production',
    harnesses: ['/api/client-error-report', '/api/execution/recovery-status', 'docs/BONDR_FAILURE_RESPONSE_PLAYBOOKS_2026-08-16.md', '/tmp/bondr-smoke-*.json'],
    note: 'Machine-side redaction/recovery status passed; real crash recovery is event-driven.'
  }
];

const retiredHarnesses: RetiredHarness[] = [
  {
    id: 'live-beta-test-page',
    removedRoute: '/live-beta-test',
    removedFiles: ['apps/web/app/live-beta-test', 'docs/BONDR_A_PROFILE_MANUAL_QA.md'],
    replacement: '/profile plus real Terminal/Deployment flows',
    reason: 'The standalone signing page was already tested and replaced by real app surfaces.'
  },
  {
    id: 'authenticated-qa-checklist',
    removedRoute: '/api/authenticated-qa-checklist',
    removedFiles: ['apps/web/app/api/authenticated-qa-checklist/route.ts', 'apps/web/lib/authenticated-qa-checklist.ts'],
    replacement: 'production smoke, Profile Audit, and normal route checks',
    reason: 'The route checklist was a temporary deploy verification harness and no longer needed after route smoke passed.'
  }
];

export function buildLiveTestPlan(): LiveTestPlan {
  return {
    contract: 'bondr-live-test-plan-v1',
    status: 'new-tests-focused',
    liveExecutionAllowed: false,
    remainingCount: items.length,
    items,
    recurringSafetyChecks,
    retainedHarnesses: Array.from(new Set([...items.flatMap((item) => item.harnesses), ...recurringSafetyChecks.flatMap((item) => item.harnesses)])).sort(),
    retiredHarnesses,
    safety: {
      readOnly: true,
      noSigning: true,
      noBroadcast: true,
      noFunding: true,
      noDeployment: true,
      noMutation: true
    }
  };
}
