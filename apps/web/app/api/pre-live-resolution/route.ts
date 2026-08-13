import { buildProviderReadiness } from '../../../lib/provider-readiness';
import { getSolanaRpcHealth } from '../../../lib/rpc-health';
import { buildPreLiveChecklist } from '../../../lib/pre-live-checklist';
import { walletLiveReadiness } from '../../../lib/meridian-live-readiness';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { meridianRequestAuthenticated } from '../../../lib/meridian-auth';
import { liveStoreMetadata } from '../../../lib/live-store';

export const dynamic = 'force-dynamic';

type ResolutionBucket = {
  id: string;
  label: string;
  owner: string;
  status: 'pass' | 'warn' | 'fail' | 'known-capacity' | 'intentional-live-gate';
  resolution: string;
  needs?: string[];
};

async function optionalJson(origin: string, path: string) {
  try {
    const response = await fetch(`${origin}${path}`, { cache: 'no-store', headers: { accept: 'application/json' } });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, httpStatus: response.status, body };
  } catch (error) {
    return { ok: false, httpStatus: null, body: null, error: error instanceof Error ? error.message : 'request failed' };
  }
}

function bucketFromChecklist(item: { id: string; label: string; status: 'pass' | 'warn' | 'fail'; owner: string }): ResolutionBucket {
  if (item.id === 'session-authenticated') return {
    id: item.id,
    label: item.label,
    owner: item.owner,
    status: item.status === 'pass' ? 'pass' : 'warn',
    resolution: item.status === 'pass' ? 'Operator session is active.' : 'Operator must log in from the browser/session being used for activation review.',
    needs: item.status === 'pass' ? [] : ['Operator login using configured Meridian operator key']
  };
  if (item.id === 'rpc-health') return {
    id: item.id,
    label: item.label,
    owner: item.owner,
    status: item.status === 'pass' ? 'pass' : 'known-capacity',
    resolution: item.status === 'pass' ? 'RPC passed live health threshold.' : 'Known provider capacity item; upgrade Helius usage/subscription or add another dedicated RPC before real go-live.',
    needs: item.status === 'pass' ? [] : ['Helius usage/subscription upgrade or alternate dedicated RPC', 'Re-run RPC latest-blockhash/slot probes']
  };
  return {
    id: item.id,
    label: item.label,
    owner: item.owner,
    status: item.status,
    resolution: item.status === 'pass' ? 'Already resolved.' : item.status === 'warn' ? 'Needs operator review but is not a hard code blocker.' : 'Must be fixed before live activation.'
  };
}

