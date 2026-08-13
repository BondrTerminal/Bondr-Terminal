import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { ensureServerEnvLoaded } from './server-env';

ensureServerEnvLoaded();

export const MERIDIAN_SESSION_COOKIE = 'meridian_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

type SessionPayload = { issuedAt: number; nonce: string };

function cleanEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : '';
}

export function meridianAuthConfig() {
  const sessionSecret = cleanEnv('MERIDIAN_SESSION_SECRET') || cleanEnv('OPERATOR_SESSION_SECRET');
  const operatorKey = cleanEnv('MERIDIAN_OPERATOR_KEY') || cleanEnv('TERMINAL_OPERATOR_TOKEN');
  return {
    configured: Boolean(sessionSecret && operatorKey),
    sessionSecretConfigured: Boolean(sessionSecret),
    operatorKeyConfigured: Boolean(operatorKey),
    cookieName: MERIDIAN_SESSION_COOKIE,
    maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
    requiredEnv: ['MERIDIAN_SESSION_SECRET', 'MERIDIAN_OPERATOR_KEY']
  };
}

function secret() { return cleanEnv('MERIDIAN_SESSION_SECRET') || cleanEnv('OPERATOR_SESSION_SECRET'); }
function operatorKey() { return cleanEnv('MERIDIAN_OPERATOR_KEY') || cleanEnv('TERMINAL_OPERATOR_TOKEN'); }
function base64url(value: Buffer | string) { return Buffer.from(value).toString('base64url'); }
function sign(payload: string) { return createHmac('sha256', secret()).update(payload).digest('base64url'); }
function constantEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyOperatorKey(candidate: unknown) {
  const expected = operatorKey();
  const value = typeof candidate === 'string' ? candidate : '';
  return Boolean(expected && value && constantEqual(value, expected));
}

export function createMeridianSessionToken() {
  if (!meridianAuthConfig().configured) throw new Error('Meridian session auth is not configured.');
  const payload: SessionPayload = { issuedAt: Date.now(), nonce: randomBytes(16).toString('base64url') };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyMeridianSessionToken(token: string | undefined | null) {
  if (!meridianAuthConfig().configured) return { configured: false, authenticated: false, reason: 'auth-not-configured' };
  if (!token) return { configured: true, authenticated: false, reason: 'missing-session' };
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !constantEqual(signature, sign(payload))) return { configured: true, authenticated: false, reason: 'invalid-session' };
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.issuedAt || Date.now() - parsed.issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return { configured: true, authenticated: false, reason: 'expired-session' };
    return { configured: true, authenticated: true, reason: 'session-valid' };
  } catch {
    return { configured: true, authenticated: false, reason: 'invalid-session-payload' };
  }
}

export async function meridianSessionStatus() {
  const jar = await cookies();
  return verifyMeridianSessionToken(jar.get(MERIDIAN_SESSION_COOKIE)?.value);
}

export async function meridianRequestAuthenticated(request: Request) {
  const headerToken = request.headers.get('x-meridian-session-key');
  if (headerToken && verifyOperatorKey(headerToken)) return { configured: meridianAuthConfig().configured, authenticated: true, reason: 'operator-key-header' };
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieValue = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${MERIDIAN_SESSION_COOKIE}=`))?.slice(MERIDIAN_SESSION_COOKIE.length + 1);
  return verifyMeridianSessionToken(cookieValue ? decodeURIComponent(cookieValue) : null);
}

function authRequiredByRuntime() {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' || process.env.LIVE_TRADING_ENABLED === 'true';
}

export async function meridianAuthRequiredResponse(request: Request) {
  const status = await meridianRequestAuthenticated(request);
  if (!status.configured) {
    if (!authRequiredByRuntime()) return null;
    return Response.json({ status: 'error', error: 'Meridian operator auth must be configured before production or live-mode mutations are allowed.', auth: { configured: false, authenticated: false, reason: status.reason, requiredEnv: meridianAuthConfig().requiredEnv }, execution: 'blocked-by-missing-meridian-auth-config' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  if (status.authenticated) return null;
  return Response.json({ status: 'error', error: 'Meridian operator session required.', auth: { configured: true, authenticated: false, reason: status.reason }, execution: 'blocked-by-meridian-session-gate' }, { status: 401, headers: { 'cache-control': 'no-store' } });
}
