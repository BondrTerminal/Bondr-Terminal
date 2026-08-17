import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('unsigned Jupiter build response exposes a stable simulation handoff evidence receipt', () => {
  const executionSwapSource = source('../apps/web/app/api/execution-swap/route.ts');

  assert.match(executionSwapSource, /handoffEvidence:\s*\{/);
  assert.match(executionSwapSource, /phase:\s*'unsigned-build'/);
  assert.match(executionSwapSource, /nextRequiredPhase:\s*'simulation'/);
  assert.match(executionSwapSource, /nextRoute:\s*'\/api\/terminal\/signer-dry-run'/);
  assert.match(executionSwapSource, /expectedSigner:\s*userPublicKey/);
  assert.match(executionSwapSource, /expectedMint:\s*mint/);
  assert.match(executionSwapSource, /allowedPrograms:\s*intent\.allowedPrograms/);
  assert.match(executionSwapSource, /requiredAccounts:\s*intent\.requiredAccounts/);
  assert.match(executionSwapSource, /transactionMessageHash:\s*intent\.transactionMessageHash/);
  assert.match(executionSwapSource, /simulationRequired:\s*true/);
});

test('simulation dry-run binds proof to signer, mint, and transaction message hash before signing', () => {
  const signerDryRunSource = source('../apps/web/app/api/terminal/signer-dry-run/route.ts');

  assert.match(signerDryRunSource, /decodeTransactionPolicy\(Buffer\.from\(raw,\s*'base64'\)\)/);
  assert.match(signerDryRunSource, /Simulation handoff rejected: transaction does not include expectedSigner/);
  assert.match(signerDryRunSource, /Simulation handoff rejected: transaction does not reference expectedMint/);
  assert.match(signerDryRunSource, /Simulation handoff rejected: transaction message hash does not match the built intent/);
  assert.match(signerDryRunSource, /transactionEvidence:\s*handoffEvidence/);
  assert.match(signerDryRunSource, /simulationProof:\s*\{/);
  assert.match(signerDryRunSource, /transactionMessageHash:\s*decoded\.messageHash/);
});

test('signed review requires a hash-bound ok simulation proof', () => {
  const signedReviewSource = source('../apps/web/app/api/terminal/signed-review/route.ts');

  assert.match(signedReviewSource, /simulationTransactionMessageHash\?:\s*string \| null/);
  assert.match(signedReviewSource, /Simulation result must be ok before a signed payload is accepted for review/);
  assert.match(signedReviewSource, /Signed review requires simulationTransactionMessageHash/);
  assert.match(signedReviewSource, /Simulation proof message hash does not match the stored transaction intent/);
  assert.match(signedReviewSource, /transactionMessageHash:\s*expectedTransactionMessageHash/);
  assert.match(signedReviewSource, /simulationTransactionMessageHash,/);
});

test('broadcast route rejects direct signed submits without matching simulation proof hash', () => {
  const sendSource = source('../apps/web/app/api/send-signed-transaction/route.ts');

  assert.match(sendSource, /simulationTransactionMessageHash\?:\s*string \| null/);
  assert.match(sendSource, /Broadcast requires simulationTransactionMessageHash from the simulation proof/);
  assert.match(sendSource, /Broadcast simulation proof message hash does not match the stored transaction intent/);
  assert.match(sendSource, /simulationProofError/);
  assert.match(sendSource, /simulationTransactionMessageHash,/);
});

test('swap and deployment UIs pass build hash into simulation and simulation proof into signed review', () => {
  const executionDockSource = source('../apps/web/app/sniper/components/ExecutionDock.tsx');
  const deploymentBuilderSource = source('../apps/web/app/deployment/components/DeploymentLaunchBuilderPanel.tsx');

  for (const componentSource of [executionDockSource, deploymentBuilderSource]) {
    assert.match(componentSource, /transactionMessageHash:/);
    assert.match(componentSource, /simulationTransactionMessageHash:/);
    assert.match(componentSource, /simulation\?\.simulationProof\?\.transactionMessageHash/);
  }
  assert.match(executionDockSource, /expectedSigner:\s*build\.expectedSigner/);
  assert.match(executionDockSource, /expectedMint:\s*build\.expectedMint/);
  assert.match(deploymentBuilderSource, /expectedSigner:\s*pumpPortalBuild\?\.result\?\.intent\?\.expectedSigner/);
  assert.match(deploymentBuilderSource, /expectedMint:\s*pumpPortalBuild\?\.result\?\.intent\?\.expectedMint/);
});
