import { z } from 'zod';
import { defaultBondrProfile, sanitizeProfileText, type BondrStoredProfile } from '../../../../lib/bondr-profile';
import { TurnkeySessionAuthError, verifyTurnkeyRequest } from '../../../../lib/turnkey-session-auth';

export const dynamic = 'force-dynamic';

type StoredProfile = BondrStoredProfile;

declare global {
  // eslint-disable-next-line no-var
  var __bondrTurnkeyProfiles: Map<string, StoredProfile> | undefined;
}

const profileSchema = z.object({
  userId: z.string().min(1).max(160).optional(),
  userName: z.string().min(3).max(48).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Use letters, numbers, underscore, or dash.').optional(),
  displayName: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  organizationId: z.string().min(1).max(160).optional(),
  firstAccountAddress: z.string().min(20).max(120).optional(),
  avatarSeed: z.string().min(1).max(40).optional(),
  avatarGradient: z.string().min(8).max(220).optional(),
  bio: z.string().max(160).optional(),
  preferredWalletLabel: z.string().max(80).optional()
}).strict();

function profileStore() {
  globalThis.__bondrTurnkeyProfiles ??= new Map<string, StoredProfile>();
  return globalThis.__bondrTurnkeyProfiles;
}

function authError(error: unknown) {
  if (error instanceof TurnkeySessionAuthError) {
    return Response.json({ status: 'unauthorized', error: error.code, message: error.message }, { status: error.status, headers: { 'cache-control': 'no-store' } });
  }
  return Response.json({ status: 'error', error: 'turnkey-auth-failed' }, { status: 401, headers: { 'cache-control': 'no-store' } });
}

function subjectPayload(session: Awaited<ReturnType<typeof verifyTurnkeyRequest>>) {
  return {
    userId: session.userId,
    organizationId: session.organizationId,
    sessionType: session.sessionType,
    publicKey: session.publicKey,
    expiry: session.expiry
  };
}

function responsePayload(profile: StoredProfile, session: Awaited<ReturnType<typeof verifyTurnkeyRequest>>, extra: Record<string, unknown> = {}) {
  return Response.json({
    status: 'ok',
    verified: true,
    profile,
    subject: subjectPayload(session),
    storage: 'memory',
    storageDurability: 'ephemeral-server-instance',
    durableProfileDatabase: false,
    note: 'Turnkey JWT is verified. Profile persistence is process memory only until a durable database is connected.',
    ...extra
  }, { headers: { 'cache-control': 'no-store' } });
}

function getOrCreateProfile(session: Awaited<ReturnType<typeof verifyTurnkeyRequest>>, seed: Partial<StoredProfile> = {}) {
  const store = profileStore();
  const existing = store.get(session.userId);
  const now = new Date().toISOString();

  if (existing) {
    const updated: StoredProfile = {
      ...existing,
      ...(seed.email ? { email: seed.email } : {}),
      ...(seed.firstAccountAddress ? { firstAccountAddress: seed.firstAccountAddress } : {}),
      lastSeenAt: now
    };
    store.set(session.userId, updated);
    return { profile: updated, created: false };
  }

  const created = defaultBondrProfile({
    userId: session.userId,
    organizationId: session.organizationId,
    email: seed.email,
    firstAccountAddress: seed.firstAccountAddress,
    now
  });
  store.set(session.userId, created);
  return { profile: created, created: true };
}

export async function GET(request: Request) {
  let session;
  try {
    session = await verifyTurnkeyRequest(request);
  } catch (error) {
    return authError(error);
  }

  const { profile, created } = getOrCreateProfile(session);
  return responsePayload(profile, session, { created });
}

export async function POST(request: Request) {
  let session;
  try {
    session = await verifyTurnkeyRequest(request);
  } catch (error) {
    return authError(error);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: 'error', error: 'invalid-json' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ status: 'error', error: 'invalid-profile-payload', issues: parsed.error.issues }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  if (parsed.data.userId && parsed.data.userId !== session.userId) {
    return Response.json({ status: 'forbidden', error: 'user-id-mismatch' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  }
  if (parsed.data.organizationId && parsed.data.organizationId !== session.organizationId) {
    return Response.json({ status: 'forbidden', error: 'organization-id-mismatch' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  }

  const { profile: base, created } = getOrCreateProfile(session, {
    ...(parsed.data.email ? { email: parsed.data.email } : {}),
    ...(parsed.data.firstAccountAddress ? { firstAccountAddress: parsed.data.firstAccountAddress } : {})
  });
  const now = new Date().toISOString();
  const profile: StoredProfile = {
    ...base,
    ...(parsed.data.userName ? { userName: sanitizeProfileText(parsed.data.userName, base.userName) } : {}),
    ...(parsed.data.displayName ? { displayName: sanitizeProfileText(parsed.data.displayName, base.displayName) } : {}),
    ...(parsed.data.email ? { email: parsed.data.email } : {}),
    ...(parsed.data.firstAccountAddress ? { firstAccountAddress: parsed.data.firstAccountAddress } : {}),
    ...(parsed.data.avatarSeed ? { avatarSeed: sanitizeProfileText(parsed.data.avatarSeed, base.avatarSeed) } : {}),
    ...(parsed.data.avatarGradient ? { avatarGradient: sanitizeProfileText(parsed.data.avatarGradient, base.avatarGradient) } : {}),
    ...(typeof parsed.data.bio === 'string' ? { bio: sanitizeProfileText(parsed.data.bio) } : {}),
    ...(typeof parsed.data.preferredWalletLabel === 'string' ? { preferredWalletLabel: sanitizeProfileText(parsed.data.preferredWalletLabel) } : {}),
    updatedAt: now,
    lastSeenAt: now
  };
  profileStore().set(session.userId, profile);

  return responsePayload(profile, session, { created, stored: true });
}
