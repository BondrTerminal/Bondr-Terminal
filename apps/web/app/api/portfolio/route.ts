import { buildPortfolioSnapshot } from '../../../lib/portfolio-snapshot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await buildPortfolioSnapshot();
    return Response.json(snapshot, { status: 200 });
  } catch (error) {
    return Response.json({
      contract: 'portfolio-v1',
      status: 'partial',
      source: 'meridian-portfolio',
      observedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Portfolio snapshot failed.',
      note: 'Portfolio route failed before producing all sections.'
    }, { status: 500 });
  }
}
