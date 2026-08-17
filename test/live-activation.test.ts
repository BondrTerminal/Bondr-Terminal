import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getLiveActivationStatus } from '../apps/web/lib/live-activation.js';
import { buildSingleBroadcastRollbackRunbook, SINGLE_BROADCAST_ROLLBACK_ENV } from '../apps/web/lib/live-rollback-runbook.js';

const LIVE_ENV_KEYS = [
  'LIVE_TRADING_ENABLED',
  'LIVE_BETA_SIGNING_ENABLED',
  'LIVE_BETA_BROADCAST_ENABLED',
  'LIVE_BETA_FUNDING_BROADCAST_ENABLED',
  'LIVE_BETA_FUNDING_BROADCAST_ARMED',
  'LIVE_DEPLOYMENT_ENABLED',
  'LIVE_REQUIRE_SIMULATION',
  'LIVE_ALLOWED_CLUSTER',
  'LIVE_MAX_DAILY_LOSS_SOL',
  'LIVE_KILL_SWITCH_DRAWDOWN_BPS'
];

const clearRiskObservation = {
  startedAt: '2026-08-16T00:00:00.000Z',
  startValueSol: 10,
  currentValueSol: 9.9,
  realizedPnlSol: -0.05,
  observedAt: '2026-08-16T00:01:00.000Z'
};

function withLiveEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map(LIVE_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of LIVE_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('live activation defaults keep signing, broadcast, and deployment disabled', () => {
  withLiveEnv({}, () => {
    const status = getLiveActivationStatus();
    assert.equal(status.liveTradingEnabled, false);
    assert.equal(status.signingEnabled, false);
    assert.equal(status.broadcastEnabled, false);
    assert.equal(status.deploymentEnabled, false);
    assert.equal(status.requireSimulation, true);
    assert.equal(status.readinessLevel, 'disabled');
    assert.match(status.blockers.join('\n'), /LIVE_TRADING_ENABLED is false/);
  });
});

test('broadcast cannot become enabled without both live trading and signing gates', () => {
  withLiveEnv({ LIVE_BETA_BROADCAST_ENABLED: 'true' }, () => {
    const status = getLiveActivationStatus();
    assert.equal(status.liveTradingEnabled, false);
    assert.equal(status.signingEnabled, false);
    assert.equal(status.broadcastEnabled, false);
  });

  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_BETA_BROADCAST_ENABLED: 'true' }, () => {
    const status = getLiveActivationStatus();
    assert.equal(status.signingEnabled, false);
    assert.equal(status.broadcastEnabled, false);
    assert.equal(status.readinessLevel, 'preview');
  });

  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_BETA_SIGNING_ENABLED: 'true', LIVE_BETA_BROADCAST_ENABLED: 'true' }, () => {
    const status = getLiveActivationStatus({ riskObservation: clearRiskObservation });
    assert.equal(status.signingEnabled, true);
    assert.equal(status.broadcastEnabled, true);
    assert.equal(status.readinessLevel, 'broadcast-ready');
  });
});

test('funding broadcast requires explicit armed gate in addition to funding env', () => {
  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_BETA_SIGNING_ENABLED: 'true', LIVE_BETA_FUNDING_BROADCAST_ENABLED: 'true' }, () => {
    const status = getLiveActivationStatus({ riskObservation: clearRiskObservation });
    assert.equal(status.signingEnabled, true);
    assert.equal(status.fundingBroadcastEnabled, false);
    assert.match(status.warnings.join('\n'), /LIVE_BETA_FUNDING_BROADCAST_ARMED is false/);
  });

  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_BETA_SIGNING_ENABLED: 'true', LIVE_BETA_FUNDING_BROADCAST_ENABLED: 'true', LIVE_BETA_FUNDING_BROADCAST_ARMED: 'true' }, () => {
    const status = getLiveActivationStatus({ riskObservation: clearRiskObservation });
    assert.equal(status.fundingBroadcastEnabled, true);
  });
});