export async function GET(request: Request) {
  const observedAt = new Date().toISOString();
  const origin = new URL(request.url).origin;
  const store = await getMeridianWalletStore();
  const selectedProject = store.projects[0] ?? null;
  const rpc = await getSolanaRpcHealth();
  const session = await meridianRequestAuthenticated(request);
  const checklist = buildPreLiveChecklist({ project: selectedProject, wallets: store.wallets, rpc, auth: session });
  const walletReadiness = walletLiveReadiness({ rpc, wallets: store.wallets });
  const providerReadiness = await buildProviderReadiness();
  const liveStore = liveStoreMetadata('Pre-live resolution matrix inspected live-store metadata; no mutation performed.');
  const [portfolio, fills, timeseries, terminalLive] = await Promise.all([
    optionalJson(origin, '/api/portfolio'),
    optionalJson(origin, '/api/portfolio/fills'),
    optionalJson(origin, '/api/portfolio/timeseries'),
    optionalJson(origin, '/api/terminal/live-readiness')
  ]);

  const resolved = checklist.items.filter((item) => item.status === 'pass').map(bucketFromChecklist);
  const operatorActionRequired: ResolutionBucket[] = checklist.items.filter((item) => item.id === 'session-authenticated' && item.status !== 'pass').map(bucketFromChecklist);
  const externalProviderRequired: ResolutionBucket[] = [
    ...checklist.items.filter((item) => item.id === 'rpc-health' && item.status !== 'pass').map(bucketFromChecklist),
    ...(providerReadiness.historyAndPnlConfidence.status === 'provider-assisted' ? [] : [{
      id: 'provider-backed-pnl',
      label: 'Provider-backed wallet history / PnL',
      owner: 'portfolio',
      status: 'known-capacity' as const,
      resolution: 'Keep PnL modeled/estimated until Helius or Birdeye history probes pass with real wallet transaction history.',
      needs: ['Passing Helius/Birdeye history provider capacity', 'Real wallet transaction history']
    }]),
    ...providerReadiness.optionalProviderGaps.filter((gap) => gap.toLowerCase().includes('bitquery')).map((gap) => ({
      id: 'bitquery-optional',
      label: 'Optional Bitquery bundle/same-block enrichment',
      owner: 'providers',
      status: 'known-capacity' as const,
      resolution: gap,
      needs: ['BITQUERY_API_KEY if deep bundle/same-block clustering is required']
    }))
  ];
  const fixableInCode: ResolutionBucket[] = liveStore.authConfigured ? [] : [{
    id: 'live-store-auth-metadata',
    label: 'Live-store operator auth metadata',
    owner: 'terminal',
    status: 'warn',
    resolution: 'Align live-store readiness metadata with Bond.Terminal auth configuration; do not bypass auth checks.',
    needs: ['Code patch only']
  }];
  const intentionallyDisabledUntilLive: ResolutionBucket[] = [
    {
      id: 'live-trading-disabled',
      label: 'Live trading gate',
      owner: 'safety',
      status: 'intentional-live-gate',
      resolution: 'Keep LIVE_TRADING_ENABLED=false until explicit activation ceremony.',
      needs: ['Explicit final live activation confirmation after all gates pass']
    },
    {
      id: 'browser-wallet-signer-staging',
      label: 'Browser-wallet signer staging verification',
      owner: 'terminal',
      status: 'intentional-live-gate',
      resolution: 'Requires real browser wallet signer-match dry-run with an unfunded/dev wallet; no server-side key signing.',
      needs: ['Operator-controlled browser wallet', 'Unfunded/dev wallet staging ceremony']
    },
    {
      id: 'bundle-relay-disabled',
      label: 'Bundle/Jito relay submission',
      owner: 'liquidity',
      status: 'intentional-live-gate',
      resolution: 'Relay remains unavailable until relay credentials, simulation, durable tracking, auth, and explicit live approval exist.',
      needs: ['Relay provider', 'Simulation harness', 'Explicit live approval']
    }
  ];

  return Response.json({
    status: fixableInCode.length ? 'actionable-code-fixes' : externalProviderRequired.length || operatorActionRequired.length || intentionallyDisabledUntilLive.length ? 'partial' : 'ready-for-explicit-live-activation-review',
    contract: 'meridian-pre-live-resolution-matrix-v1',
    observedAt,
    projectId: selectedProject?.id ?? null,
    liveExecutionAllowed: false,
    execution: 'read-only-resolution-matrix-no-signing-no-swaps-no-broadcasts',
    summary: {
      checklistState: checklist.state,
      checklistFailed: checklist.failed,
      checklistWarnings: checklist.warnings,
      walletReadiness: walletReadiness.status,
      providerReadiness: providerReadiness.status,
      liveStoreMode: liveStore.storageMode,
      liveStoreAuthConfigured: liveStore.authConfigured,
      portfolioStatus: portfolio.body?.status ?? null,
      fillsStatus: fills.body?.status ?? null,
      timeseriesConfidence: timeseries.body?.confidence ?? null,
      terminalLiveScore: terminalLive.body?.score ?? null
    },
    groups: {
      resolved,
      fixableInCode,
      operatorActionRequired,
      externalProviderRequired,
      intentionallyDisabledUntilLive
    },
    rawContracts: {
      checklist,
      walletReadiness,
      providerReadiness: { status: providerReadiness.status, blockingForLive: providerReadiness.blockingForLive, optionalProviderGaps: providerReadiness.optionalProviderGaps, historyAndPnlConfidence: providerReadiness.historyAndPnlConfidence },
      liveStore,
      portfolio: portfolio.body,
      fills: fills.body,
      timeseries: timeseries.body,
      terminalLive: terminalLive.body
    }
  }, { headers: { 'cache-control': 'no-store' } });
}
