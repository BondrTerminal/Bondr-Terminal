import { meridianAuthConfig, meridianSessionStatus } from '../../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  const auth = meridianAuthConfig();
  const session = await meridianSessionStatus();
  const organizationIdConfigured = present('NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID') || present('NEXT_PUBLIC_ORGANIZATION_ID');
  const authProxyConfigIdConfigured = present('NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID') || present('NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID');
  const turnkeyConfigured = organizationIdConfigured && authProxyConfigIdConfigured;

  return Response.json({
    status: 'ok',
    account: {
      configured: turnkeyConfigured,
      clientIdentityAvailable: turnkeyConfigured,
      serverVerifiedProfileStorage: true,
      serverVerification: 'turnkey-session-jwt',
      verificationHelper: 'apps/web/lib/turnkey-session-auth.ts',
      requiredHeader: 'Authorization: Bearer <Turnkey session JWT>',
      durableProfileDatabase: false,
      blocker: 'Turnkey JWT verification is implemented, but profile persistence is process memory only until a durable database is connected.',
      package: '@turnkey/crypto',
      model: 'global-login-client-profile-ready; server profile endpoints require verified Turnkey session JWT; durable storage remains deferred'
    },
    turnkey: {
      organizationIdConfigured,
      authProxyConfigIdConfigured,
      requiredPublicEnv: ['NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID', 'NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID']
    },
    operatorSession: {
      configured: auth.configured,
      authenticated: session.authenticated,
      reason: session.reason,
      cookieName: auth.cookieName
    },
    executionSafety: {
      browserWalletSignerRequired: true,
      simulationRequired: true,
      broadcastEnabled: false,
      deploymentEnabled: false
    }
  }, { headers: { 'cache-control': 'no-store' } });
}
