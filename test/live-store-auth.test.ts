import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const liveStoreSource = readFileSync(new URL('../apps/web/lib/live-store.ts', import.meta.url), 'utf8');
const checklistSource = readFileSync(new URL('../apps/web/lib/pre-live-checklist.ts', import.meta.url), 'utf8');
const resolutionRouteSource = readFileSync(new URL('../apps/web/app/api/pre-live-resolution/route.ts', import.meta.url), 'utf8');

test('live-store production readiness recognizes Meridian auth config without old alias dependence only', () => {
  assert.match(liveStoreSource, /import \{ meridianAuthConfig \} from '\.\/meridian-auth'/);
  assert.match(liveStoreSource, /meridianAuthConfig\(\)\.configured/);
  assert.match(liveStoreSource, /TERMINAL_OPERATOR_TOKEN/);
  assert.match(liveStoreSource, /OPERATOR_SESSION_SECRET/);
});

test('pre-live checklist remains read-only and never allows live execution', () => {
  assert.match(checklistSource, /liveExecutionAllowed:\s*false/);
  assert.match(checklistSource, /Read-only pre-live checklist/);
  assert.match(checklistSource, /It does not sign, swap, fund, broadcast, or launch/);
  assert.match(checklistSource, /auth\.configured && auth\.authenticated \? 'pass' : auth\.configured \? 'warn' : 'fail'/);
});

test('pre-live resolution matrix is read-only and groups unresolved work by owner/action type', () => {
  assert.match(resolutionRouteSource, /meridian-pre-live-resolution-matrix-v1/);
  assert.match(resolutionRouteSource, /liveExecutionAllowed:\s*false/);
  assert.match(resolutionRouteSource, /read-only-resolution-matrix-no-signing-no-swaps-no-broadcasts/);
  assert.match(resolutionRouteSource, /fixableInCode/);
  assert.match(resolutionRouteSource, /operatorActionRequired/);
  assert.match(resolutionRouteSource, /externalProviderRequired/);
  assert.match(resolutionRouteSource, /intentionallyDisabledUntilLive/);
});
