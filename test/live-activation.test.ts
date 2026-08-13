import assert from 'node:assert/strict';
import test from 'node:test';
import { getLiveActivationStatus } from '../apps/web/lib/live-activation.js';

const LIVE_ENV_KEYS = [
  'LIVE_TRADING_ENABLED',
  'LIVE_BETA_SIGNING_ENABLED',
  'LIVE_BETA_BROADCAST_ENABLED',
  'LIVE_DEPLOYMENT_ENABLED',
  'LIVE_REQUIRE_SIMULATION',
  'LIVE_ALLOWED_CLUSTER'
];

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
    const status = getLiveActivationStatus();
    assert.equal(status.signingEnabled, true);
    assert.equal(status.broadcastEnabled, true);
    assert.equal(status.readinessLevel, 'broadcast-ready');
  });
});

test('deployment requires live trading, signing, and explicit deployment gate', () => {
  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_DEPLOYMENT_ENABLED: 'true' }, () => {
    const status = getLiveActivationStatus();
    assert.equal(status.signingEnabled, false);
    assert.equal(status.deploymentEnabled, false);
  });

  withLiveEnv({ LIVE_TRADING_ENABLED: 'true', LIVE_BETA_SIGNING_ENABLED: 'true', LIVE_DEPLOYMENT_ENABLED: 'true' }, () => {
    const status = getLiveActivationStatus();
    assert.equal(status.deploymentEnabled, true);
    assert.equal(status.readinessLevel, 'deployment-ready');
  });
});
