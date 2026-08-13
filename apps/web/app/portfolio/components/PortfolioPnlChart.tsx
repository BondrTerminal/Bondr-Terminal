'use client';

import { useEffect, useMemo, useRef } from 'react';
import { AreaSeries, BaselineSeries, HistogramSeries, createChart, type IChartApi, type Time } from 'lightweight-charts';
import type { PortfolioTimeseries } from '../../../lib/portfolio-timeseries';

type PortfolioPnlChartProps = {
  timeseries: PortfolioTimeseries;
};

function money(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unavailable';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2 });
}

function asTime<T extends { time: string; value: number }>(rows: T[]): Array<Omit<T, 'time'> & { time: Time }> {
  return rows.map((row) => ({ ...row, time: row.time as Time }));
}

export function PortfolioPnlChart({ timeseries }: PortfolioPnlChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const realized = timeseries.series.cumulativeRealizedPnl;
  const bars = timeseries.series.dailyRealizedPnl;
  const netFlow = timeseries.series.cumulativeNetFlow;
  const hasData = realized.length > 0 || bars.length > 0;
  const latestRealized = realized.at(-1)?.value ?? timeseries.summary.realizedPnlUsd;

  const subtitle = useMemo(() => {
    if (!hasData) return 'No modeled flow events in this range yet.';
    return `${timeseries.confidence} · ${timeseries.summary.eventCount} events · ${timeseries.summary.buyCount}/${timeseries.summary.sellCount} buys/sells`;
  }, [hasData, timeseries.confidence, timeseries.summary.buyCount, timeseries.summary.eventCount, timeseries.summary.sellCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasData) return;

    const chart = createChart(container, {
      autoSize: true,
      height: 214,
      layout: {
        background: { color: 'transparent' },
        textColor: '#91a9ca',
        attributionLogo: false
      },
      grid: {
        vertLines: { color: 'rgba(86, 164, 255, 0.08)' },
        horzLines: { color: 'rgba(86, 164, 255, 0.10)' }
      },
      rightPriceScale: {
        borderColor: 'rgba(86, 164, 255, 0.16)',
        scaleMargins: { top: 0.14, bottom: 0.22 }
      },
      timeScale: {
        borderColor: 'rgba(86, 164, 255, 0.16)',
        timeVisible: false,
        secondsVisible: false
      },
      crosshair: {
        vertLine: { color: 'rgba(125, 199, 255, 0.32)' },
        horzLine: { color: 'rgba(125, 199, 255, 0.22)' }
      }
    });
    chartRef.current = chart;

    const pnlArea = chart.addSeries(AreaSeries, {
      lineColor: '#36d6a0',
      topColor: 'rgba(54, 214, 160, 0.30)',
      bottomColor: 'rgba(54, 214, 160, 0.02)',
      lineWidth: 2,
      priceLineVisible: false
    });
    pnlArea.setData(asTime(realized));

    const dailyBars = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      priceLineVisible: false,
      base: 0
    });
    dailyBars.setData(asTime(bars));

    if (netFlow.length > 0) {
      const netBaseline = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: 0 },
        topLineColor: 'rgba(125, 199, 255, 0.70)',
        topFillColor1: 'rgba(125, 199, 255, 0.10)',
        topFillColor2: 'rgba(125, 199, 255, 0.01)',
        bottomLineColor: 'rgba(227, 93, 106, 0.55)',
        bottomFillColor1: 'rgba(227, 93, 106, 0.10)',
        bottomFillColor2: 'rgba(227, 93, 106, 0.01)',
        lineWidth: 1,
        priceLineVisible: false
      });
      netBaseline.setData(asTime(netFlow));
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, hasData, netFlow, realized]);

  return (
    <div className="portfolioPnlChartShell">
      <div className="portfolioPnlChartHeader">
        <div>
          <span>Realized PNL</span>
          <strong className={Number(latestRealized ?? 0) >= 0 ? 'profitText' : 'dangerText'}>{money(latestRealized)}</strong>
        </div>
        <small>{subtitle}</small>
      </div>
      {hasData ? <div className="portfolioPnlChart" ref={containerRef} /> : <div className="portfolioChartPlaceholder">Realized PNL<br />No chartable flow yet</div>}
      <div className="portfolioPnlLegend" aria-label="Portfolio PnL chart legend">
        <span><i className="legendPnl" /> cumulative realized</span>
        <span><i className="legendIn" /> daily realized bars</span>
        <span><i className="legendNet" /> cumulative net flow</span>
      </div>
      <a className="portfolioTvAttribution" href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charts by TradingView Lightweight Charts™</a>
    </div>
  );
}
