import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ALLOWED_SWAP_PROGRAMS, policyCheck, type DecodedTransactionPolicy } from '../apps/web/lib/transaction-policy.js';

const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SIGNER = '11111111111111111111111111111112';
const MINT = 'So11111111111111111111111111111111111111112';

test('default swap policy allows the canonical SPL Token program id', () => {
  assert.ok(DEFAULT_ALLOWED_SWAP_PROGRAMS.includes(SPL_TOKEN_PROGRAM_ID));
  assert.equal(DEFAULT_ALLOWED_SWAP_PROGRAMS.includes('TokenkegQfeZyiNwAJbNbLqPFXCWuBvf9Ss623VQ5DA'), false);
});

test('policy check does not falsely block valid client-signed swap programs', () => {
  const decoded: DecodedTransactionPolicy = {
    kind: 'versioned',
    signerKeys: [SIGNER],
    accountKeys: [SIGNER, MINT, SPL_TOKEN_PROGRAM_ID, 'ComputeBudget111111111111111111111111111111'],
    programs: [SPL_TOKEN_PROGRAM_ID, 'ComputeBudget111111111111111111111111111111'],
    messageHash: 'message-hash'
  };

  const result = policyCheck({ decoded, expectedSigner: SIGNER, expectedMint: MINT });

  assert.equal(result.safeToBroadcastIfLiveEnabled, true);
  assert.deepEqual(result.blockers, []);
});

test('policy check blocks hidden program injection before broadcast', () => {
  const decoded: DecodedTransactionPolicy = {
    kind: 'versioned',
    signerKeys: [SIGNER],
    accountKeys: [SIGNER, MINT, 'HiddenSwap1111111111111111111111111111111111'],
    programs: ['HiddenSwap1111111111111111111111111111111111'],
    messageHash: 'message-hash'
  };

  const result = policyCheck({ decoded, expectedSigner: SIGNER, expectedMint: MINT });

  assert.equal(result.safeToBroadcastIfLiveEnabled, false);
  assert.match(result.blockers.join('\n'), /Program not allowed by intent policy/);
});

test('policy check blocks mismatched signer, missing mint, and changed message hash', () => {
  const decoded: DecodedTransactionPolicy = {
    kind: 'versioned',
    signerKeys: [SIGNER],
    accountKeys: [SIGNER, SPL_TOKEN_PROGRAM_ID],
    programs: [SPL_TOKEN_PROGRAM_ID],
    messageHash: 'actual-message-hash'
  };

  const result = policyCheck({ decoded, expectedSigner: MINT, expectedMint: MINT, transactionMessageHash: 'expected-message-hash' });

  assert.equal(result.safeToBroadcastIfLiveEnabled, false);
  assert.match(result.blockers.join('\n'), /Signed transaction does not include expectedSigner as signer/);
  assert.match(result.blockers.join('\n'), /Signed transaction does not reference expectedMint/);
  assert.match(result.blockers.join('\n'), /Transaction message hash does not match intent/);
});

test('policy check blocks address lookup table transactions until resolved', () => {
  const decoded: DecodedTransactionPolicy = {
    kind: 'versioned',
    signerKeys: [SIGNER],
    accountKeys: [SIGNER, MINT, SPL_TOKEN_PROGRAM_ID],
    programs: [SPL_TOKEN_PROGRAM_ID],
    messageHash: 'message-hash',
    usesAddressLookupTables: true
  };

  const result = policyCheck({ decoded, expectedSigner: SIGNER, expectedMint: MINT });

  assert.equal(result.safeToBroadcastIfLiveEnabled, false);
  assert.match(result.blockers.join('\n'), /Address lookup table resolution required/);
});

test('policy check binds signed transaction to expected message hash and required intent accounts', () => {
  const decoded: DecodedTransactionPolicy = {
    kind: 'versioned',
    signerKeys: [SIGNER],
    accountKeys: [SIGNER, MINT, SPL_TOKEN_PROGRAM_ID],
    programs: [SPL_TOKEN_PROGRAM_ID],
    messageHash: 'signed-message-hash'
  };

  const passed = policyCheck({ decoded, expectedSigner: SIGNER, expectedMint: MINT, transactionMessageHash: 'signed-message-hash', requiredAccounts: [SIGNER, MINT] });
  assert.equal(passed.safeToBroadcastIfLiveEnabled, true);
  assert.equal(passed.transactionMessageHash, 'signed-message-hash');

  const blocked = policyCheck({ decoded, expectedSigner: SIGNER, expectedMint: MINT, transactionMessageHash: 'old-message-hash', requiredAccounts: [SIGNER, MINT, 'Sysvar1111111111111111111111111111111111111'] });
  assert.equal(blocked.safeToBroadcastIfLiveEnabled, false);
  assert.match(blocked.blockers.join('\n'), /Transaction message hash does not match intent/);
  assert.match(blocked.blockers.join('\n'), /Required account missing/);
});
