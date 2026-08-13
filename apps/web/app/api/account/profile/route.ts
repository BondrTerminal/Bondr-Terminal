import { z } from 'zod';

export const dynamic = 'force-dynamic';

const profileSchema = z.object({
  userId: z.string().min(1).max(160).optional(),
  userName: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  organizationId: z.string().min(1).max(160).optional(),
  firstAccountAddress: z.string().min(20).max(120).optional()
}).strict();

export async function GET() {
  return Response.json({
    status: 'not-configured',
    profile: null,
    storage: 'disabled',
    reason: 'Server-side Turnkey profile storage requires verified Turnkey session JWT auth and is intentionally not enabled yet.',
    safeClientModel: 'The browser can display Turnkey identity state through the React wallet kit, but the server will not persist it until verification is implemented.'
  }, { status: 501, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: 'error', error: 'invalid-json' }, { status: 400 });
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ status: 'error', error: 'invalid-profile-payload', issues: parsed.error.issues }, { status: 400 });
  }
  return Response.json({
    status: 'not-configured',
    stored: false,
    reason: 'Refusing to persist account profile without verified Turnkey session JWT auth.',
    acceptedShapeOnly: true
  }, { status: 501, headers: { 'cache-control': 'no-store' } });
}
