#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const base = process.env.TERMINAL_BASE_URL ?? 'http://localhost:3000';
const renderedRoutes = ['/', '/projects', '/projects/meridian-demo', '/wallets', '/deployment', '/sniper', '/liquidity', '/token-analyzer', '/whitepaper', '/github'];
const forbiddenHtml = [
  'mock',
  'Mock',
  'scaffold',
  'Scaffold',
  'demo state',
  'UI-wired only',
  'coming soon',
  'fake values',
  'Parser pending',
  'Provider pending',
  'Helius req',
  'Pool scan req',
  'Graph pending'
];
const forbiddenSource = [
  'SOL modeled',
  'Modeled buy:',
  'pending backend',
  'Multi-wallet transaction bundle scaffold',
  'Simulated create flow placeholder',
  'UI-wired only',
  'not-implemented-no-backend-route',
  'not-implemented-no-open-order-store',
  'sequencer-missing'
];
const sourceFiles = [
  'apps/web/app/page.tsx',
  'apps/web/app/projects/page.tsx',
  'apps/web/app/projects/[id]/page.tsx',
  'apps/web/app/wallets/page.tsx',
  'apps/web/app/deployment/page.tsx',
  'apps/web/app/sniper/components/TradingTokenLoader.tsx',
  'apps/web/app/sniper/components/TerminalInfoBooth.tsx',
  'apps/web/app/sniper/components/WalletSelectionDesk.tsx',
  'apps/web/app/liquidity/page.tsx',
  'apps/web/app/liquidity/components/LiquidityEngineProbe.tsx',
  'apps/web/app/liquidity/components/LiquidityBackendStatus.tsx',
  'apps/web/app/whitepaper/page.tsx'
];

async function fetchText(path) {
  const response = await fetch(`${base}${path}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text.slice(0, 200)}`);
  return text;
}

