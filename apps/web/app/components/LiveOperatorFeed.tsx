'use client';

import { useEffect, useMemo, useState } from 'react';
import type { OperatorFeedResponse, RuntimeFeedEvent } from '../../lib/status';

type FeedState = { data: OperatorFeedResponse; loading: boolean; error: string | null };
type Tone = 'good' | 'warn' | 'danger';
type ReportCycle = NonNullable<OperatorFeedResponse['reportResponse']['report']>['cycles'][number];
type Market = { base: string; quote: string; pair: string };
type FlowPoint = { cycleIndex: number; time: string; pnl: number; inflow: number; outflow: number; netFlow: number };

function formatNumber(value: number | null | undefined, maximumFractionDigits = 6): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

function shortTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function ageSeconds(value: string | null | undefined, nowIso: string): number | null {
  if (!value) return null;
  const observedMs = Date.parse(value);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(observedMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.round((nowMs - observedMs) / 1000));
}

function freshness(seconds: number | null): { label: string; tone: Tone } {
  if (seconds === null) return { label: 'unknown', tone: 'warn' };
  if (seconds < 30) return { label: `${seconds}s`, tone: 'good' };
  if (seconds < 120) return { label: `${seconds}s`, tone: 'warn' };
  return { label: `${seconds}s`, tone: 'danger' };
}

function eventTone(type: RuntimeFeedEvent['type']): string {
  if (type === 'runtime_step') return 'good';
  if (type === 'transaction_retry' || type === 'note') return 'info';
  return 'warn';
}

function countEvents(events: RuntimeFeedEvent[], type: RuntimeFeedEvent['type']): number {
  return events.filter((event) => event.type === type).length;
}

function pnlTone(value: number | null | undefined): Tone {
  if (value === null || value === undefined) return 'warn';
  if (value > 0) return 'good';
  if (value < 0) return 'danger';
  return 'warn';
}

function sourceTone(data: OperatorFeedResponse): { label: string; tone: Tone } {
  const reportWallet = data.reportResponse.report?.final.paperPnl?.wallet.pubkey ?? null;
  const fixture = reportWallet?.startsWith('FixtureWallet') === true;
  const mismatch = reportWallet !== null && reportWallet !== data.status.wallet.pubkey;
  if (fixture || mismatch) return { label: fixture ? 'fixture' : 'mixed source', tone: 'warn' };
  return { label: data.liveTradingEnabled ? 'live' : 'gated', tone: data.liveTradingEnabled ? 'danger' : 'good' };
}

function riskState(data: OperatorFeedResponse): { label: string; tone: Tone } {
  const action = data.reportResponse.report?.final.paperRisk?.action;
  if (action === 'allow') return { label: 'allow', tone: 'good' };
  if (action === 'block') return { label: 'block', tone: 'warn' };
  if (action === 'halt') return { label: 'halt', tone: 'danger' };
  return { label: 'unknown', tone: 'warn' };
}

function buildFlowPoints(cycles: ReportCycle[] | undefined): FlowPoint[] {
  return (cycles ?? []).map((cycle) => {
    const pnl = cycle.paperPnl;
    const inflow = pnl.filledSellVolumeSol;
    const outflow = pnl.filledBuyVolumeSol;
    return {
      cycleIndex: cycle.cycleIndex,
      time: cycle.observedAt,
      pnl: pnl.totalPaperPnlSol ?? 0,
      inflow,
      outflow,
      netFlow: inflow - outflow - pnl.paperFeesSol - pnl.paperSlippageSol
    };
  });
}

