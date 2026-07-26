import { createPaperEntry, closePaperEntry, listPaperLedger, summarizePaperLedger } from '../../../lib/paper-ledger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim() || null;
  const currentPriceUsd = searchParams.get('currentPriceUsd') ? Number(searchParams.get('currentPriceUsd')) : null;
  const entries = listPaperLedger({ mint, status: 'all' }).slice(0, 100);
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    execution: 'paper-only-no-sign-no-send',
    liveTradingEnabled: false,
    mint,
    entries,
    summary: summarizePaperLedger(mint, Number.isFinite(currentPriceUsd) ? currentPriceUsd : null),
    secretsExposed: false
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ status: 'error', error: 'Invalid JSON body.', execution: 'paper-only-no-sign-no-send' }, { status: 400 });
  }
  try {
    const action = String(body.action ?? 'entry');
    if (action === 'exit') {
      const entry = closePaperEntry(String(body.id ?? ''), body.exitPriceUsd);
      return Response.json({ status: 'ok', observedAt: new Date().toISOString(), action, entry, execution: 'paper-only-no-sign-no-send', liveTradingEnabled: false });
    }
    const entry = createPaperEntry({
      mint: String(body.mint ?? ''),
      side: String(body.side ?? 'buy'),
      amountIn: body.amountIn ?? body.amount,
      spendAsset: String(body.spendAsset ?? 'SOL'),
      quote: body.quote,
      priceUsd: body.priceUsd
    });
    return Response.json({ status: 'ok', observedAt: new Date().toISOString(), action: 'entry', entry, execution: 'paper-only-no-sign-no-send', liveTradingEnabled: false });
  } catch (error) {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Paper ledger mutation failed.', execution: 'paper-only-no-sign-no-send', liveTradingEnabled: false }, { status: 400 });
  }
}
