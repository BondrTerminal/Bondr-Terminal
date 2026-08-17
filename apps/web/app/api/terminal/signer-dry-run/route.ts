import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../../lib/solana-rpc';
import { getSolanaRpcHealth } from '../../../../lib/rpc-health';
import { buildTransactionPreview } from '../../../../lib/transaction-preview';
import type { TransactionPreviewAction } from '../../../../lib/transaction-preview';
import { getLiveActivationStatus } from '../../../../lib/live-activation';
import { isProviderLimitedError, providerLimitedNote } from '../../../../lib/provider-truth';
import { decodeTransactionPolicy } from '../../../../lib/transaction-policy';

export const dynamic = 'force-dynamic';

function base64ToBytes(value: string) {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

function decodeTransaction(raw: string) {
  const bytes = base64ToBytes(raw);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(Buffer.from(bytes));
  }
}

function previewAction(action: unknown): TransactionPreviewAction {
  if (action === 'create' || action === 'launch' || action === 'deploy') return 'launch';
  return action === 'fund' || action === 'funding' ? 'funding' : 'swap';
}

function previewBlockers(action: TransactionPreviewAction, failed: boolean, failureSummary: string | null, liveActivation: ReturnType<typeof getLiveActivationStatus>) {
  if (failed) return [failureSummary ?? 'Simulation failed; signing/broadcast blocked while LIVE_REQUIRE_SIMULATION is active.'];
  const blockers = liveActivation.blockers.filter((item) => item !== 'LIVE_BETA_SIGNING_ENABLED is false.');
  if (action === 'funding') {
    return [
      ...blockers.filter((item) => item !== 'LIVE_BETA_BROADCAST_ENABLED is false.'),
      ...(liveActivation.fundingBroadcastEnabled ? [] : ['LIVE_BETA_FUNDING_BROADCAST_ENABLED is false.'])
    ];
  }
  return blockers;
}

