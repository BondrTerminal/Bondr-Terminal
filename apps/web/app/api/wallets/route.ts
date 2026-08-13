import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../lib/meridian-context';
import { getMeridianStorePath, type MeridianStore, type Wallet, type WalletActivity } from '../../../lib/meridian-store';
import { getMeridianWalletStore, insertDurableWallet, updateDurableWallet, walletStoreMode } from '../../../lib/durable-wallet-store';
import { atomicJsonWrite, mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../lib/mutation-safety';
import { meridianAuthRequiredResponse } from '../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

type WalletPost = { address?: unknown; role?: unknown; groupId?: unknown; purpose?: unknown; status?: unknown };
type WalletPatch = { walletId?: unknown; role?: unknown; purpose?: unknown; status?: unknown; groupId?: unknown; archived?: unknown; archiveReason?: unknown };

function readStore(): MeridianStore { return JSON.parse(readFileSync(getMeridianStorePath(), 'utf8')) as MeridianStore; }
function persistenceMeta(note: string) {
  const mode = walletStoreMode();
  return { ...mutationMeta(note), mutationMode: mode, persisted: mode === 'postgres' || mode === 'local-json' };
}
function now() { return new Date().toISOString(); }
function clean(value: unknown, fallback = '', max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : fallback; }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'wallet'; }
function activity(walletId: string, type: string, message: string, status: WalletActivity['status'] = 'info'): WalletActivity {
  return { id: `wact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, walletId, timestamp: now(), type, status, message };
}
function looksSecretLike(value: string) {
  const trimmed = value.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 12 && words.length <= 24 && words.every((word) => /^[a-z]+$/i.test(word))) return true;
  if (/^\s*\[\s*\d{1,3}(\s*,\s*\d{1,3}){30,}\s*\]\s*$/.test(trimmed)) return true;
  if (/"secretKey"|"privateKey"|"seed"|"mnemonic"/i.test(trimmed)) return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{80,}$/.test(trimmed)) return true;
  return false;
}
function validatePublicAddress(value: unknown) {
  const address = clean(value, '', 120);
  if (!address) throw new Error('Public address is required.');
  if (looksSecretLike(address)) throw new Error('Private-key/seed-like input rejected. Use a public Solana address only.');
  const pubkey = new PublicKey(address);
  return pubkey.toBase58();
}
function nextWalletId(store: MeridianStore, role: string) {
  const base = slug(role);
  let candidate = base;
  let index = 1;
  while (store.wallets.some((wallet) => wallet.id === candidate)) candidate = `${base}-${String(index++).padStart(2, '0')}`;
  return candidate;
}
function moveWalletGroup(store: MeridianStore, wallet: Wallet, nextGroupId: string) {
  if (wallet.groupId === nextGroupId) return;
  const nextGroup = store.walletGroups.find((group) => group.id === nextGroupId);
  if (!nextGroup) throw new Error('Target wallet group does not exist.');
  const oldGroup = store.walletGroups.find((group) => group.id === wallet.groupId);
  if (oldGroup) oldGroup.walletIds = oldGroup.walletIds.filter((id) => id !== wallet.id);
  if (!nextGroup.walletIds.includes(wallet.id)) nextGroup.walletIds.push(wallet.id);
  wallet.groupId = nextGroupId;
  wallet.scope = nextGroup.scope;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectParam = url.searchParams.get('project');
  const groupParam = url.searchParams.get('group');
  const store = await getMeridianWalletStore();
  const project = projectParam ? resolveMeridianProjectContextId(projectParam, store) : undefined;
  const groupId = groupParam ?? project?.walletGroupId ?? null;
  const wallets = groupId ? store.wallets.filter((wallet) => wallet.groupId === groupId) : store.wallets;
  return Response.json({
    status: 'ok',
    project: project ?? null,
    groupId,
    wallets,
    walletGroups: store.walletGroups,
    walletActivity: store.walletActivity ?? [],
    hubContext: buildMeridianHubContext(project?.id ?? null, store),
    ...persistenceMeta('Wallet list read only.'),
    execution: 'read-only-wallet-records'
  });
}

export async function POST(request: Request) {
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');
  const body = await request.json().catch(() => null) as WalletPost | null;
  if (!body) return Response.json({ status: 'error', error: 'Invalid JSON body.' }, { status: 400 });
  try {
    const dataPath = getMeridianStorePath();
    const store = await getMeridianWalletStore();
    const address = validatePublicAddress(body.address);
    const existingWallet = store.wallets.find((wallet) => wallet.address === address && !wallet.archived);
    if (existingWallet) {
      return Response.json({
        status: 'ok',
        wallet: existingWallet,
        walletGroups: store.walletGroups,
        alreadyExisted: true,
        ...persistenceMeta('Watch-only wallet already exists; selected existing public-address record. No key material stored.'),
        execution: 'local-record-only-no-key-custody'
      });
    }
    const groupId = clean(body.groupId, '', 80);
    const group = store.walletGroups.find((item) => item.id === groupId);
    if (!group) throw new Error('Wallet group does not exist.');
    const role = clean(body.role, 'watch-only wallet', 80);
    const wallet: Wallet = {
      id: nextWalletId(store, role),
      role,
      address,
      scope: group.scope,
      groupId,
      status: clean(body.status, 'active', 40) || 'active',
      balanceSol: 0,
      purpose: clean(body.purpose, 'Watch-only wallet record imported through Wallet Ops.', 240),
      custodyMode: 'watch-only',
      createdAt: now(),
      lastActivityAt: now()
    };
    store.wallets.push(wallet);
    if (!group.walletIds.includes(wallet.id)) group.walletIds.push(wallet.id);
    const entry = activity(wallet.id, 'imported', `Watch-only wallet ${wallet.role} added to ${group.name}.`);
    store.walletActivity = [entry, ...(store.walletActivity ?? [])];
    const durable = await insertDurableWallet(wallet, group, entry);
    if (mutationMode() === 'local-json') atomicJsonWrite(dataPath, store);
    return Response.json({ status: 'ok', wallet, walletGroups: store.walletGroups, ...persistenceMeta(durable ? 'Watch-only wallet record persisted to durable store. No key material stored.' : 'Watch-only wallet record persisted. No key material stored.'), execution: 'local-record-only-no-key-custody' });
  } catch (error) {
    return Response.json({ status: 'error', error: error instanceof Error ? error.message : 'Wallet create/import failed.', ...mutationMeta('Wallet mutation rejected.') }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');
  const body = await request.json().catch(() => null) as WalletPatch | null;
  if (!body) return Response.json({ status: 'error', error: 'Invalid JSON body.' }, { status: 400 });
  try {
    const dataPath = getMeridianStorePath();
    const store = await getMeridianWalletStore();
    const walletId = clean(body.walletId, '', 100);
    const wallet = store.wallets.find((item) => item.id === walletId);
    if (!wallet) throw new Error('Wallet not found.');
    const events: WalletActivity[] = [];
    if (typeof body.role === 'string') wallet.role = clean(body.role, wallet.role, 80);
    if (typeof body.purpose === 'string') wallet.purpose = clean(body.purpose, wallet.purpose, 240);
    if (typeof body.status === 'string') wallet.status = clean(body.status, wallet.status, 40);
    if (typeof body.groupId === 'string' && body.groupId !== wallet.groupId) { moveWalletGroup(store, wallet, clean(body.groupId, wallet.groupId, 80)); events.push(activity(wallet.id, 'assigned_group', `Wallet assigned to ${wallet.groupId}.`)); }
    if (typeof body.archived === 'boolean') {
      wallet.archived = body.archived;
      if (body.archived) { wallet.archivedAt = now(); wallet.archiveReason = clean(body.archiveReason, 'Archived from Wallet Ops.', 180); events.push(activity(wallet.id, 'archived', wallet.archiveReason, 'warn')); }
      else { delete wallet.archivedAt; delete wallet.archiveReason; events.push(activity(wallet.id, 'restored', 'Wallet restored to active Wallet Ops board.')); }
    }
    wallet.lastActivityAt = now();
    events.push(activity(wallet.id, 'updated', 'Wallet metadata updated through Wallet Ops.'));
    store.walletActivity = [...events, ...(store.walletActivity ?? [])];
    await updateDurableWallet(wallet, store.walletGroups, events);
    if (mutationMode() === 'local-json') atomicJsonWrite(dataPath, store);
    return Response.json({ status: 'ok', wallet, walletGroups: store.walletGroups, ...persistenceMeta('Wallet record persisted. No key material touched.'), execution: 'local-record-only-no-signing' });
  } catch (error) {
    return Response.json({ status: 'error', error: error instanceof Error ? error.message : 'Wallet update failed.', ...mutationMeta('Wallet mutation rejected.') }, { status: 400 });
  }
}

export async function DELETE() {
  return Response.json({
    status: 'error',
    error: 'DELETE is intentionally disabled for wallet records. Use PATCH with archived=true for reversible archive/restore semantics.',
    ...mutationMeta('Wallet DELETE rejected; no wallet record or key material touched.'),
    execution: 'delete-disabled-use-patch-archive'
  }, { status: 405 });
}