test('deployment requires live trading, signing, and explicit deployment gate', () => {
  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_DEPLOYMENT_ENABLED: 'true' }, () => {
    const status = getLiveActivationStatus();
    assert.equal(status.signingEnabled, false);
    assert.equal(status.deploymentEnabled, false);
  });

  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_BETA_SIGNING_ENABLED: 'true', LIVE_DEPLOYMENT_ENABLED: 'true' }, () => {
    const status = getLiveActivationStatus({ riskObservation: clearRiskObservation });
    assert.equal(status.deploymentEnabled, true);
    assert.equal(status.readinessLevel, 'deployment-ready');
  });
});

test('live activation requires drawdown and daily loss observation before signing or broadcast', () => {
  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_BETA_SIGNING_ENABLED: 'true', LIVE_BETA_BROADCAST_ENABLED: 'true' }, () => {
    const status = getLiveActivationStatus();
    assert.equal(status.signingEnabled, false);
    assert.equal(status.broadcastEnabled, false);
    assert.equal(status.readinessLevel, 'preview');
    assert.equal(status.riskReadiness.contract, 'bondr-live-risk-readiness-v1');
    assert.ok(status.blockers.includes('risk:live-risk-drawdown-observation-required'));
  });
});

test('live activation blocks movement when daily loss or drawdown limits trip', () => {
  withLiveEnv({
    LIVE_TRADING_ENABLED: 'true',
    LIVE_BETA_SIGNING_ENABLED: 'true',
    LIVE_BETA_BROADCAST_ENABLED: 'true',
    LIVE_MAX_DAILY_LOSS_SOL: '0.2',
    LIVE_KILL_SWITCH_DRAWDOWN_BPS: '500'
  }, () => {
    const dailyLoss = getLiveActivationStatus({ riskObservation: { ...clearRiskObservation, currentValueSol: 9.7, realizedPnlSol: -0.3 } });
    assert.equal(dailyLoss.signingEnabled, false);
    assert.equal(dailyLoss.broadcastEnabled, false);
    assert.equal(dailyLoss.riskReadiness.drawdown.action, 'block');
    assert.ok(dailyLoss.blockers.includes('risk:max-daily-loss-exceeded'));

    const drawdown = getLiveActivationStatus({ riskObservation: { ...clearRiskObservation, currentValueSol: 9.5, realizedPnlSol: -0.1 } });
    assert.equal(drawdown.signingEnabled, false);
    assert.equal(drawdown.broadcastEnabled, false);
    assert.equal(drawdown.riskReadiness.drawdown.action, 'halt');
    assert.ok(drawdown.blockers.includes('risk:drawdown-kill-switch-triggered'));
  });
});

test('live activation emergency stop blocks signing, broadcast, funding, and deployment gates', () => {
  withLiveEnv({
    LIVE_TRADING_ENABLED: 'true',
    LIVE_BETA_SIGNING_ENABLED: 'true',
    LIVE_BETA_BROADCAST_ENABLED: 'true',
    LIVE_BETA_FUNDING_BROADCAST_ENABLED: 'true',
    LIVE_BETA_FUNDING_BROADCAST_ARMED: 'true',
    LIVE_DEPLOYMENT_ENABLED: 'true'
  }, () => {
    const status = getLiveActivationStatus({
      riskObservation: clearRiskObservation,
      haltActive: true,
      haltPaths: ['/tmp/bondr-test-halt']
    });
    assert.equal(status.signingEnabled, false);
    assert.equal(status.broadcastEnabled, false);
    assert.equal(status.fundingBroadcastEnabled, false);
    assert.equal(status.deploymentEnabled, false);
    assert.equal(status.riskReadiness.killSwitch.active, true);
    assert.ok(status.blockers.includes('risk:kill-switch-active'));
  });
});

