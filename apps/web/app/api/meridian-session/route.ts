import { cookies } from 'next/headers';
import { createMeridianSessionToken, MERIDIAN_SESSION_COOKIE, meridianAuthConfig, meridianSessionStatus, verifyOperatorKey } from '../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = meridianAuthConfig();
  const session = await meridianSessionStatus();
  return Response.json({ status: 'ok', auth: { configured: auth.configured, sessionSecretConfigured: auth.sessionSecretConfigured, operatorKeyConfigured: auth.operatorKeyConfigured, authenticated: session.authenticated, reason: session.reason, cookieName: auth.cookieName, requiredEnv: auth.requiredEnv }, execution: 'session-status-no-secret' }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = meridianAuthConfig();
  if (!auth.configured) return Response.json({ status: 'error', error: 'Bond.Terminal session auth is not configured. Set MERIDIAN_SESSION_SECRET and MERIDIAN_OPERATOR_KEY.', auth: { configured: false, requiredEnv: auth.requiredEnv }, execution: 'auth-not-configured' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  const body = await request.json().catch(() => null) as { sessionKey?: unknown } | null;
  if (!verifyOperatorKey(body?.sessionKey)) return Response.json({ status: 'error', error: 'Invalid Bond.Terminal session key.', auth: { configured: true, authenticated: false }, execution: 'login-rejected' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  const token = createMeridianSessionToken();
  const jar = await cookies();
  jar.set(MERIDIAN_SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: auth.maxAgeSeconds });
  return Response.json({ status: 'ok', auth: { configured: true, authenticated: true, cookieName: auth.cookieName, maxAgeSeconds: auth.maxAgeSeconds }, execution: 'session-cookie-issued' }, { headers: { 'cache-control': 'no-store' } });
}

export async function DELETE() {
  const jar = await cookies();
  jar.set(MERIDIAN_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return Response.json({ status: 'ok', auth: { authenticated: false }, execution: 'session-cleared' }, { headers: { 'cache-control': 'no-store' } });
}
