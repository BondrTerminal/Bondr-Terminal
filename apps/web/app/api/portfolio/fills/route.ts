import { buildPortfolioFills } from '../../../../lib/portfolio-fills';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const fills = await buildPortfolioFills({
      wallet: searchParams.get('wallet'),
      group: searchParams.get('group'),
      limit: Number(searchParams.get('limit') ?? '100')
    });
    return Response.json(fills, { status: 200 });
  } catch (error) {
    return Response.json({
      contract: 'portfolio-fills-v1',
      status: 'unavailable',
      observedAt: new Date().toISOString(),
      source: 'helius-wallet-history',
      confidence: 'unavailable',
      walletCount: 0,
      fillCount: 0,
      cache: { hitCount: 0, missCount: 0, ttlMs: 0 },
      fills: [],
      gaps: [error instanceof Error ? error.message : 'Portfolio fills failed.'],
      execution: 'live-index-read'
    }, { status: 500 });
  }
}
