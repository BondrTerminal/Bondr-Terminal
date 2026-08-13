import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { getLiveActivationStatus } from '../../../lib/live-activation';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const RENT_SYSVAR_ID = new PublicKey('SysvarRent111111111111111111111111111111111');
const MINT_SIZE = 82;

function liveEnabled() { return getLiveActivationStatus().deploymentEnabled; }
function parsePk(value: unknown, label: string) { if (typeof value !== 'string' || !ADDRESS_RE.test(value)) throw new Error(`Missing or invalid ${label}.`); return new PublicKey(value); }
function u64LE(value: bigint) { const b = Buffer.alloc(8); b.writeBigUInt64LE(value); return b; }
function u32LE(value: number) { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; }
function u8(value: number) { return Buffer.from([value]); }
function checkedAmount(uiSupply: number, decimals: number) { if (!Number.isFinite(uiSupply) || uiSupply < 0) throw new Error('initialSupply must be a non-negative number.'); return BigInt(Math.round(uiSupply * 10 ** decimals)); }
function ataAddress(owner: PublicKey, mint: PublicKey) { return PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0]; }
function createInitializeMint2Instruction(mint: PublicKey, decimals: number, mintAuthority: PublicKey, freezeAuthority: PublicKey | null) {
  const data = Buffer.concat([u8(20), u8(decimals), mintAuthority.toBuffer(), freezeAuthority ? Buffer.concat([u32LE(1), freezeAuthority.toBuffer()]) : u32LE(0)]);
  return new TransactionInstruction({ programId: TOKEN_PROGRAM_ID, keys: [{ pubkey: mint, isSigner: false, isWritable: true }], data });
}
function createAssociatedTokenAccountInstruction(payer: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey) {
  return new TransactionInstruction({ programId: ASSOCIATED_TOKEN_PROGRAM_ID, keys: [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false }
  ], data: Buffer.alloc(0) });
}
function createMintToCheckedInstruction(mint: PublicKey, destination: PublicKey, authority: PublicKey, amount: bigint, decimals: number) {
  return new TransactionInstruction({ programId: TOKEN_PROGRAM_ID, keys: [
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: destination, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false }
  ], data: Buffer.concat([u8(14), u64LE(amount), u8(decimals)]) });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project')?.trim() || null;
  const observedAt = new Date().toISOString();
  const store = await getMeridianWalletStore();

  if (projectId && !resolveMeridianProjectContextId(projectId, store)) {
    return Response.json({ status: 'error', observedAt, error: 'Unknown Bond.Terminal project or wallet group.', project: projectId }, { status: 404 });
  }

  const context = buildMeridianHubContext(projectId, store);
  const activeProject = context.projects[0] ?? null;

  return Response.json({
    status: 'ok', observedAt, signer: 'browser-wallet+client-mint-keypair', liveTradingEnabled: liveEnabled(),
    contract: 'deployment-engine-v2-shared-context',
    projectContext: activeProject,
    deploymentSnapshot: activeProject ? {
      project: activeProject.project,
      deploymentStatus: activeProject.deployment,
      metadataStatus: activeProject.preflight.find((check) => check.label === 'Metadata') ?? null,
      walletStatus: activeProject.preflight.find((check) => check.label === 'Wallet group') ?? null,
      fundingStatus: activeProject.fundingPlan,
      launchPathStatus: activeProject.preflight.find((check) => check.label === 'Launch path') ?? null,
      launchConfig: activeProject.launchConfig,
      walletPlan: activeProject.launchConfig.walletPlan,
      walletPlanSummary: {
        walletCount: activeProject.launchConfig.walletPlan.length,
        participatingWallets: activeProject.launchConfig.walletPlan.filter((entry) => entry.participate).length,
        plannedBuySol: activeProject.launchConfig.walletPlan.filter((entry) => entry.participate).reduce((sum, entry) => sum + entry.plannedBuySol, 0),
        maxBuySol: activeProject.launchConfig.walletPlan.filter((entry) => entry.participate).reduce((sum, entry) => sum + entry.maxBuySol, 0)
      },
      preflightChecks: activeProject.preflight,
      transactionPlan: { status: liveEnabled() ? 'builder-available-for-token-mint' : 'disabled until live-gated', path: activeProject.project.launchPath, raydiumBurnLiquidity: activeProject.launchConfig.route.burnLiquidity, raydiumLiquiditySol: activeProject.launchConfig.route.raydiumLiquiditySol, note: 'Simulation/preflight only unless LIVE_TRADING_ENABLED and browser-wallet signing are explicitly enabled.' },
      simulationStatus: { status: 'preflight-only', path: activeProject.project.launchPath, walletPlanStatus: activeProject.launchConfig.walletPlan.length ? 'configured' : 'missing-wallet-plan', note: 'No signed deployment or fund movement is performed by GET.' },
      liveReadiness: { status: liveEnabled() ? 'requires browser-wallet signing' : 'disabled until live-gated', requiresExplicitConfirmation: true },
      blockers: activeProject.blockers,
      nextActions: activeProject.nextActions,
      sourceStatus: activeProject.sourceStatus
    } : null,
    engines: {
      tokenMint: { status: liveEnabled() ? 'transaction-builder-ready' : 'live-disabled', method: 'POST {operation:"create-spl-token", payer, mint, decimals, initialSupply, freezeAuthority?}' },
      launchBundle: { status: 'preflight-only', note: 'Bundle execution requires funded wallet set, signing order, and anti-self-trade checks.' },
      createLp: { status: 'protocol-sdk-required', note: 'Raydium/Orca/Meteora LP creation needs protocol-specific builders and pool config; not faked.' }
    },
    execution: liveEnabled() ? 'browser-signing-required' : 'live-disabled-preflight-only'
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as null | { operation?: string; payer?: string; mint?: string; decimals?: number; initialSupply?: number; freezeAuthority?: string | null };
  if (!body?.operation) return Response.json({ error: 'Missing operation.' }, { status: 400 });
  if (body.operation !== 'create-spl-token') return Response.json({ status: 'preflight-only', operation: body.operation, reason: 'Only SPL token mint transaction building is implemented here; LP/bundle routes require protocol-specific builders.', execution: 'builder-not-available' }, { status: 501 });
  if (!liveEnabled()) return Response.json({ status: 'blocked', operation: body.operation, reason: 'LIVE_TRADING_ENABLED is false.', execution: 'live-disabled' }, { status: 403 });
  try {
    const payer = parsePk(body.payer, 'payer');
    const mint = parsePk(body.mint, 'mint');
    const decimals = Number.isInteger(body.decimals) && body.decimals! >= 0 && body.decimals! <= 9 ? body.decimals! : 6;
    const freezeAuthority = body.freezeAuthority ? parsePk(body.freezeAuthority, 'freezeAuthority') : null;
    const amount = checkedAmount(Number(body.initialSupply ?? 0), decimals);
    const rpc = configuredSolanaRpc();
    const connection = new Connection(rpc.url, 'confirmed');
    const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE, 'confirmed');
    const tx = new Transaction();
    tx.feePayer = payer;
    tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
    tx.add(SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: mint, space: MINT_SIZE, lamports, programId: TOKEN_PROGRAM_ID }));
    tx.add(createInitializeMint2Instruction(mint, decimals, payer, freezeAuthority));
    let ownerAta: string | null = null;
    if (amount > 0n) {
      const ata = ataAddress(payer, mint);
      ownerAta = ata.toBase58();
      tx.add(createAssociatedTokenAccountInstruction(payer, ata, payer, mint));
      tx.add(createMintToCheckedInstruction(mint, ata, payer, amount, decimals));
    }
    return Response.json({ status: 'ok', operation: body.operation, signer: 'browser-wallet+client-mint-keypair', requiredSigners: [payer.toBase58(), mint.toBase58()], mint: mint.toBase58(), ownerAta, tokenProgram: TOKEN_PROGRAM_ID.toBase58(), transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'), execution: 'unsigned-transaction-built' });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Deployment build failed.' }, { status: 400 });
  }
}