test('single-broadcast rollback closes highest-risk gates first and returns all live gates false', () => {
  assert.deepEqual(SINGLE_BROADCAST_ROLLBACK_ENV.map((step) => step.key), [
    'LIVE_BETA_BROADCAST_ENABLED',
    'LIVE_DEPLOYMENT_ENABLED',
    'LIVE_BETA_FUNDING_BROADCAST_ARMED',
    'LIVE_BETA_FUNDING_BROADCAST_ENABLED',
    'LIVE_BETA_SIGNING_ENABLED',
    'LIVE_TRADING_ENABLED'
  ]);
  assert.ok(SINGLE_BROADCAST_ROLLBACK_ENV.every((step) => step.rollbackValue === 'false'));

  const runbook = buildSingleBroadcastRollbackRunbook();
  assert.equal(runbook.contract, 'bondr-single-broadcast-rollback-runbook-v1');
  assert.equal(runbook.mode, 'documentation-only-no-mutation');
  assert.equal(runbook.approvalRequired, true);
  assert.equal(runbook.verification.requiredCapabilityState.liveTradingEnabled, false);
  assert.equal(runbook.verification.requiredCapabilityState.signingEnabled, false);
  assert.equal(runbook.verification.requiredCapabilityState.broadcastEnabled, false);
  assert.equal(runbook.verification.requiredCapabilityState.fundingBroadcastEnabled, false);
  assert.equal(runbook.verification.requiredCapabilityState.deploymentEnabled, false);
  assert.equal(runbook.verification.singleBroadcastPolicy.maxRetries, 0);
  assert.equal(runbook.verification.singleBroadcastPolicy.blindRetries, false);
  assert.equal(runbook.verification.singleBroadcastPolicy.skipPreflight, false);
  assert.equal(runbook.verification.blockedProbe.expectedNoSignature, true);
});

test('execution capabilities exposes the rollback runbook without mutating gates', () => {
  const source = readFileSync(new URL('../apps/web/app/api/execution-capabilities/route.ts', import.meta.url), 'utf8');

  assert.match(source, /buildSingleBroadcastRollbackRunbook/);
  assert.match(source, /singleBroadcastRollback/);
  assert.match(source, /riskReadiness: liveActivation\.riskReadiness/);
  assert.doesNotMatch(source, /env rm LIVE_BETA_BROADCAST_ENABLED/);
});

test('swap build route uses shared live activation risk limits instead of direct live env truth', () => {
  const source = readFileSync(new URL('../apps/web/app/api/execution-swap/route.ts', import.meta.url), 'utf8');

  assert.match(source, /getLiveActivationStatus/);
  assert.match(source, /liveActivation\.signingEnabled/);
  assert.match(source, /liveActivation\.limits\.maxSolPerSwap/);
  assert.match(source, /liveActivation\.limits\.maxUsdcPerSwap/);
  assert.match(source, /liveActivation\.limits\.maxSlippageBps/);
  assert.doesNotMatch(source, /process\.env\.LIVE_TRADING_ENABLED === 'true'/);
});

test('signed broadcast submit is a single RPC attempt with no blind retries', () => {
  const source = readFileSync(new URL('../apps/web/app/api/send-signed-transaction/route.ts', import.meta.url), 'utf8');

  assert.match(source, /SINGLE_BROADCAST_MAX_RETRIES = 0/);
  assert.match(source, /maxRetries: SINGLE_BROADCAST_MAX_RETRIES/);
  assert.match(source, /blindRetries: false/);
  assert.doesNotMatch(source, /maxRetries: 3/);
});

test('single-broadcast rollback doc names every temporary live gate and verification probe', () => {
  const doc = readFileSync(new URL('../docs/BONDR_SINGLE_BROADCAST_ROLLBACK_RUNBOOK_2026-08-16.md', import.meta.url), 'utf8');

  for (const key of SINGLE_BROADCAST_ROLLBACK_ENV.map((step) => step.key)) assert.match(doc, new RegExp(`${key}=false`));
  assert.match(doc, /\/api\/execution-capabilities/);
  assert.match(doc, /\/api\/terminal\/live-readiness/);
  assert.match(doc, /\/api\/send-signed-transaction/);
  assert.match(doc, /no `signature`/);
  assert.match(doc, /`maxRetries=0`/);
  assert.match(doc, /`blindRetries=false`/);
});
