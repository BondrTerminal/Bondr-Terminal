import { readFileSync } from 'node:fs';
import { getMeridianStorePath, type MeridianStore, type WalletActivity, type WalletGroup } from '../../../lib/meridian-store';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { atomicJsonWrite, mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../lib/mutation-safety';
import { meridianAuthRequiredResponse } from '../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

type GroupPost = { id?: unknown; name?: unknown; scope?: unknown };
type GroupPatch = { walletId?: unknown; groupId?: unknown };
function readStore(): MeridianStore { return JSON.parse(readFileSync(getMeridianStorePath(), 'utf8')) as MeridianStore; }
function clean(value: unknown, fallback = '', max = 120) { return typeof value === 'string' ? value.trim().slice(0, max) : fallback; }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'wallet-group'; }
function activity(walletId: string, type: string, message: string): WalletActivity { return { id: `wact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, walletId, timestamp: new Date().toISOString(), type, status: 'info', message }; }

export async function GET() {
  const store = await getMeridianWalletStore();
  return Response.json({ status: 'ok', walletGroups: store.walletGroups, projects: store.projects.map((project) => ({ id: project.id, name: project.name, walletGroupId: project.walletGroupId })), ...mutationMeta('Wallet groups read only.'), execution: 'read-only-wallet-groups' });
}

export async function POST(request: Request) {
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');
  const body = await request.json().catch(() => null) as GroupPost | null;
  if (!body) return Response.json({ status: 'error', error: 'Invalid JSON body.' }, { status: 400 });
  try {
    const dataPath = getMeridianStorePath();
    const store = readStore();
    const name = clean(body.name, '', 80);
    if (!name) throw new Error('Group name is required.');
    const id = slug(clean(body.id, name, 80));
    if (store.walletGroups.some((group) => group.id === id)) throw new Error('Wallet group id already exists.');
    const scope = body.scope === 'global' ? 'global' : 'project';
    const group: WalletGroup = { id, name, scope, walletIds: [] };
    store.walletGroups.push(group);
    if (mutationMode() === 'local-json') atomicJsonWrite(dataPath, store);
    return Response.json({ status: 'ok', walletGroup: group, ...mutationMeta('Wallet group created locally.'), execution: 'local-record-only' });
  } catch (error) {
    return Response.json({ status: 'error', error: error instanceof Error ? error.message : 'Wallet group create failed.', ...mutationMeta('Wallet group mutation rejected.') }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');
  const body = await request.json().catch(() => null) as GroupPatch | null;
  if (!body) return Response.json({ status: 'error', error: 'Invalid JSON body.' }, { status: 400 });
  try {
    const dataPath = getMeridianStorePath();
    const store = readStore();
    const walletId = clean(body.walletId, '', 100);
    const groupId = clean(body.groupId, '', 100);
    const wallet = store.wallets.find((item) => item.id === walletId);
    const target = store.walletGroups.find((group) => group.id === groupId);
    if (!wallet) throw new Error('Wallet not found.');
    if (!target) throw new Error('Target wallet group not found.');
    const source = store.walletGroups.find((group) => group.id === wallet.groupId);
    if (source) source.walletIds = source.walletIds.filter((id) => id !== wallet.id);
    if (!target.walletIds.includes(wallet.id)) target.walletIds.push(wallet.id);
    wallet.groupId = target.id;
    wallet.scope = target.scope;
    wallet.lastActivityAt = new Date().toISOString();
    store.walletActivity = [activity(wallet.id, 'assigned_group', `Wallet assigned to ${target.name}.`), ...(store.walletActivity ?? [])];
    if (mutationMode() === 'local-json') atomicJsonWrite(dataPath, store);
    return Response.json({ status: 'ok', wallet, walletGroup: target, ...mutationMeta('Wallet group assignment updated locally.'), execution: 'local-record-only' });
  } catch (error) {
    return Response.json({ status: 'error', error: error instanceof Error ? error.message : 'Wallet group update failed.', ...mutationMeta('Wallet group mutation rejected.') }, { status: 400 });
  }
}
