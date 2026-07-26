import assert from 'node:assert/strict';
import test from 'node:test';
import { captureError, safeAsync, safeSync } from '../src/runtime/errors.js';

test('captures Error objects into structured payloads', () => {
  const captured = captureError(new Error('boom'), 'unit');
  assert.equal(captured.label, 'unit');
  assert.equal(captured.message, 'boom');
  assert.equal(captured.name, 'Error');
});

test('safeSync returns value or captured error', () => {
  const ok = safeSync({ label: 'ok', run: () => 42 });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value, 42);

  const bad = safeSync({ label: 'bad', run: () => { throw new Error('nope'); } });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.error.message, 'nope');
});

test('safeAsync returns captured errors without throwing', async () => {
  const result = await safeAsync({
    label: 'async-bad',
    run: async () => { throw new Error('async nope'); }
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.message, 'async nope');
});
