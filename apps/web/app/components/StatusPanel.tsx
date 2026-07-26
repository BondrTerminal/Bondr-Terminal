import { formatNumber, shortKey, type MarketMakerStatus, type PaperSessionReportResponse } from '../../lib/status';

function dotClassForHealth(health: MarketMakerStatus['health']) {
  if (health === 'ok') return 'green';
  if (health === 'halted') return 'red';
  return '';
}

export function StatusPanel({ status }: { status: MarketMakerStatus }) {
  const dotClass = dotClassForHealth(status.health);
  return (
    <section className="card" aria-label="Market maker status">
      <div className="panelHeader">
        <div className="pill"><span className={`dot ${dotClass}`} /> {status.health.toUpperCase()}</div>
        <div className="pill muted">{status.source}</div>
      </div>
      <h2 style={{ marginTop: 18 }}>Control surface</h2>
      <div className="status"><span>Mode</span><strong>{status.mode}</strong></div>
      <div className="status"><span>Cluster</span><strong>{status.cluster}</strong></div>
      <div className="status"><span>Venue</span><strong>{status.venue}</strong></div>
      <div className="status"><span>Wallet</span><strong title={status.wallet.pubkey}>{shortKey(status.wallet.pubkey)}</strong></div>
      <div className="status"><span>Live trading</span><strong className="dangerText">{status.liveTradingEnabled ? 'enabled' : 'disabled'}</strong></div>
      <p className="small">Last observation: {status.lastObservationAt ?? 'not connected yet'}</p>
    </section>
  );
}

export function BalanceCards({ status }: { status: MarketMakerStatus }) {
  return (
    <section className="grid two" aria-label="Wallet balances">
      <MetricCard label="SOL balance" value={formatNumber(status.wallet.solBalance, { maximumFractionDigits: 9 })} detail={status.wallet.name} />
      <MetricCard label={`${status.token.symbol} balance`} value={formatNumber(status.wallet.tokenBalance, { maximumFractionDigits: status.token.decimals })} detail={shortKey(status.token.mint)} />
    </section>
  );
}

export function MarketCards({ status }: { status: MarketMakerStatus }) {
  return (
    <section className="grid three" aria-label="Market snapshot">
      <MetricCard label="Token mint" value={status.token.symbol} detail={shortKey(status.token.mint)} title={status.token.mint} />
      <MetricCard label="Quote mint" value={status.quote.symbol} detail={shortKey(status.quote.mint)} title={status.quote.mint} />
      <MetricCard label="Reference price" value={formatNumber(status.market.referencePrice, { maximumSignificantDigits: 10 })} detail={`${status.quote.symbol} per ${status.token.symbol}`} />
      <MetricCard label="Estimated slippage" value={`${formatNumber(status.market.estimatedSlippageBps, { maximumFractionDigits: 2 })} bps`} detail="read-only quote" />
      <MetricCard label="Volatility" value={`${formatNumber(status.market.volatilityBps, { maximumFractionDigits: 2 })} bps`} detail="null until history exists" />
      <MetricCard label="Supply" value={formatNumber(status.token.supplyUi, { maximumFractionDigits: 3 })} detail={`${status.token.symbol} total`} />
    </section>
  );
}

export function RiskCards({ status }: { status: MarketMakerStatus }) {
  const risk = status.risk;
  return (
    <section className="card" aria-label="Risk limits">
      <div className="eyebrow">Risk limits</div>
      <h2>Dry-run guardrails</h2>
      <div className="riskGrid">
        <RiskRow label="Max total SOL exposure" value={`${risk.maxTotalSolExposure} SOL`} />
        <RiskRow label="Max trade size" value={`${risk.maxTradeSol} SOL`} />
        <RiskRow label="Max trades / minute" value={String(risk.maxTradesPerMinute)} />
        <RiskRow label="Max slippage" value={`${risk.maxSlippageBps} bps`} />
        <RiskRow label="Max daily loss" value={`${risk.maxDailyLossSol} SOL`} />
        <RiskRow label="Kill-switch drawdown" value={`${risk.killSwitchDrawdownBps} bps`} />
        <RiskRow label="Market data freshness" value={`${risk.maxMarketDataAgeMs} ms`} />
      </div>
    </section>
  );
}

