import { bondrProfileStorageMetadata } from '../../../../lib/bondr-profile-store';
import { meridianAuthConfig, meridianSessionStatus } from '../../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  const auth = meridianAuthConfig();
  const session = await meridianSessionStatus();
  const profileStorage = bondrProfileStorageMetadata();
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
      externalWalletAuth: 'enabled-in-client-config',
      externalWalletAuthModel: 'wallet-auth-proves-identity-only; transaction signing remains explicit browser review',
      durableProfileDatabase: profileStorage.durableProfileDatabase,
      profileStorage,
      blocker: profileStorage.durableProfileDatabase ? null : 'DATABASE_URL is not configured; profile persistence is process memory only.',
      package: '@turnkey/crypto',
      model: profileStorage.durableProfileDatabase
        ? 'global-login-client-profile-ready; server profile endpoints require verified Turnkey session JWT; profiles persist in Neon/Postgres'
        : 'global-login-client-profile-ready; server profile endpoints require verified Turnkey session JWT; durable storage unavailable'
    },
    turnkey: {
      organizationIdConfigured,
      authProxyConfigIdConfigured,
      walletAuthEnabledInClient: true,
      walletAuthChains: ['solana'],
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
