import { verifySessionJwtSignature } from '@turnkey/crypto';

export type VerifiedTurnkeySession = {
  sessionType: string;
  userId: string;
  organizationId: string;
  expiry: number;
  publicKey: string;
  jwt: string;
};

export class TurnkeySessionAuthError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 401) {
    super(message);
    this.name = 'TurnkeySessionAuthError';
    this.code = code;
    this.status = status;
  }
}

function decodeBase64UrlJson(segment: string): unknown {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function decodeSessionJwt(token: string): Omit<VerifiedTurnkeySession, 'jwt'> {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw new TurnkeySessionAuthError('invalid-jwt-shape', 'Invalid JWT: missing payload');
  }

  const decoded = decodeBase64UrlJson(parts[1]);
  if (!decoded || typeof decoded !== 'object') {
    throw new TurnkeySessionAuthError('invalid-jwt-payload', 'Invalid JWT: payload is not an object');
  }

  const payload = decoded as Record<string, unknown>;
  const expiry = payload.exp;
  const publicKey = payload.public_key;
  const sessionType = payload.session_type;
  const userId = payload.user_id;
  const organizationId = payload.organization_id;

  if (typeof expiry !== 'number' || !Number.isFinite(expiry)) {
    throw new TurnkeySessionAuthError('missing-expiry', 'JWT payload missing required exp field');
  }
  if (typeof publicKey !== 'string' || !publicKey) {
    throw new TurnkeySessionAuthError('missing-public-key', 'JWT payload missing required public_key field');
  }
  if (typeof sessionType !== 'string' || !sessionType) {
    throw new TurnkeySessionAuthError('missing-session-type', 'JWT payload missing required session_type field');
  }
  if (typeof userId !== 'string' || !userId) {
    throw new TurnkeySessionAuthError('missing-user-id', 'JWT payload missing required user_id field');
  }
  if (typeof organizationId !== 'string' || !organizationId) {
    throw new TurnkeySessionAuthError('missing-organization-id', 'JWT payload missing required organization_id field');
  }

  return { sessionType, userId, organizationId, expiry, publicKey };
}

export async function verifyTurnkeySessionJwt(token: string | null): Promise<VerifiedTurnkeySession> {
  if (!token) {
    throw new TurnkeySessionAuthError('missing-bearer-token', 'Missing Authorization: Bearer <Turnkey session JWT> header');
  }

  const signatureValid = await verifySessionJwtSignature(token);
  if (!signatureValid) {
    throw new TurnkeySessionAuthError('invalid-signature', 'Invalid JWT: failed Turnkey signature verification');
  }

  const decoded = decodeSessionJwt(token);
  if (decoded.expiry * 1000 < Date.now()) {
    throw new TurnkeySessionAuthError('expired-jwt', 'Turnkey session JWT has expired');
  }

  return { ...decoded, jwt: token };
}

export async function verifyTurnkeyRequest(request: Request): Promise<VerifiedTurnkeySession> {
  return verifyTurnkeySessionJwt(getBearerToken(request));
}
