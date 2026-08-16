import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { getLiveActivationStatus } from '../../../../lib/live-activation';
import { isProviderLimitedError, providerLimitedNote } from '../../../../lib/provider-truth';
import { getSolanaRpcHealth } from '../../../../lib/rpc-health';
import { buildRaydiumLpSimulationPolicy, type RaydiumLpSimulationPolicyInput } from '../../../../lib/raydium-lp-simulation-policy';
import { configuredSolanaRpc } from '../../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

function decodeTransaction(raw: string) {
  const bytes = Buffer.from(raw, 'base64');
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

async function simulate(transactionBase64: string) {
  const rpc = configuredSolanaRpc();
  const rpcHealth = await getSolanaRpcHealth();
  if (rpcHealth.status !== 'live') {
    return {
      blocked: Response.json({
        status: rpcHealth.status === 'provider-limited' || rpcHealth.quotaLimited ? 'provider-limited' : 'unavailable',
        observedAt: new Date().toISOString(),
        execution: 'raydium-lp-simulation-provider-blocked-no-signing-no-broadcast',
        rpcProvider: rpc.provider,
        rpcHealth: { status: rpcHealth.status, quotaLimited: rpcHealth.quotaLimited, provider: rpcHealth.selectedProvider, note: rpcHealth.note },
        blockers: [`Simulation unavailable: ${rpcHealth.selectedProviderLabel} RPC is ${rpcHealth.status}. ${rpcHealth.note}`]
      }, { status: rpcHealth.status === 'provider-limited' || rpcHealth.quotaLimited ? 429 : 503, headers: { 'cache-control': 'no-store' } })
    };
  }

  try {
    const tx = decodeTransaction(transactionBase64);
    const connection = new Connection(rpc.url, 'confirmed');
    const simulation = tx instanceof VersionedTransaction
      ? await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true })
      : await connection.simulateTransaction(tx, undefined, false);
    return {
      proof: {
        err: simulation.value.err,
        logs: simulation.value.logs ?? [],
        unitsConsumed: simulation.value.unitsConsumed ?? null,
        provider: rpc.provider
      }
    };
  } catch (error) {
    const providerLimited = isProviderLimitedError(error);
    return {
      blocked: Response.json({
        status: providerLimited ? 'provider-limited' : 'unavailable',
        observedAt: new Date().toISOString(),
        execution: 'raydium-lp-simulation-provider-error-no-signing-no-broadcast',
        rpcProvider: rpc.provider,
        error: providerLimited ? providerLimitedNote(error, 'Raydium LP simulation') : error instanceof Error ? error.message : 'Raydium LP simulation failed before execution.',
        blockers: ['simulation-provider-error']
      }, { status: providerLimited ? 429 : 503, headers: { 'cache-control': 'no-store' } })
    };
  }
}

export async function GET() {
  const rpcHealth = await getSolanaRpcHealth();
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    contract: 'bondr-raydium-lp-simulation-policy-v1',
    execution: 'raydium-lp-simulation-policy-status-only-no-signing-no-broadcast',
    liveActivation: getLiveActivationStatus({ rpcHealth }),
    expectedPostBody: {
      transactionBase64: 'unsigned Raydium transaction base64',
      expectedSigner: 'deployer public key',
      baseMint: 'base token mint',
      quoteMint: 'quote token mint',
      requiredAccounts: 'derived pool/LP/vault/user token account addresses',
      simulationProof: 'optional existing simulation result; provider simulation runs when omitted'
    },
    safety: { noSigning: true, noBroadcast: true, noServerCustody: true }
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  let body: RaydiumLpSimulationPolicyInput;
  try {
    body = await request.json();
  } catch {
    return Response.json({
      status: 'blocked',
      observedAt,
      execution: 'raydium-lp-policy-and-simulation-review-no-signing-no-broadcast',
      blockers: ['invalid-json-body']
    }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  let simulationProof = body.simulationProof ?? null;
  if (!simulationProof && body.transactionBase64) {
    const result = await simulate(body.transactionBase64);
    if ('blocked' in result && result.blocked) return result.blocked;
    simulationProof = result.proof;
  }

  const policy = buildRaydiumLpSimulationPolicy({ ...body, simulationProof });
  return Response.json({
    status: policy.status,
    observedAt,
    policy,
    execution: policy.execution
  }, { status: policy.status === 'passed' ? 200 : 409, headers: { 'cache-control': 'no-store' } });
}
