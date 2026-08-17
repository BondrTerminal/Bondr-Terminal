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

export type LiveTestPlan = {
  contract: 'bondr-live-test-plan-v1';
  status: 'ready-with-gated-tests';
  liveExecutionAllowed: false;
  remainingCount: number;
  items: LiveTestPlanItem[];
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
    id: 'baseline-app-smoke',
    label: 'Baseline app route smoke',
    status: 'needs-run',
    harnessStatus: 'external-command',
    harnesses: ['pnpm smoke:bondr', '/api/execution-capabilities', '/api/pre-live-dry-run'],
    runWhen: 'After every deploy and before any live-gate ceremony.',
    successProof: ['production smoke pages=16/apis=7/failures=0', 'all execution gates false unless explicitly testing a gate'],
    blockers: [],
    retireHarnessWhen: 'Never; this becomes permanent release verification.'
  },
  {
    id: 'auth-profile-wallet-alignment',
    label: 'Auth/Profile and browser-wallet alignment',
    status: 'manual-review',
    harnessStatus: 'implemented',
    harnesses: ['/profile', '/api/account/readiness', '/api/turnkey/readiness', '/api/wallet-rail'],
    runWhen: 'Before signing tests and after any Turnkey/auth/storage change.',
    successProof: ['Profile Audit aligned', 'expected Turnkey subject matches active scoped subject', 'browser signer matches selected execution wallet'],
    blockers: ['requires Yakuzamoto real browser session'],
    retireHarnessWhen: 'Never; Profile Audit is an operator safety surface, not a disposable harness.'
  },
  {
    id: 'provider-rpc-readiness',
    label: 'Provider/RPC readiness agreement',
    status: 'needs-run',
    harnessStatus: 'implemented',
    harnesses: ['/api/provider-readiness', '/api/rpc-health', '/api/terminal/live-readiness'],
    runWhen: 'Before quote/build/simulation, before live gate opens, and after provider/env changes.',
    successProof: ['provider readiness and rpc health agree', 'provider secrets redacted', 'provider-limited states block live readiness'],
    blockers: ['real provider capacity may still be external'],
    retireHarnessWhen: 'Never; provider health is a permanent preflight.'
  },
  {
    id: 'quote-build-simulate-sign',
    label: 'Quote -> unsigned build -> simulate -> signed review',
    status: 'needs-run',
    harnessStatus: 'implemented-gated',
    harnesses: ['/api/execution-quote', '/api/execution-swap', '/api/terminal/signer-dry-run', '/api/terminal/signed-review'],
    runWhen: 'With the intended browser signer before any broadcast/deployment gate is opened.',
    successProof: ['unsigned build returns message hash evidence', 'simulation proof hash matches build hash', 'signed review blocks tampered payloads'],
    blockers: ['requires real browser wallet signature for final manual proof'],
    retireHarnessWhen: 'Only after the same proof chain is embedded in the normal Terminal/Deployment flow and no standalone route is needed.'
  },
  {
    id: 'single-broadcast-gate',
    label: 'Tiny single-broadcast gate test and rollback',
    status: 'ready-for-controlled-run',
    harnessStatus: 'implemented-gated',
    harnesses: ['/api/send-signed-transaction', '/api/execution-capabilities', '/api/terminal/live-readiness', 'docs/BONDR_SINGLE_BROADCAST_ROLLBACK_RUNBOOK_2026-08-16.md'],
    runWhen: 'Only after explicit approval to temporarily open the minimum live/signing/broadcast gates.',
    successProof: ['one submit attempt only', 'maxRetries=0', 'skipPreflight=false', 'rollback returns all gates false'],
    blockers: ['requires explicit live gate approval', 'requires rollback operator at keyboard'],
    retireHarnessWhen: 'Never; rollback and blocked-submit probes are permanent safety equipment.'
  },
  {
    id: 'pumpfun-controlled-launch',
    label: 'Pump.fun controlled launch path',
    status: 'ready-for-controlled-run',
    harnessStatus: 'implemented-gated',
    harnesses: ['/api/deployment/pumpportal/preview', '/api/deployment/pumpportal/build-create', '/api/pre-live-dry-run', '/api/projects/[id]/launch-receipt', '/api/projects/[id]/launch-reconciliation'],
    runWhen: 'After IPFS metadata, dev wallet, signer proof, simulation proof, and explicit deployment gate approval.',
    successProof: ['provider build returns unsigned handoff', 'simulation proof binds to create tx hash', 'receipt persists signature/mint/provider/route'],
    blockers: ['deployment gate closed', 'broadcast gate closed', 'requires explicit launch approval'],
    retireHarnessWhen: 'Retire preview-only copy only after live Deployment UI owns the same proof steps directly.'
  },
  {
    id: 'raydium-lp-burn',
    label: 'Raydium LP add, LP account proof, and LP burn',
    status: 'needs-real-inputs',
    harnessStatus: 'implemented-gated',
    harnesses: ['/api/deployment/raydium/config', '/api/deployment/raydium/build-lp', '/api/transaction-policy/simulate-or-provider-simulate', '/api/deployment/raydium/lp-account-proof'],
    runWhen: 'After a controlled Raydium LP transaction signature, pool id, owner, and positive LP token account exist.',
    successProof: ['Raydium config validates CPMM/public-key inputs', 'LP build has no signing/broadcast', 'post-broadcast LP proof verifies pool/LP mint/owner/amount', 'LP burn handoff requires matching simulation proof'],
    blockers: ['needs actual controlled Raydium LP transaction tuple'],
    retireHarnessWhen: 'Only after real Raydium flow produces these proofs automatically inside Deployment.'
  },
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
  },
  {
    id: 'risk-kill-switch',
    label: 'Risk limits and kill-switch behavior',
    status: 'needs-real-inputs',
    harnessStatus: 'implemented',
    harnesses: ['/api/execution-capabilities', '/api/terminal/live-readiness', '/api/pre-live-dry-run', 'HALT file probe'],
    runWhen: 'Before any live signing/broadcast/deployment gate opens and during rollback drills.',
    successProof: ['daily loss/drawdown observations are present', 'HALT blocks signing/broadcast/deployment', 'risk limits are shared across execution paths'],
    blockers: ['production needs real live drawdown/daily-loss observation source'],
    retireHarnessWhen: 'Never; risk readiness is permanent.'
  },
  {
    id: 'security-custody',
    label: 'Security, custody, and mutation gate probes',
    status: 'needs-run',
    harnessStatus: 'implemented',
    harnesses: ['/api/wallet-vault', '/api/send-signed-transaction', '/api/projects/[id]/launch-config', '/api/projects/[id]/launch-receipt', '/api/deployment/pumpportal/build-create'],
    runWhen: 'After every deploy and before any live-gate ceremony.',
    successProof: ['wallet vault POST 403', 'signed submit blocked while gates closed', 'sensitive mutations require Meridian auth', 'no private-key UI returns'],
    blockers: [],
    retireHarnessWhen: 'Never; these are permanent safety probes.'
  },
  {
    id: 'observability-recovery',
    label: 'Observability and recovery proof',
    status: 'manual-review',
    harnessStatus: 'implemented',
    harnesses: ['/api/client-error-report', '/api/execution/recovery-status', 'docs/BONDR_FAILURE_RESPONSE_PLAYBOOKS_2026-08-16.md', '/tmp/bondr-smoke-*.json'],
    runWhen: 'After any route failure, failed broadcast simulation, or deploy.',
    successProof: ['client error report is bounded/redacted', 'route error screen exposes route/digest/type', 'smoke artifact exists and is redacted', 'failure playbook maps to recovery proof'],
    blockers: ['real browser failed-closed path only occurs when a crash is observed'],
    retireHarnessWhen: 'Never; recovery evidence is permanent.'
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
    status: 'ready-with-gated-tests',
    liveExecutionAllowed: false,
    remainingCount: items.length,
    items,
    retainedHarnesses: Array.from(new Set(items.flatMap((item) => item.harnesses))).sort(),
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