async function main() {
  const failures = [];
  for (const path of renderedRoutes) {
    const html = await fetchText(path);
    const visibleText = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const phrase of forbiddenHtml) if (visibleText.includes(phrase)) failures.push(`${path} rendered forbidden phrase: ${phrase}`);
  }
  for (const file of sourceFiles) {
    const body = readFileSync(file, 'utf8');
    for (const phrase of forbiddenSource) if (body.includes(phrase)) failures.push(`${file} contains forbidden local wiring phrase: ${phrase}`);
  }
  const liquidityProbeSource = readFileSync('apps/web/app/liquidity/components/LiquidityEngineProbe.tsx', 'utf8');

  for (const marker of ['liquidityActionGrid', 'Jupiter route preview', '/api/execution-quote', 'liquidityPoolTable', 'liquidityLpTable', 'Execution gates', '/api/terminal/snapshot?', 'Canonical route: /api/terminal/snapshot', 'not-applicable-position-model']) {
    if (!liquidityProbeSource.includes(marker)) failures.push(`LiquidityEngineProbe missing live liquidity marker: ${marker}`);
  }
  for (const forbidden of ['/api/token-pool-index?mint=', '/api/lp-lock-burn-scanner?mint=']) {
    if (liquidityProbeSource.includes(forbidden)) failures.push(`LiquidityEngineProbe bypasses canonical liquidity snapshot with direct fetch: ${forbidden}`);
  }

  const terminalTabsSource = readFileSync('apps/web/app/sniper/components/TerminalInfoBooth.tsx', 'utf8');
  const tradingTokenLoader = readFileSync('apps/web/app/sniper/components/TradingTokenLoader.tsx', 'utf8');
  const executionDockSource = readFileSync('apps/web/app/sniper/components/ExecutionDock.tsx', 'utf8');
  const terminalHolderRequired = [
    "activeTab === 'Holders' && <HoldersTab",
    'holders?.rows',
    'holdersIntelTable',
    'provider-limited/read-only'
  ];
  for (const needle of terminalHolderRequired) {
    if (!terminalTabsSource.includes(needle)) failures.push(`TerminalInfoBooth missing single Holders tab marker: ${needle}`);
  }
  if (terminalTabsSource.includes('terminalViewerHolderSection')) failures.push('TerminalInfoBooth still renders separate holder section outside Holders tab');
  if (terminalTabsSource.includes('Loading market view')) failures.push('TerminalInfoBooth still renders old loading market view ribbon copy');
  const holdersPanelStart = terminalTabsSource.indexOf('function HoldersTab');
  const topTradersPanelStart = terminalTabsSource.indexOf('function TopTradersTab');
  const holdersPanelBody = holdersPanelStart >= 0 && topTradersPanelStart > holdersPanelStart ? terminalTabsSource.slice(holdersPanelStart, topTradersPanelStart) : '';
  if (holdersPanelBody.includes('RowsTable')) failures.push('Holders tab still renders metric summary instead of wallet list first');
  if (tradingTokenLoader.includes('tokenLoaderIntelRebuild')) failures.push('TradingTokenLoader still renders separate holder list above terminal viewer');
  for (const deleted of ['tokenInfoRiskStrip', 'terminalTokenStatsDeck', 'clusterMetricGrid', 'Top 10 H.', 'Fresh H.', 'Compact scan']) {
    if (tradingTokenLoader.includes(deleted)) failures.push(`TradingTokenLoader still contains deleted old token stats section marker: ${deleted}`);
  }
  const globalCss = readFileSync('apps/web/app/globals.css', 'utf8');
  for (const deleted of ['tokenInfoRiskStrip', 'terminalTokenStatsDeck', 'clusterMetricGrid', 'miniTraderList']) {
    if (globalCss.includes(deleted)) failures.push(`globals.css still contains deleted old token stats section style: ${deleted}`);
  }
  const holdersTabIndex = terminalTabsSource.indexOf("activeTab === 'Holders' && <HoldersTab");
  const holderPanelIndex = terminalTabsSource.indexOf('function HoldersTab');
  if (holdersTabIndex === -1 || holderPanelIndex === -1) failures.push('Holder wallet list must be owned by the Holders tab only');


  for (const marker of ['terminalTradeOnlyPanel', 'terminalWalletDropdownRow', 'primaryWalletDropdownButton', 'terminalWalletDropdown', 'primaryBuySellBar', 'tradeInputGrid', 'amountUnitSwitch', 'instantTradePanelButton', 'instantTradePopover', 'instantPresetGrid', 'quickTradeWalletList', 'axiomModeTabs', 'axiomAmountBox', 'axiomSettingsRow', 'axiomRouteLine', 'axiomActionRow', 'selectedBundleWallets', 'Connected browser wallet']) {
    if (!executionDockSource.includes(marker)) failures.push(`ExecutionDock missing trade-only panel marker: ${marker}`);
  }

  if (executionDockSource.includes('presetDockCard')) failures.push('ExecutionDock still renders old separate quick buy/sell preset card');
  for (const deleted of ['ticketPanelTabs', 'ticketWalletSelectCard', 'ticketMultiWalletStrip', "ticketPanel === 'Wallets'", "setTicketPanel("]) {
    if (executionDockSource.includes(deleted)) failures.push(`ExecutionDock still contains old trade/wallet tab model: ${deleted}`);
  }

  const requiredTerminalTabWiring = [
    'data-contract="terminal-snapshot-v1"',
    'data-live-execution="disabled"',
    'terminalInfoBooth axiomIntelBooth',
    'axiomIntelHeaderStats',
    'axiomIntelTabs',
    "window.addEventListener('meridian-terminal-refresh'",
    'new EventSource(`/api/terminal/stream?',
    'fetch(`/api/terminal/snapshot?',
    'snapshot?.trades?.rows',
    'holders?.rows',
    'market.priceUsd',
    'market.marketCapUsd',
    'market.liquidityUsd',
    'liquidity.liquidityUsd',
    'valueUsd',
    'avgEntryUsd',
    'avgExitUsd',
    'totalPnlUsd',
    'holdersIntelTable',
    'tradersIntelTable',
    'positionsIntelTable',
    'ordersIntelTable',
    'devTokensIntelTable',
    'trackedIntelTable',
    'instantTradeIntelSurface',
    'checklistIntelSurface',
    'need tape',
    'provider-limited/read-only',
    'snapshot?.devTokens?.wallets'
  ];
  for (const phrase of requiredTerminalTabWiring) {
    if (!terminalTabsSource.includes(phrase)) failures.push(`TerminalInfoBooth missing bottom-tab backend wiring: ${phrase}`);
  }
  for (const forbidden of [
    'No silent UI simulation',
    'backend reports missing route until implemented',
    'Collect preview',
    '/api/token-stats?',
    '/api/token-market-feed?',
    '/api/token-transactions?',
    '/api/indexer-health',
    '/api/bundle-clustering-index?',
    '/api/fresh-wallet-classifier?',
    '/api/dev-sold-classifier?',
    '/api/lp-lock-burn-scanner?',
    '/api/terminal-backend?'
  ]) {
    if (terminalTabsSource.includes(forbidden)) failures.push(`TerminalInfoBooth still contains scattered/disconnected fetch: ${forbidden}`);
  }

  const canonicalSnapshot = JSON.parse(await fetchText('/api/terminal/snapshot?mint=So11111111111111111111111111111111111111112&holderLimit=10&limit=10&smoke=1'));
  if (canonicalSnapshot.contract !== 'terminal-snapshot-v1') failures.push('/api/terminal/snapshot missing terminal-snapshot-v1 contract');
  if (!Array.isArray(canonicalSnapshot.holders?.rows)) failures.push('/api/terminal/snapshot missing holders.rows');
  if (!Array.isArray(canonicalSnapshot.trades?.rows)) failures.push('/api/terminal/snapshot missing trades.rows');
  if (!Array.isArray(canonicalSnapshot.trades?.topTraders)) failures.push('/api/terminal/snapshot missing trades.topTraders');
  if (!canonicalSnapshot.sourceStatus?.liquidity) failures.push('/api/terminal/snapshot missing sourceStatus.liquidity');
  if (!canonicalSnapshot.sourceStatus?.market) failures.push('/api/terminal/snapshot missing sourceStatus.market');
  if (!canonicalSnapshot.normalized?.canonicalLiquidity?.sourceStatus) failures.push('/api/terminal/snapshot missing normalized canonical liquidity source metadata');

  const terminal = JSON.parse(await fetchText('/api/terminal-backend'));
  if (!['ok', 'partial'].includes(terminal.status)) failures.push('/api/terminal-backend status must be ok or partial with sourceStatus metadata');
  if (!terminal.sourceStatus?.capabilities) failures.push('/api/terminal-backend missing sourceStatus.capabilities');
  if (!terminal.sourceStatus?.providerReadiness) failures.push('/api/terminal-backend missing sourceStatus.providerReadiness');
  if (!terminal.execution?.orderEngine) failures.push('/api/terminal-backend missing execution.orderEngine');
  if (!terminal.execution?.walletOps) failures.push('/api/terminal-backend missing execution.walletOps');
  if (!terminal.execution?.deployment) failures.push('/api/terminal-backend missing execution.deployment');
  if (!terminal.execution?.terminalOrders) failures.push('/api/terminal-backend missing execution.terminalOrders');
  if (!terminal.execution?.bundleSequencer) failures.push('/api/terminal-backend missing execution.bundleSequencer');
  const engineText = JSON.stringify(terminal.execution?.orderEngine ?? {});
  for (const bad of ['not-implemented', 'sequencer-missing', 'no-backend-route', 'no-open-order-store']) {
    if (engineText.includes(bad)) failures.push(`/api/terminal-backend orderEngine still reports ${bad}`);
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('whole-site hardwire check ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
