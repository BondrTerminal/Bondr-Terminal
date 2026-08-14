import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ALLOWED_SWAP_PROGRAMS, fundingPolicyCheck, policyCheck, type DecodedTransactionPolicy } from '../apps/web/lib/transaction-policy.js';

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

test('policy check blocks address lookup table transactions until unresolved lookup keys are resolved', () => {
  const decoded: DecodedTransactionPolicy = {
    kind: 'versioned',
    signerKeys: [SIGNER],
    accountKeys: [SIGNER, MINT, SPL_TOKEN_PROGRAM_ID],
    programs: [SPL_TOKEN_PROGRAM_ID],
    messageHash: 'message-hash',
    usesAddressLookupTables: true,
    unresolvedAddressLookupTables: ['Lookup111111111111111111111111111111111111']
  };

  const result = policyCheck({ decoded, expectedSigner: SIGNER, expectedMint: MINT });

  assert.equal(result.safeToBroadcastIfLiveEnabled, false);
  assert.match(result.blockers.join('\n'), /Address lookup table resolution required/);
});

test('policy check allows resolved lookup table transactions', () => {
  const decoded: DecodedTransactionPolicy = {
    kind: 'versioned',
    signerKeys: [SIGNER],
    accountKeys: [SIGNER, MINT, SPL_TOKEN_PROGRAM_ID],
    programs: [SPL_TOKEN_PROGRAM_ID],
    messageHash: 'message-hash',
    usesAddressLookupTables: true,
    unresolvedAddressLookupTables: []
  };

  const result = policyCheck({ decoded, expectedSigner: SIGNER, expectedMint: MINT });

  assert.equal(result.safeToBroadcastIfLiveEnabled, true);
  assert.deepEqual(result.blockers, []);
});

test('sync decoder handles unresolved versioned lookup-table transactions for build hashing', async () => {
  const { AddressLookupTableAccount, Keypair, SystemProgram, TransactionMessage, VersionedTransaction } = await import('@solana/web3.js');
  const { decodeTransactionPolicy } = await import('../apps/web/lib/transaction-policy.js');
  const payer = Keypair.generate();
  const destination = Keypair.generate().publicKey;
  const lookupTable = new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: {
      deactivationSlot: BigInt('18446744073709551615'),
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: null,
      addresses: [destination]
    }
  });
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
    instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: destination, lamports: 1 })]
  }).compileToV0Message([lookupTable]);
  const tx = new VersionedTransaction(message);
  tx.sign([payer]);

  const decoded = decodeTransactionPolicy(Buffer.from(tx.serialize()));

  assert.equal(decoded.kind, 'versioned');
  assert.equal(decoded.usesAddressLookupTables, true);
  assert.deepEqual(decoded.unresolvedAddressLookupTables, [lookupTable.key.toBase58()]);
  assert.equal(typeof decoded.messageHash, 'string');
  assert.ok(decoded.messageHash.length > 0);
});

