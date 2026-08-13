import { buildPortfolioTimeseries } from '../../../../lib/portfolio-timeseries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const timeseries = await buildPortfolioTimeseries(searchParams.get('range') ?? undefined);
    return Response.json(timeseries, { status: 200 });
  } catch (error) {
    return Response.json({
      contract: 'portfolio-timeseries-v1',
      status: 'unavailable',
      observedAt: new Date().toISOString(),
      range: searchParams.get('range') ?? '30d',
      currency: 'USD',
      source: 'meridian-flow-events+jupiter-price-v3',
      confidence: 'unavailable',
      costBasisMethod: 'weighted-average',
      solUsd: null,
      series: { cumulativeRealizedPnl: [], dailyRealizedPnl: [], cumulativeNetFlow: [] },
      summary: { realizedPnlUsd: null, netFlowUsd: null, eventCount: 0, buyCount: 0, sellCount: 0 },
      gaps: [error instanceof Error ? error.message : 'Portfolio timeseries failed.']
    }, { status: 500 });
  }
}