export function LiveOperatorFeed({ initialFeed }: { initialFeed: OperatorFeedResponse }) {
  const [state, setState] = useState<FeedState>({ data: initialFeed, loading: false, error: null });
  const [autoRefresh, setAutoRefresh] = useState(false);

  async function refresh() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const res = await fetch('/api/market-maker/feed', { cache: 'no-store' });
      if (!res.ok) throw new Error(`feed request failed: ${res.status}`);
      const data = await res.json() as OperatorFeedResponse;
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'feed request failed' }));
    }
  }

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  const data = state.data;
  const report = data.reportResponse.report;
  const finalPnl = report?.final.paperPnl;
  const market: Market = {
    base: data.status.token.symbol,
    quote: data.status.quote.symbol,
    pair: `${data.status.token.symbol}/${data.status.quote.symbol}`
  };
  const latestCycle = report?.cycles.length ? report.cycles[report.cycles.length - 1] : undefined;
  const latestReportAt = report?.generatedAt ?? latestCycle?.observedAt ?? null;
  const fresh = freshness(ageSeconds(latestReportAt, data.generatedAt));
  const source = sourceTone(data);
  const risk = riskState(data);
  const retryCount = countEvents(data.runtimeEvents.events, 'transaction_retry');
  const passCount = countEvents(data.runtimeEvents.events, 'transaction_pass');
  const visibleEvents = data.runtimeEvents.events.slice(0, 8);
  const skippedReasons = useMemo(() => report?.skippedReasons.slice(0, 4) ?? [], [report]);
  const totalVolume = (finalPnl?.filledBuyVolumeSol ?? 0) + (finalPnl?.filledSellVolumeSol ?? 0);
  const openNotional = (finalPnl?.openBidNotionalSol ?? 0) + (finalPnl?.openAskNotionalSol ?? 0);
  const currentPortfolioValue = finalPnl?.currentPaperPortfolioValueSol ?? data.status.wallet.solBalance;
  const startingPortfolioValue = finalPnl?.startingPortfolioValueSol ?? null;
  const inventoryBase = data.status.wallet.tokenBalance ?? 0;
  const inventoryValueQuote = data.status.market.referencePrice !== null ? inventoryBase * data.status.market.referencePrice : null;
  const strategy = data.status.strategy;
  const targetInventory = strategy?.targetInventoryUi ?? finalPnl?.startingTokenInventoryUi ?? null;
  const inventoryDrift = targetInventory === null ? null : inventoryBase - targetInventory;
  const cadenceLabel = strategy ? `${Math.round(strategy.minDelayMs / 1000)}–${Math.round(strategy.maxDelayMs / 1000)}s` : '—';
  const stoppedReason = report?.stoppedReason ?? null;
  const engineState = stoppedReason !== null
    ? 'risk-blocked'
    : strategy?.engineState ?? (risk.label === 'halt' ? 'halted' : (report?.totals.finalOpenOrderCount ?? 0) > 0 ? 'waiting-for-fills' : 'observing');

  return (
    <section className="terminalBoard meridianBoard" aria-label="Bond.Terminal liquidity command system">
      <header className="terminalStatusBar">
        <div>
          <div className="terminalPair">{market.pair}</div>
          <div className="terminalSubline">{data.status.cluster} · {data.status.venue} · {data.status.wallet.name}</div>
        </div>
        <div className="terminalControls">
          <StatusPill label={source.label} tone={source.tone} />
          <StatusPill label={engineState.replace(/-/g, ' ')} tone={risk.tone === 'danger' ? 'danger' : fresh.tone} />
          <StatusPill label={`risk ${risk.label}`} tone={risk.tone} />
          <StatusPill label={`age ${fresh.label}`} tone={fresh.tone} />
          <button className="button secondary smallButton" type="button" onClick={() => setAutoRefresh((value) => !value)}>{autoRefresh ? 'Auto on' : 'Auto off'}</button>
          <button className="button smallButton" type="button" onClick={() => void refresh()} disabled={state.loading}>{state.loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </header>

      {state.error ? <p className="dangerText small">{state.error}</p> : null}

      <section className="terminalKpis" aria-label="Market maker metrics">
        <Kpi label="Capital" value={`${formatNumber(currentPortfolioValue, 6)} ${market.quote}`} detail={startingPortfolioValue === null ? 'current wallet value' : `start ${formatNumber(startingPortfolioValue, 6)} ${market.quote}`} tone="good" />
        <Kpi label="P/L" value={`${formatNumber(finalPnl?.totalPaperPnlSol, 9)} ${market.quote}`} detail={`realized ${formatNumber(finalPnl?.realizedPnlSol, 9)} ${market.quote}`} tone={pnlTone(finalPnl?.totalPaperPnlSol)} />
        <Kpi label="Exposure" value={`${formatNumber(openNotional, 6)} ${market.quote}`} detail={`${report?.totals.finalOpenOrderCount ?? 0} open orders`} tone={(report?.totals.finalOpenOrderCount ?? 0) > 0 ? 'good' : 'warn'} />
        <Kpi label="Autonomy" value={strategy?.autonomy.replace(/-/g, ' ') ?? 'backend wired'} detail={`${engineState.replace(/-/g, ' ')} · ${cadenceLabel} cadence`} tone={risk.tone === 'danger' ? 'danger' : 'good'} />
      </section>

      <section className="terminalLayout">
        <div className="terminalMain">
          <section className="marketSnapshot terminalPanel">
            <PanelTitle label="Market" title="Command state" />
            <InfoGrid rows={[
              ['price', `${formatNumber(data.status.market.referencePrice, 10)} ${market.quote}`],
              ['base', market.base],
              ['quote', market.quote],
              ['observed', shortTime(data.status.lastObservationAt)]
            ]} />
          </section>
          <section className="terminalPanel autonomyPanel">
            <PanelTitle label="Autonomous engine" title={engineState.replace(/-/g, ' ')} />
            <p className="engineThesis">{strategy?.objective ?? 'Quote both sides, manage inventory, and wait for risk-approved fills.'}</p>
            {stoppedReason ? <p className="engineStopReason">Stopped: {stoppedReason}</p> : null}
            <InfoGrid rows={[
              ['strategy', 'spread scalping'],
              ['cadence', cadenceLabel],
              ['spread', strategy ? `${strategy.minSpreadBps}–${strategy.maxSpreadBps} bps` : '—'],
              ['base spread', strategy ? `${strategy.baseSpreadBps} bps` : '—'],
              ['inventory skew', strategy ? `${strategy.inventorySkewBps} bps` : '—'],
              ['target inventory', targetInventory === null ? '—' : `${formatNumber(targetInventory, 6)} ${market.base}`],
              ['inventory drift', inventoryDrift === null ? '—' : `${formatNumber(inventoryDrift, 6)} ${market.base}`],
              ['max inventory', strategy?.maxInventoryUi === null || strategy?.maxInventoryUi === undefined ? '—' : `${formatNumber(strategy.maxInventoryUi, 6)} ${market.base}`],
              ['session stop', stoppedReason ?? 'none']
            ]} />
          </section>
          <section className="terminalPanel capitalPanel">
            <PanelTitle label="Capital" title="Account" />
            <InfoGrid rows={[
              ['portfolio', `${formatNumber(currentPortfolioValue, 6)} ${market.quote}`],
              ['cash', `${formatNumber(data.status.wallet.solBalance, 6)} ${market.quote}`],
              ['inventory', `${formatNumber(inventoryBase, 6)} ${market.base}`],
              ['inventory value', `${formatNumber(inventoryValueQuote, 6)} ${market.quote}`],
              ['open notional', `${formatNumber(openNotional, 6)} ${market.quote}`],
              ['mode', data.liveTradingEnabled ? 'live' : 'gated']
            ]} />
          </section>
          <WalletFlowChart points={buildFlowPoints(report?.cycles)} quoteSymbol={market.quote} />
          <TradeCycles cycles={report?.cycles ?? []} market={market} />
        </div>

        <div className="terminalLowerGrid">
          <section className="terminalPanel">
            <PanelTitle label="Risk" title={risk.label} />
            <InfoGrid rows={[
              ['mode', data.liveTradingEnabled ? 'live' : 'gated'],
              ['max trade', `${data.status.risk.maxTradeSol} ${market.quote}`],
              ['max slippage', `${data.status.risk.maxSlippageBps} bps`],
              ['max loss', `${data.status.risk.maxDailyLossSol} ${market.quote}`]
            ]} />
            {skippedReasons.length ? <div className="alertStack">{skippedReasons.map((reason) => <p className="alertLine" key={reason}>{reason}</p>)}</div> : null}
          </section>

          <section className="terminalPanel">
            <PanelTitle label="Activity" title="Latest events" />
            <div className="eventList compactEvents">
              {visibleEvents.length === 0 ? <p>No events yet.</p> : visibleEvents.map((event, index) => (
                <div className={`eventItem ${eventTone(event.type)}`} key={`${event.observedAt}-${event.type}-${index}`}>
                  <span>{shortTime(event.observedAt)}</span>
                  <strong>{event.type.replace(/_/g, ' ')}</strong>
                  <p>{event.message ?? 'No message.'}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </section>
  );
}

function TradeCycles({ cycles, market }: { cycles: ReportCycle[]; market: Market }) {
  if (cycles.length === 0) {
    return <section className="terminalPanel"><PanelTitle label="Trades" title="No cycles yet" /></section>;
  }

  return (
    <section className="terminalPanel">
      <PanelTitle label="Trades" title="Cycles" />
      <div className="terminalTable" role="table" aria-label="Trade cycles">
        <div className="terminalRow terminalHead" role="row">
          <span>Cycle</span><span>Time</span><span>Market</span><span>Price</span><span>Filled</span><span>Open</span><span>P/L</span><span>State</span>
        </div>
        {cycles.slice().reverse().map((cycle) => {
          const filledBase = cycle.paperPnl.filledBuySizeUi + cycle.paperPnl.filledSellSizeUi;
          const filledQuote = cycle.paperPnl.filledBuyVolumeSol + cycle.paperPnl.filledSellVolumeSol;
          const openQuote = cycle.paperPnl.openBidNotionalSol + cycle.paperPnl.openAskNotionalSol;
          const referencePrice = cycle.referencePrice ?? 0;
          const openBase = referencePrice > 0 ? openQuote / referencePrice : 0;
          return (
            <div className="terminalRow" role="row" key={`${cycle.cycleIndex}-${cycle.observedAt}`}>
              <span>#{cycle.cycleIndex}</span>
              <span>{shortTime(cycle.observedAt)}</span>
              <span>{market.pair}</span>
              <span>{formatNumber(cycle.referencePrice, 10)} {market.quote}</span>
              <span>{formatNumber(filledBase, 6)} {market.base}<small>{formatNumber(filledQuote, 9)} {market.quote}</small></span>
              <span>{formatNumber(openBase, 6)} {market.base}<small>{formatNumber(openQuote, 9)} {market.quote}</small></span>
              <span className={(cycle.paperPnl.totalPaperPnlSol ?? 0) < 0 ? 'dangerText' : 'profitText'}>{formatNumber(cycle.paperPnl.totalPaperPnlSol, 9)} {market.quote}</span>
              <span>{cycle.paperRisk.action}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WalletFlowChart({ points, quoteSymbol }: { points: FlowPoint[]; quoteSymbol: string }) {
  const latest = points.length ? points[points.length - 1] : null;
  const hasMovement = points.some((point) => point.pnl !== 0 || point.netFlow !== 0 || point.inflow !== 0 || point.outflow !== 0);
  const width = 720;
  const height = 220;
  const padX = 36;
  const padY = 24;
  const values = points.flatMap((point) => [point.pnl, point.netFlow, point.inflow, -point.outflow]);
  const maxAbs = Math.max(0.000001, ...values.map((value) => Math.abs(value)));
  const chartWidth = width - padX * 2;
  const chartHeight = height - padY * 2;
  const x = (index: number) => points.length <= 1 ? padX : padX + (index / (points.length - 1)) * chartWidth;
  const y = (value: number) => padY + ((maxAbs - value) / (maxAbs * 2)) * chartHeight;
  const zeroY = y(0);
  const pathFor = (selector: (point: FlowPoint) => number) => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(selector(point)).toFixed(2)}`).join(' ');

  return (
    <section className="terminalPanel">
      <PanelTitle label="Wallet" title="Flow" />
      <div className="flowSummary compactFlow">
        <Breakdown label="P/L" value={`${formatNumber(latest?.pnl, 9)} ${quoteSymbol}`} />
        <Breakdown label="Inflow" value={`${formatNumber(latest?.inflow, 9)} ${quoteSymbol}`} />
        <Breakdown label="Outflow" value={`${formatNumber(latest?.outflow, 9)} ${quoteSymbol}`} />
        <Breakdown label="Net" value={`${formatNumber(latest?.netFlow, 9)} ${quoteSymbol}`} />
      </div>
      {points.length === 0 ? (
        <div className="emptyChartState"><strong>No flow data</strong><p>Run a backend engine cycle to populate the chart.</p></div>
      ) : !hasMovement ? (
        <div className="emptyChartState"><strong>Waiting for fills</strong><p>Orders are open. Inflow/outflow appears when stored orders fill.</p></div>
      ) : (
        <div className="chartWrap">
          <svg className="flowChart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Wallet flow chart">
            <line className="axisLine" x1={padX} y1={zeroY} x2={width - padX} y2={zeroY} />
            <path className="netFlowLine" d={pathFor((point) => point.netFlow)} />
            <path className="pnlLine" d={pathFor((point) => point.pnl)} />
            {points.map((point, index) => <circle className="pnlDot" key={`${point.cycleIndex}-${point.time}`} cx={x(index)} cy={y(point.pnl)} r="3" />)}
          </svg>
        </div>
      )}
    </section>
  );
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`statusChip ${tone}`}>{label}</span>;
}

function PanelTitle({ label, title }: { label: string; title: string }) {
  return <div className="panelTitle"><span>{label}</span><strong>{title}</strong></div>;
}

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: Tone }) {
  return <div className={`opsKpi ${tone}`}><span>{label}</span><strong>{value}</strong><em>{detail}</em></div>;
}

function Breakdown({ label, value }: { label: string; value: string }) {
  return <div className="breakdown"><span>{label}</span><strong>{value}</strong></div>;
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return <div className="infoGrid">{rows.map(([label, value]) => <div className="sideRow" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}
