import { z } from 'zod';
import { TurnkeySessionAuthError, verifyTurnkeyRequest } from '../../../../lib/turnkey-session-auth';

export const dynamic = 'force-dynamic';

type StoredProfile = {
  userId: string;
  userName?: string;
  email?: string;
  organizationId: string;
  firstAccountAddress?: string;
  updatedAt: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __bondrTurnkeyProfiles: Map<string, StoredProfile> | undefined;
}

const profileSchema = z.object({
  userId: z.string().min(1).max(160).optional(),
  userName: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  organizationId: z.string().min(1).max(160).optional(),
  firstAccountAddress: z.string().min(20).max(120).optional()
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

export async function GET(request: Request) {
  let session;
  try {
    session = await verifyTurnkeyRequest(request);
  } catch (error) {
    return authError(error);
  }

  const profile = profileStore().get(session.userId) ?? null;
  return Response.json({
    status: 'ok',
    verified: true,
    profile,
    subject: {
      userId: session.userId,
      organizationId: session.organizationId,
      sessionType: session.sessionType,
      publicKey: session.publicKey,
      expiry: session.expiry
    },
    storage: 'memory',
    storageDurability: 'ephemeral-server-instance',
    note: 'Turnkey JWT is verified. Profile persistence is process memory only until a durable database is connected.'
  }, { headers: { 'cache-control': 'no-store' } });
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

  const profile: StoredProfile = {
    userId: session.userId,
    organizationId: session.organizationId,
    ...(parsed.data.userName ? { userName: parsed.data.userName } : {}),
    ...(parsed.data.email ? { email: parsed.data.email } : {}),
    ...(parsed.data.firstAccountAddress ? { firstAccountAddress: parsed.data.firstAccountAddress } : {}),
    updatedAt: new Date().toISOString()
  };
  profileStore().set(session.userId, profile);

  return Response.json({
    status: 'ok',
    verified: true,
    stored: true,
    profile,
    storage: 'memory',
    storageDurability: 'ephemeral-server-instance',
    note: 'Profile write accepted only after Turnkey JWT verification. Move this store to Postgres or another durable DB before relying on cross-deploy persistence.'
  }, { headers: { 'cache-control': 'no-store' } });
}
