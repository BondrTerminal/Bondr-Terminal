import { runGmgnReadOnly, type GmgnReadOnlyCommand } from '../../../../lib/gmgn';

export const dynamic = 'force-dynamic';

const ALLOWED_COMMANDS = new Set<GmgnReadOnlyCommand>([
  'token-info',
  'token-security',
  'token-pool',
  'token-holders',
  'token-traders',
  'market-trending',
  'hot-searches'
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const command = url.searchParams.get('command') as GmgnReadOnlyCommand | null;
  if (!command || !ALLOWED_COMMANDS.has(command)) {
    return Response.json({
      status: 'error',
      observedAt: new Date().toISOString(),
      error: 'Unsupported GMGN command. Only read-only token/market commands are enabled.',
      allowedCommands: Array.from(ALLOWED_COMMANDS),
      execution: 'read-only-cli-adapter-no-swap-no-cooking',
      liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === 'true'
    }, { status: 400 });
  }

  const result = await runGmgnReadOnly(command, {
    chain: url.searchParams.get('chain'),
    address: url.searchParams.get('address'),
    interval: url.searchParams.get('interval'),
    limit: Number(url.searchParams.get('limit') ?? '') || null
  });

  return Response.json({
    observedAt: new Date().toISOString(),
    source: 'gmgn-query',
    command,
    chain: url.searchParams.get('chain') ?? 'sol',
    execution: 'read-only-cli-adapter-no-swap-no-cooking',
    liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === 'true',
    secretsExposed: false,
    ...result
  }, { status: result.status === 'error' ? 400 : 200 });
}
