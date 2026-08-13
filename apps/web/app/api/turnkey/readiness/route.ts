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
    turnkey: {
      configured: turnkeyConfigured,
      organizationIdConfigured,
      authProxyConfigIdConfigured,
      requiredPublicEnv: ['NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID', 'NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID'],
      aliases: ['NEXT_PUBLIC_ORGANIZATION_ID', 'NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID']
    },
    operatorSession: {
      configured: auth.configured,
      authenticated: session.authenticated,
      reason: session.reason,
      cookieName: auth.cookieName,
      requiredServerEnv: auth.requiredEnv
    },
    execution: 'turnkey-readiness-no-secret-values'
  }, { headers: { 'cache-control': 'no-store' } });
}