test('policy check permits wallet assertion hash mismatch only when requested', () => {
  const decoded: DecodedTransactionPolicy = {
    kind: 'versioned',
    signerKeys: [SIGNER],
    accountKeys: [SIGNER, MINT, SPL_TOKEN_PROGRAM_ID, 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'],
    programs: [SPL_TOKEN_PROGRAM_ID, 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'],
    messageHash: 'wallet-wrapped-message-hash'
  };

  const blocked = policyCheck({ decoded, expectedSigner: SIGNER, expectedMint: MINT, transactionMessageHash: 'intent-message-hash' });
  assert.equal(blocked.safeToBroadcastIfLiveEnabled, false);
  assert.match(blocked.blockers.join('\n'), /Transaction message hash does not match intent/);

  const allowed = policyCheck({ decoded, expectedSigner: SIGNER, expectedMint: MINT, transactionMessageHash: 'intent-message-hash', allowWalletAssertionHashMismatch: true });
  assert.equal(allowed.safeToBroadcastIfLiveEnabled, true);
  assert.deepEqual(allowed.blockers, []);
  assert.match(allowed.warnings.join('\n'), /wallet assertion wrapping/);
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

test('funding policy allows only approved capped SOL transfer', async () => {
  const { Keypair, SystemProgram, Transaction } = await import('@solana/web3.js');
  const { decodeTransactionPolicy, fundingPolicyCheck } = await import('../apps/web/lib/transaction-policy.js');
  const source = Keypair.generate();
  const destination = Keypair.generate().publicKey;
  const tx = new Transaction();
  tx.recentBlockhash = '11111111111111111111111111111111';
  tx.feePayer = source.publicKey;
  tx.add(SystemProgram.transfer({ fromPubkey: source.publicKey, toPubkey: destination, lamports: 1_000_000 }));
  tx.sign(source);
  const decoded = decodeTransactionPolicy(tx.serialize());
  const result = fundingPolicyCheck({ decoded, expectedSigner: source.publicKey.toBase58(), allowedSource: source.publicKey.toBase58(), allowedDestination: destination.toBase58(), maxLamports: 1_000_000 });
  assert.equal(result.safeToBroadcastFunding, true);
  assert.equal(result.transfer?.lamports, 1_000_000);
});

test('funding policy allows wallet-added compute budget and Lighthouse assertions', async () => {
  const { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = await import('@solana/web3.js');
  const { decodeTransactionPolicy, fundingPolicyCheck } = await import('../apps/web/lib/transaction-policy.js');
  const source = Keypair.generate();
  const destination = Keypair.generate().publicKey;
  const lighthouseProgramId = new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');
  const tx = new Transaction();
  tx.recentBlockhash = '11111111111111111111111111111111';
  tx.feePayer = source.publicKey;
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }),
    SystemProgram.transfer({ fromPubkey: source.publicKey, toPubkey: destination, lamports: 1_000_000 }),
    new TransactionInstruction({
      programId: lighthouseProgramId,
      keys: [{ pubkey: source.publicKey, isSigner: true, isWritable: true }],
      data: Buffer.from([0])
    })
  );
  tx.sign(source);

  const decoded = decodeTransactionPolicy(tx.serialize());
  const result = fundingPolicyCheck({ decoded, expectedSigner: source.publicKey.toBase58(), allowedSource: source.publicKey.toBase58(), allowedDestination: destination.toBase58(), maxLamports: 1_000_000 });

  assert.equal(result.safeToBroadcastFunding, true);
  assert.deepEqual(decoded.systemTransfers, [{ from: source.publicKey.toBase58(), to: destination.toBase58(), lamports: 1_000_000 }]);
  assert.ok(result.allowedPrograms.includes('ComputeBudget111111111111111111111111111111'));
  assert.ok(result.allowedPrograms.includes('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'));
});

test('funding policy blocks destination mismatch and over-cap transfer', async () => {
  const { Keypair, SystemProgram, Transaction } = await import('@solana/web3.js');
  const { decodeTransactionPolicy, fundingPolicyCheck } = await import('../apps/web/lib/transaction-policy.js');
  const source = Keypair.generate();
  const destination = Keypair.generate().publicKey;
  const otherDestination = Keypair.generate().publicKey;
  const tx = new Transaction();
  tx.recentBlockhash = '11111111111111111111111111111111';
  tx.feePayer = source.publicKey;
  tx.add(SystemProgram.transfer({ fromPubkey: source.publicKey, toPubkey: destination, lamports: 1_000_001 }));
  tx.sign(source);
  const decoded = decodeTransactionPolicy(tx.serialize());
  const result = fundingPolicyCheck({ decoded, expectedSigner: source.publicKey.toBase58(), allowedSource: source.publicKey.toBase58(), allowedDestination: otherDestination.toBase58(), maxLamports: 1_000_000 });
  assert.equal(result.safeToBroadcastFunding, false);
  assert.match(result.blockers.join('\n'), /destination/);
  assert.match(result.blockers.join('\n'), /exceeds cap/);
});

test('funding policy still blocks unapproved auxiliary programs', () => {
  const decoded: DecodedTransactionPolicy = {
    kind: 'versioned',
    signerKeys: [SIGNER],
    accountKeys: [SIGNER, MINT],
    programs: ['11111111111111111111111111111111', 'HiddenProgram1111111111111111111111111111111'],
    messageHash: 'message-hash',
    systemTransfers: [{ from: SIGNER, to: MINT, lamports: 1_000_000 }]
  };

  const result = fundingPolicyCheck({ decoded, expectedSigner: SIGNER, allowedSource: SIGNER, allowedDestination: MINT, maxLamports: 1_000_000 });

  assert.equal(result.safeToBroadcastFunding, false);
  assert.match(result.blockers.join('\n'), /HiddenProgram/);
});