function summarizeSimulationFailure(err: unknown, logs: string[] | null | undefined, action: TransactionPreviewAction) {
  const errText = typeof err === 'string' ? err : JSON.stringify(err ?? 'unknown');
  const joinedLogs = (logs ?? []).join(' | ');
  const text = `${errText} ${joinedLogs}`.toLowerCase();
  if (text.includes('insufficient funds') || text.includes('insufficient lamports') || text.includes('accountnotfound') || text.includes('custom program error: 0x1')) {
    return action === 'launch'
      ? 'Simulation failed: deployer signer appears to have insufficient SOL for Pump.fun create, initial buy, rent, and network fees.'
      : 'Simulation failed: connected signer appears to have insufficient SOL/token balance for this unsigned swap and network fees.';
  }
  if (text.includes('blockhash not found') || text.includes('blockhashnotfound')) return 'Simulation failed: transaction blockhash expired before simulation. Rebuild the unsigned transaction and simulate again.';
  if (text.includes('slippage') || text.includes('price impact')) return 'Simulation failed: route/slippage constraints no longer hold. Refresh quote and rebuild.';
  return `Simulation failed: ${errText}`;
}

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  let body: { unsignedTransaction?: string; signedTransaction?: string; action?: string; mint?: string; wallet?: string; expectedSigner?: string; expectedMint?: string; transactionMessageHash?: string | null };
  try {
    body = await request.json();
  } catch {
    return Response.json({
      status: 'error',
      observedAt,
      error: 'Invalid JSON body.',
      transactionPreview: buildTransactionPreview({
        status: 'error',
        mode: 'preview-only',
        action: 'swap',
        route: '/api/terminal/signer-dry-run',
        blockers: ['Invalid JSON body.'],
        warnings: ['Dry-run only. Signing and broadcast disabled.']
      })
    }, { status: 400 });
  }

  const raw = body.unsignedTransaction ?? body.signedTransaction;
  const action = previewAction(body.action);
  if (!raw) {
    return Response.json({
      status: 'blocked',
      observedAt,
      error: 'Missing unsignedTransaction or signedTransaction base64 payload.',
      transactionPreview: buildTransactionPreview({
        status: 'blocked',
        mode: 'preview-only',
        action,
        route: '/api/terminal/signer-dry-run',
        blockers: ['Simulation pending — no unsigned transaction built yet.'],
        warnings: ['Dry-run only. Signing and broadcast disabled.']
      })
    }, { status: 400 });
  }

  let transaction: Transaction | VersionedTransaction;
  let decoded: ReturnType<typeof decodeTransactionPolicy>;
  try {
    transaction = decodeTransaction(raw);
    decoded = decodeTransactionPolicy(Buffer.from(raw, 'base64'));
  } catch (error) {
    return Response.json({
      status: 'error',
      observedAt,
      error: error instanceof Error ? error.message : 'Transaction decode failed.',
      transactionPreview: buildTransactionPreview({
        status: 'error',
        mode: 'simulation-ready',
        action,
        tokenMint: body.mint,
        wallet: body.wallet,
        route: '/api/terminal/signer-dry-run',
        simulationStatus: 'failed',
        blockers: ['Transaction decode failed.'],
        warnings: ['No signing or broadcast was attempted.']
      })
    }, { status: 400 });
  }

  const expectedSigner = body.expectedSigner ?? body.wallet ?? null;
  const expectedMint = body.expectedMint ?? body.mint ?? null;
  const expectedMessageHash = body.transactionMessageHash ?? null;
  const handoffBlockers = [
    expectedSigner && !decoded.signerKeys.includes(expectedSigner) ? 'Simulation handoff rejected: transaction does not include expectedSigner.' : null,
    expectedMint && !decoded.accountKeys.includes(expectedMint) ? 'Simulation handoff rejected: transaction does not reference expectedMint.' : null,
    expectedMessageHash && decoded.messageHash !== expectedMessageHash ? 'Simulation handoff rejected: transaction message hash does not match the built intent.' : null
  ].filter((item): item is string => Boolean(item));
  const handoffEvidence = {
    transactionMessageHash: decoded.messageHash,
    expectedTransactionMessageHash: expectedMessageHash,
    expectedSigner,
    expectedMint,
    signerMatched: expectedSigner ? decoded.signerKeys.includes(expectedSigner) : null,
    expectedMintReferenced: expectedMint ? decoded.accountKeys.includes(expectedMint) : null,
    programs: decoded.programs,
    usesAddressLookupTables: Boolean(decoded.usesAddressLookupTables),
    unresolvedAddressLookupTables: decoded.unresolvedAddressLookupTables ?? []
  };

  if (handoffBlockers.length) {
    return Response.json({
      status: 'blocked',
      observedAt,
      error: handoffBlockers[0],
      execution: 'simulation-policy-blocked-no-signing-no-broadcast',
      transactionEvidence: handoffEvidence,
      simulationProof: {
        status: 'blocked',
        transactionMessageHash: decoded.messageHash,
        expectedTransactionMessageHash: expectedMessageHash,
        observedAt
      },
      transactionPreview: buildTransactionPreview({
        status: 'blocked',
        mode: 'simulation-ready',
        action,
        tokenMint: expectedMint ?? body.mint,
        wallet: expectedSigner ?? body.wallet,
        route: '/api/terminal/signer-dry-run',
        simulationStatus: 'failed',
        blockers: handoffBlockers,
        warnings: ['No signing or broadcast was attempted.']
      })
    }, { status: 409 });
  }

  const rpc = configuredSolanaRpc();
  const rpcHealth = await getSolanaRpcHealth();
  const liveActivation = getLiveActivationStatus({ rpcHealth });

  if (rpcHealth.status !== 'live') {
    const providerState = rpcHealth.status === 'provider-limited' || rpcHealth.quotaLimited ? 'provider-limited' : rpcHealth.status === 'modeled' ? 'modeled' : 'unavailable';
    const message = providerState === 'provider-limited'
      ? `Provider-limited: simulation was not run because ${rpcHealth.selectedProviderLabel} RPC is quota-limited, timed out, or degraded. This is provider state, not transaction failure. ${rpcHealth.note}`
      : `Simulation unavailable: ${rpcHealth.selectedProviderLabel} RPC is ${providerState}. This is provider state, not transaction failure. ${rpcHealth.note}`;
    return Response.json({
      status: providerState,
      observedAt,
      error: message,
      execution: 'simulation-only-provider-blocked',
      rpcProvider: rpc.provider,
      rpcHealth: { status: rpcHealth.status, quotaLimited: rpcHealth.quotaLimited, provider: rpcHealth.selectedProvider, providerLabel: rpcHealth.selectedProviderLabel, note: rpcHealth.note },
      transactionEvidence: handoffEvidence,
      simulationProof: {
        status: providerState,
        transactionMessageHash: decoded.messageHash,
        expectedTransactionMessageHash: expectedMessageHash,
        observedAt
      },
      transactionPreview: buildTransactionPreview({
        status: 'blocked',
        mode: 'simulation-ready',
        action,
        tokenMint: body.mint,
        wallet: body.wallet,
        provider: rpc.provider,
        route: '/api/terminal/signer-dry-run',
        simulationStatus: 'failed',
        blockers: [message],
        warnings: ['No signing or broadcast was attempted.']
      })
    }, { status: providerState === 'provider-limited' ? 429 : 503 });
  }

  try {
    const connection = new Connection(rpc.url, 'confirmed');
    const simulation = transaction instanceof VersionedTransaction
      ? await connection.simulateTransaction(transaction, { sigVerify: false, replaceRecentBlockhash: true })
      : await connection.simulateTransaction(transaction, undefined, false);
    const failed = Boolean(simulation.value.err);
    const failureSummary = failed ? summarizeSimulationFailure(simulation.value.err, simulation.value.logs, action) : null;
    return Response.json({
      status: failed ? 'error' : 'ok',
      observedAt,
      execution: 'simulation-only',
      liveTradingEnabled: liveActivation.liveTradingEnabled,
      signingEnabled: liveActivation.signingEnabled && !failed,
      broadcastEnabled: liveActivation.broadcastEnabled && !failed,
      requireSimulation: liveActivation.requireSimulation,
      rpcProvider: rpc.provider,
      transactionEvidence: handoffEvidence,
      simulation: {
        err: simulation.value.err,
        logs: simulation.value.logs ?? [],
        unitsConsumed: simulation.value.unitsConsumed ?? null,
        failureSummary,
      },
      simulationProof: {
        status: failed ? 'failed' : 'ok',
        transactionMessageHash: decoded.messageHash,
        expectedTransactionMessageHash: expectedMessageHash,
        provider: rpc.provider,
        unitsConsumed: simulation.value.unitsConsumed ?? null,
        observedAt
      },
      transactionPreview: buildTransactionPreview({
        status: failed ? 'blocked' : 'ok',
        mode: 'simulation-ready',
        action,
        tokenMint: body.mint,
        wallet: body.wallet,
        provider: rpc.provider,
        route: '/api/terminal/signer-dry-run',
        simulationStatus: failed ? 'failed' : 'passed',
        blockers: previewBlockers(action, failed, failureSummary, liveActivation),
        warnings: ['Simulation only. Server did not sign or broadcast this transaction.', ...liveActivation.warnings]
      })
    }, { status: failed ? 422 : 200 });
  } catch (error) {
    const providerLimited = isProviderLimitedError(error);
    const message = providerLimited ? providerLimitedNote(error, 'transaction simulation') : error instanceof Error ? `Simulation unavailable: RPC/provider request failed before transaction execution. Detail: ${error.message}` : 'Simulation unavailable: RPC/provider request failed before transaction execution.';
    return Response.json({
      status: providerLimited ? 'provider-limited' : 'unavailable',
      observedAt,
      error: message,
      rpcProvider: rpc.provider,
      transactionEvidence: handoffEvidence,
      simulationProof: {
        status: providerLimited ? 'provider-limited' : 'unavailable',
        transactionMessageHash: decoded.messageHash,
        expectedTransactionMessageHash: expectedMessageHash,
        observedAt
      },
      transactionPreview: buildTransactionPreview({
        status: 'error',
        mode: 'simulation-ready',
        action,
        tokenMint: body.mint,
        wallet: body.wallet,
        provider: rpc.provider,
        route: '/api/terminal/signer-dry-run',
        simulationStatus: 'failed',
        blockers: [message],
        warnings: ['No signing or broadcast was attempted.']
      })
    }, { status: providerLimited ? 429 : 503 });
  }
}

export async function GET() {
  const rpcHealth = await getSolanaRpcHealth();
  const liveActivation = getLiveActivationStatus({ rpcHealth });
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    execution: 'simulation-only',
    route: '/api/terminal/signer-dry-run',
    liveActivation,
    transactionPreview: buildTransactionPreview({
      status: 'blocked',
      mode: 'preview-only',
      action: 'swap',
      route: '/api/terminal/signer-dry-run',
      blockers: ['POST an unsignedTransaction to simulate.'],
      warnings: ['Dry-run only. Signing and broadcast disabled unless explicit gates are active.']
    })
  });
}