export function NotesCard({ status }: { status: MarketMakerStatus }) {
  return (
    <section className="card" aria-label="Dashboard notes">
      <div className="eyebrow">Operator notes</div>
      <ul className="notes">
        {status.notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </section>
  );
}

export function PaperSessionReportCards({ reportResponse }: { reportResponse: PaperSessionReportResponse }) {
  const report = reportResponse.report;

  if (report === null) {
    return (
      <section className="card" aria-label="Paper session report">
        <div className="panelHeader">
          <div className="eyebrow">Paper session report</div>
          <div className="pill muted">{reportResponse.source}</div>
        </div>
        <h2 style={{ marginTop: 18 }}>No engine report yet</h2>
        <p>
          Run a bounded backend engine session with a safe <code>reportPath</code> to populate this read-only review panel.
          The dashboard does not sign transactions, place orders, or expose runtime secrets.
        </p>
      </section>
    );
  }

  const pnl = report.final.paperPnl;
  const risk = report.final.paperRisk;
  const spread = report.final.spreadCapture;
  const finalCycle = report.cycles.at(-1);
  const skippedReasons = report.skippedReasons.length > 0 ? report.skippedReasons : ['No skipped reasons reported.'];

  return (
    <section aria-label="Paper session report">
      <div className="card reportHeader">
        <div className="panelHeader">
          <div className="eyebrow">Paper session report</div>
          <div className="pill muted">{reportResponse.source}</div>
        </div>
        <h2 style={{ marginTop: 18 }}>Latest bounded backend run</h2>
        <div className="riskGrid">
          <RiskRow label="Executed cycles" value={`${report.executedCycleCount}/${report.requestedCycleCount} requested · max ${report.maxCycles}`} />
          <RiskRow label="Stop reason" value={report.stoppedReason ?? 'completed'} />
          <RiskRow label="Generated at" value={report.generatedAt ?? 'not generated'} />
          <RiskRow label="Safety" value={report.paperOnly && !report.liveExecution ? 'live-gated / live disabled' : 'unsafe'} />
          <RiskRow label="Starting inventory avg cost" value={`${formatNumber(pnl?.startingTokenAverageCostSol ?? null, { maximumFractionDigits: 9 })} SOL`} />
          <RiskRow label="Realized from starting inventory" value={`${formatNumber(pnl?.realizedPnlFromStartingInventorySol ?? null, { maximumFractionDigits: 9 })} SOL`} />
        </div>
      </div>

      <section className="grid three" aria-label="Paper session metrics">
        <MetricCard label="Engine PnL" value={`${formatNumber(pnl?.totalPaperPnlSol ?? null, { maximumFractionDigits: 9 })} SOL`} detail={`realized ${formatNumber(pnl?.realizedPnlSol ?? null, { maximumFractionDigits: 9 })} SOL`} />
        <MetricCard label="Paper risk" value={risk?.action ?? '—'} detail={risk?.passed ? 'passed' : 'blocked or unavailable'} />
        <MetricCard label="Fee-adjusted spread" value={`${formatNumber(spread?.feeAdjustedSpreadCapturedSol ?? null, { maximumFractionDigits: 9 })} SOL`} detail={`${formatNumber(spread?.matchedSizeUi ?? null, { maximumFractionDigits: 6 })} matched size`} />
        <MetricCard label="Filled orders" value={String(report.totals.filledOrderCount)} detail={`${report.totals.partiallyFilledOrderCount} partial fills`} />
        <MetricCard label="Open orders" value={String(report.totals.finalOpenOrderCount)} detail={`${formatNumber(pnl?.openBidNotionalSol ?? null, { maximumFractionDigits: 9 })} bid SOL open`} />
        <MetricCard label="Skipped items" value={String(report.skippedReasons.length)} detail={`${pnl?.skippedCount ?? 0} PnL · ${spread?.skippedCount ?? 0} spread`} />
      </section>

      <section className="grid two" aria-label="Paper report details">
        <div className="card">
          <div className="eyebrow">Spread capture</div>
          <div className="riskGrid single">
            <RiskRow label="Quoted spread" value={`${formatNumber(spread?.quotedSpreadSol ?? null, { maximumFractionDigits: 9 })} SOL`} />
            <RiskRow label="Executed spread" value={`${formatNumber(spread?.executedSpreadSol ?? null, { maximumFractionDigits: 9 })} SOL`} />
            <RiskRow label="Gross captured" value={`${formatNumber(spread?.grossSpreadCapturedSol ?? null, { maximumFractionDigits: 9 })} SOL`} />
            <RiskRow label="Fees" value={`${formatNumber(spread?.totalFeesSol ?? null, { maximumFractionDigits: 9 })} SOL`} />
            <RiskRow label="Unmatched inventory" value={formatNumber(spread?.unmatchedInventoryUi ?? null, { maximumFractionDigits: 6 })} />
            <RiskRow label="Buy / sell fills" value={`${spread?.buyFillCount ?? 0} / ${spread?.sellFillCount ?? 0}`} />
          </div>
        </div>
        <div className="card">
          <div className="eyebrow">Skipped reasons</div>
          <ul className="notes compact">
            {skippedReasons.slice(0, 6).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          {skippedReasons.length > 6 ? <p className="small">+{skippedReasons.length - 6} more reasons in the JSON report.</p> : null}
          <p className="small">Last cycle: {finalCycle === undefined ? 'none' : `#${finalCycle.cycleIndex} at ${finalCycle.observedAt}`}</p>
        </div>
      </section>
    </section>
  );
}

function MetricCard({ label, value, detail, title }: { label: string; value: string; detail: string; title?: string }) {
  return (
    <div className="card metric" title={title}>
      <span className="metricLabel">{label}</span>
      <strong>{value}</strong>
      <span className="metricDetail">{detail}</span>
    </div>
  );
}

function RiskRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="riskRow">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
