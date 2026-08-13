import { z } from 'zod';
import { sanitizeProfileText, type BondrStoredProfile } from '../../../../lib/bondr-profile';
import { loadOrCreateBondrProfile, saveBondrProfile } from '../../../../lib/bondr-profile-store';
import { TurnkeySessionAuthError, verifyTurnkeyRequest } from '../../../../lib/turnkey-session-auth';

export const dynamic = 'force-dynamic';

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

function responsePayload(input: {
  profile: BondrStoredProfile;
  session: Awaited<ReturnType<typeof verifyTurnkeyRequest>>;
  created?: boolean;
  stored?: boolean;
  storage: string;
  storageDurability: string;
  durableProfileDatabase: boolean;
  note: string;
}) {
  return Response.json({
    status: 'ok',
    verified: true,
    profile: input.profile,
    subject: subjectPayload(input.session),
    created: input.created ?? false,
    stored: input.stored ?? false,
    storage: input.storage,
    storageDurability: input.storageDurability,
    durableProfileDatabase: input.durableProfileDatabase,
    note: input.note
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: Request) {
  let session;
  try {
    session = await verifyTurnkeyRequest(request);
  } catch (error) {
    return authError(error);
  }

  const loaded = await loadOrCreateBondrProfile({ userId: session.userId, organizationId: session.organizationId });
  return responsePayload({ ...loaded, session });
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

  const loaded = await loadOrCreateBondrProfile({
    userId: session.userId,
    organizationId: session.organizationId,
    ...(parsed.data.email ? { email: parsed.data.email } : {}),
    ...(parsed.data.firstAccountAddress ? { firstAccountAddress: parsed.data.firstAccountAddress } : {})
  });

  const profile: BondrStoredProfile = {
    ...loaded.profile,
    ...(parsed.data.userName ? { userName: sanitizeProfileText(parsed.data.userName, loaded.profile.userName) } : {}),
    ...(parsed.data.displayName ? { displayName: sanitizeProfileText(parsed.data.displayName, loaded.profile.displayName) } : {}),
    ...(parsed.data.email ? { email: parsed.data.email } : {}),
    ...(parsed.data.firstAccountAddress ? { firstAccountAddress: parsed.data.firstAccountAddress } : {}),
    ...(parsed.data.avatarSeed ? { avatarSeed: sanitizeProfileText(parsed.data.avatarSeed, loaded.profile.avatarSeed) } : {}),
    ...(parsed.data.avatarGradient ? { avatarGradient: sanitizeProfileText(parsed.data.avatarGradient, loaded.profile.avatarGradient) } : {}),
    ...(typeof parsed.data.bio === 'string' ? { bio: sanitizeProfileText(parsed.data.bio) } : {}),
    ...(typeof parsed.data.preferredWalletLabel === 'string' ? { preferredWalletLabel: sanitizeProfileText(parsed.data.preferredWalletLabel) } : {})
  };

  const saved = await saveBondrProfile(profile);
  return responsePayload({ ...saved, session, created: loaded.created, stored: true });
}
