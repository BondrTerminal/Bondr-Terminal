'use client';

import { VersionedTransaction } from '@solana/web3.js';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

type MarketFeed = {
  sources?: {
    jupiter?: { status: string; routeLabels: string[]; priceImpactPct: string | null; outAmount: string | null; note?: string };
    raydium?: { status: string; pairCount: number };
    pumpswap?: { status: string; pairCount: number };
  };
  transactions?: { m5: { buys: number; sells: number }; h1: { buys: number; sells: number }; h24: { buys: number; sells: number } };
};

type ExecutionQuote = {
  status?: string;
  error?: string;
  observedAt?: string;
  execution?: string;
  request?: { side: string; amount: number; spendAsset: string; slippageBps: number; inputMint: string; outputMint: string };
  quote?: { outAmount: string | null; priceImpactPct: string | null; routeLabels: string[]; routePlanLength: number; contextSlot: number | null };
  safety?: string;
};

type SwapBuild = ExecutionQuote & {
  liveTradingEnabled?: boolean;
  swap?: { swapTransaction?: string; lastValidBlockHeight?: number | null; computeUnitLimit?: number | null; prioritizationFeeLamports?: number | null; simulationError?: unknown };
};

type BrowserSolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
};

type BrowserWindowWithSolana = Window & { solana?: BrowserSolanaProvider };

type ExecutionCapabilities = {
  liveTradingEnabled: boolean;
  disabledReason?: string | null;
  limits?: { maxSolPerSwap: number; maxUsdcPerSwap: number; maxSlippageBps: number };
};

const buyPresets = [['0.05', 'Scout'], ['0.10', 'Starter'], ['0.25', 'Build'], ['0.50', 'Support']];
const sellPresets = [['10%', 'Trim'], ['25%', 'De-risk'], ['50%', 'Recover'], ['100%', 'Exit']];
const ticketModes = ['Market', 'Limit', 'Take Profit', 'Stop Loss', 'Bundle'] as const;
type TicketMode = (typeof ticketModes)[number];
type TicketSide = 'Buy' | 'Sell';
type DockWallet = { id: string; address: string; role: string; balanceSol: number; purpose?: string; scope?: string };
type SizeUnit = 'SOL' | '%';

function formatImpact(value?: string | null) {
  if (!value) return 'impact —';
  const n = Number(value);
  if (Number.isNaN(n)) return `impact ${value}`;
  return `impact ${(n * 100).toFixed(2)}%`;
}

function routeLabel(feed: MarketFeed | null) {
  const labels = feed?.sources?.jupiter?.routeLabels ?? [];
  if (labels.length) return labels.slice(0, 2).join(' / ');
  const status = feed?.sources?.jupiter?.status;
  if (status) return status;
  return 'quote pending';
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}


function compactWallet(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function WalletSelectorPanel({ wallets, selectedWalletId, bundleWalletIds, walletPublicKey, selectedWalletLabel, mode, onSelect, onToggleBundle, onConnect }: { wallets: DockWallet[]; selectedWalletId: string; bundleWalletIds: string[]; walletPublicKey: string | null; selectedWalletLabel: string; mode: TicketMode; onSelect: (id: string) => void; onToggleBundle: (id: string) => void; onConnect: () => void }) {
  const selectedWallet = wallets.find((wallet) => wallet.id === selectedWalletId) ?? wallets[0] ?? null;
  const selectedBundleCount = wallets.filter((wallet) => bundleWalletIds.includes(wallet.id)).length;
  return <div className="orderTicketWalletPanel" aria-label="Order ticket wallet selector">
    <div className="ticketWalletSummary">
      <div><span>Selected wallet</span><strong>{selectedWallet ? `${selectedWallet.role} · ${compactWallet(selectedWallet.address)}` : selectedWalletLabel}</strong></div>
      <small>{mode === 'Bundle' ? `${selectedBundleCount} selected` : 'Primary wallet'}</small>
    </div>
    <div className="ticketWalletList" role="radiogroup" aria-label="Select trading wallet">
      {wallets.map((wallet) => {
        const selected = selectedWalletId === wallet.id;
        const bundled = bundleWalletIds.includes(wallet.id);
        return <div className={`ticketWalletRow ${selected ? 'selectedTicketWallet' : ''}`} key={wallet.id}>
          <button type="button" className="ticketWalletSelectButton" role="radio" aria-checked={selected} onClick={() => onSelect(wallet.id)}>
            <span className="ticketWalletRadio" aria-hidden />
            <span className="ticketWalletIdentity"><strong>{wallet.role}</strong><em>{compactWallet(wallet.address)}</em></span>
            <span className="ticketWalletBalance">{wallet.balanceSol.toFixed(4)} SOL</span>
          </button>
          <label className="ticketBundleToggle"><input type="checkbox" checked={bundled} onChange={() => onToggleBundle(wallet.id)} /> Bundle</label>
        </div>;
      })}
      {wallets.length === 0 && <div className="ticketWalletEmpty"><strong>No project wallets loaded</strong><span>{selectedWalletLabel}</span></div>}
    </div>
    <div className="ticketSignerRow"><span>Signer</span><strong>{walletPublicKey ? compactWallet(walletPublicKey) : 'Not connected'}</strong><button className="button secondary smallButton" type="button" onClick={onConnect}>{walletPublicKey ? 'Reconnect' : 'Connect'}</button></div>
  </div>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

export function ExecutionDock({ mint, selectedWalletLabel, wallets = [] }: { mint?: string; selectedWalletLabel: string; wallets?: DockWallet[] }) {
  const [feed, setFeed] = useState<MarketFeed | null>(null);
  const [activeMint, setActiveMint] = useState(mint ?? '');
  const [mode, setMode] = useState<TicketMode>('Market');
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('SOL');
  const [instantSide, setInstantSide] = useState<TicketSide>('Buy');
  const [multiWalletOpen, setMultiWalletOpen] = useState(false);
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [quickPanelPosition, setQuickPanelPosition] = useState({ x: 1120, y: 190 });
  const [instantEditMode, setInstantEditMode] = useState(false);
  const [instantBuyPresets, setInstantBuyPresets] = useState<[string, string][]>(() => buyPresets.map(([presetAmount, label]) => [presetAmount, label]));
  const [instantSellPresets, setInstantSellPresets] = useState<[string, string][]>(() => sellPresets.map(([presetAmount, label]) => [presetAmount, label]));
  const quickPanelDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState(wallets[0]?.id ?? 'browser-wallet');
  const [bundleWalletIds, setBundleWalletIds] = useState(() => wallets.slice(0, Math.min(4, wallets.length)).map((wallet) => wallet.id));
  const [side, setSide] = useState<TicketSide>('Buy');
  const [amount, setAmount] = useState('0.05');
  const [spendAsset, setSpendAsset] = useState('SOL');
  const [slippage, setSlippage] = useState('Auto');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [priorityFee, setPriorityFee] = useState('Auto');
  const [mevProtection, setMevProtection] = useState('Off');
  const [quote, setQuote] = useState<ExecutionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<ExecutionCapabilities | null>(null);

  useEffect(() => {
    setActiveMint(mint ?? '');
  }, [mint]);

  useEffect(() => {
    if (!wallets.length) return;
    setSelectedWalletId((current) => wallets.some((wallet) => wallet.id === current) ? current : wallets[0].id);
    setBundleWalletIds((current) => current.length ? current.filter((id) => wallets.some((wallet) => wallet.id === id)) : wallets.slice(0, Math.min(4, wallets.length)).map((wallet) => wallet.id));
  }, [wallets]);

  useEffect(() => {
    function onTokenLoaded(event: Event) {
      const custom = event as CustomEvent<{ mint?: string }>;
      if (custom.detail?.mint) setActiveMint(custom.detail.mint);
    }
    function onTicketSide(event: Event) {
      const custom = event as CustomEvent<{ side?: TicketSide }>;
      if (custom.detail?.side === 'Buy' || custom.detail?.side === 'Sell') setSide(custom.detail.side);
    }
    window.addEventListener('meridian-token-loaded', onTokenLoaded);
    window.addEventListener('meridian-ticket-side', onTicketSide);
    return () => {
      window.removeEventListener('meridian-token-loaded', onTokenLoaded);
      window.removeEventListener('meridian-ticket-side', onTicketSide);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/execution-capabilities', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setCapabilities(payload as ExecutionCapabilities | null))
      .catch(() => setCapabilities(null));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!activeMint) return;
    const controller = new AbortController();
    setFeed(null);
    void fetch(`/api/token-market-feed?mint=${encodeURIComponent(activeMint)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setFeed(payload as MarketFeed | null))
      .catch(() => setFeed(null));
    return () => controller.abort();
  }, [activeMint]);

  function startQuickPanelDrag(event: ReactMouseEvent<HTMLDivElement>) {
    quickPanelDragRef.current = {
      offsetX: event.clientX - quickPanelPosition.x,
      offsetY: event.clientY - quickPanelPosition.y
    };
    event.preventDefault();
  }

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (!quickPanelDragRef.current) return;
      const nextX = Math.min(Math.max(12, event.clientX - quickPanelDragRef.current.offsetX), window.innerWidth - 340);
      const nextY = Math.min(Math.max(12, event.clientY - quickPanelDragRef.current.offsetY), window.innerHeight - 120);
      setQuickPanelPosition({ x: nextX, y: nextY });
    }
    function onUp() {
      quickPanelDragRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  function updateInstantPreset(index: number, field: 'amount' | 'label', value: string) {
    const setter = instantSide === 'Buy' ? setInstantBuyPresets : setInstantSellPresets;
    setter((current) => current.map((preset, presetIndex) => presetIndex === index ? (field === 'amount' ? [value, preset[1]] : [preset[0], value]) : preset));
  }

  async function previewQuote() {
    if (!activeMint || quoteLoading) return;
    setQuoteLoading(true);
    setQuote(null);
    try {
      const response = await fetch('/api/execution-quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint: activeMint, side, amount, spendAsset, slippageBps: slippage, mode })
      });
      const payload = await response.json() as ExecutionQuote;
      setQuote(response.ok ? payload : { ...payload, status: 'error' });
    } catch (error) {
      setQuote({ status: 'error', error: error instanceof Error ? error.message : 'Quote preview failed.' });
    } finally {
      setQuoteLoading(false);
    }
  }

  const selectedDockWallet = wallets.find((wallet) => wallet.id === selectedWalletId) ?? wallets[0] ?? null;
  const selectedBundleWallets = wallets.filter((wallet) => bundleWalletIds.includes(wallet.id));
  const selectedExecutionAddress = selectedDockWallet?.address ?? walletPublicKey;

  function toggleBundleWallet(id: string) {
    setBundleWalletIds((current) => current.includes(id) ? current.filter((walletId) => walletId !== id) : [...current, id]);
  }

  async function connectBrowserWallet(): Promise<string | null> {
    const provider = (window as BrowserWindowWithSolana).solana;
    if (!provider) {
      setLiveMessage('No Solana browser wallet detected. Install Phantom or another Solana wallet.');
      return null;
    }
    const connected = await provider.connect();
    const key = connected.publicKey.toString();
    setWalletPublicKey(key);
    return key;
  }

  async function createStoredOrder() {
    if (!activeMint || liveLoading) return;
    setLiveLoading(true);
    setLiveMessage(null);
    try {
      const publicKey = selectedExecutionAddress ?? walletPublicKey ?? await connectBrowserWallet();
      if (!publicKey) return;
      const kind = mode === 'Limit' ? 'limit' : mode === 'Take Profit' ? 'take-profit' : mode === 'Stop Loss' ? 'stop-loss' : 'market';
      const response = await fetch('/api/terminal-order-engine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', mint: activeMint, wallet: publicKey, side, kind, amount, spendAsset, slippageBps: slippage, triggerPriceUsd: triggerPrice })
      });
      const payload = await response.json() as { order?: { id?: string }; error?: string; execution?: string };
      if (!response.ok) {
        setLiveMessage(payload.error ?? 'Order create failed.');
        return;
      }
      setLiveMessage(`Order stored: ${payload.order?.id ?? payload.execution ?? 'created'}`);
      window.dispatchEvent(new CustomEvent('meridian-terminal-refresh'));
    } catch (error) {
      setLiveMessage(error instanceof Error ? error.message : 'Order create failed.');
    } finally {
      setLiveLoading(false);
    }
  }

  async function buildBundlePreflight() {
    if (!activeMint || liveLoading) return;
    setLiveLoading(true);
    setLiveMessage(null);
    try {
      const publicKey = selectedExecutionAddress ?? walletPublicKey ?? await connectBrowserWallet();
      if (!publicKey) return;
      const legs = (selectedBundleWallets.length ? selectedBundleWallets : [{ address: publicKey }]).map((wallet) => ({ wallet: wallet.address, side, amount, spendAsset, slippageBps: slippage }));
      const response = await fetch('/api/bundle-sequencer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'preflight', mint: activeMint, legs })
      });
      const payload = await response.json() as { error?: string; execution?: string; reason?: string };
      if (!response.ok) {
        setLiveMessage(payload.error ?? payload.reason ?? 'Bundle preflight failed.');
        return;
      }
      setLiveMessage(`Bundle preflight: ${payload.execution ?? 'ok'}`);
      window.dispatchEvent(new CustomEvent('meridian-terminal-refresh'));
    } catch (error) {
      setLiveMessage(error instanceof Error ? error.message : 'Bundle preflight failed.');
    } finally {
      setLiveLoading(false);
    }
  }

  async function signAndSendSwap() {
    if (!capabilities?.liveTradingEnabled) {
      setLiveMessage(capabilities?.disabledReason ?? 'Live trading is disabled server-side.');
      return;
    }
    if (!activeMint || liveLoading) return;
    setLiveLoading(true);
    setLiveMessage(null);
    try {
      const provider = (window as BrowserWindowWithSolana).solana;
      const publicKey = walletPublicKey ?? await connectBrowserWallet();
      if (!provider || !publicKey) return;
      if (selectedDockWallet && publicKey !== selectedDockWallet.address) {
        setLiveMessage(`Connected browser wallet ${publicKey.slice(0, 4)}…${publicKey.slice(-4)} does not match selected ticket wallet ${selectedDockWallet.address.slice(0, 4)}…${selectedDockWallet.address.slice(-4)}.`);
        return;
      }

      const buildResponse = await fetch('/api/execution-swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint: activeMint, side, amount, spendAsset, slippageBps: slippage, userPublicKey: publicKey })
      });
      const build = await buildResponse.json() as SwapBuild;
      if (!buildResponse.ok || !build.swap?.swapTransaction) {
        setLiveMessage(build.error ?? 'Swap transaction build failed.');
        return;
      }

      const transaction = VersionedTransaction.deserialize(base64ToBytes(build.swap.swapTransaction));
      const signed = await provider.signTransaction(transaction);
      const signedTransaction = bytesToBase64(signed.serialize());
      const sendResponse = await fetch('/api/send-signed-transaction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedTransaction })
      });
      const sent = await sendResponse.json() as { signature?: string; explorerUrl?: string; error?: string };
      if (!sendResponse.ok || !sent.signature) {
        setLiveMessage(sent.error ?? 'Signed transaction broadcast failed.');
        return;
      }
      setLiveMessage(`Sent: ${sent.signature}`);
    } catch (error) {
      setLiveMessage(error instanceof Error ? error.message : 'Live swap failed or was rejected.');
    } finally {
      setLiveLoading(false);
    }
  }

  const jupiter = feed?.sources?.jupiter;
  const latestQuote = quote?.quote;
  const estimate = latestQuote?.outAmount ? `est. ${latestQuote.outAmount}` : jupiter?.outAmount ? `est. ${jupiter.outAmount}` : `est. ${routeLabel(feed)}`;
  const impact = formatImpact(latestQuote?.priceImpactPct ?? jupiter?.priceImpactPct);
  const route = latestQuote?.routeLabels?.length ? latestQuote.routeLabels.slice(0, 2).join(' / ') : routeLabel(feed);
  const txWindow = feed?.transactions?.m5 ? `${feed.transactions.m5.buys}/${feed.transactions.m5.sells} 5m` : 'tx —';
  const ticketSummary = `${mode} ${side.toLowerCase()} · ${amount || '0'} ${side === 'Buy' ? spendAsset : 'position'} · ${slippage} slip`;
  const canPreview = Boolean(activeMint && amount && !quoteLoading);
  const canLiveSwap = Boolean(capabilities?.liveTradingEnabled && activeMint && amount && !liveLoading);
  const canCreateOrder = Boolean(activeMint && amount && !liveLoading && (mode === 'Market' || mode === 'Bundle' || triggerPrice));
  const walletLabel = selectedDockWallet ? `${selectedDockWallet.role} · ${selectedDockWallet.address.slice(0, 4)}…${selectedDockWallet.address.slice(-4)}` : walletPublicKey ? `${walletPublicKey.slice(0, 4)}…${walletPublicKey.slice(-4)}` : 'Connect wallet';
  const bundleCount = selectedBundleWallets.length;
  const multiWalletSelected = bundleCount > 1;
  const selectedWalletBalance = selectedDockWallet ? `${selectedDockWallet.balanceSol.toFixed(4)} SOL` : walletPublicKey ? compactWallet(walletPublicKey) : 'connect signer';
  const selectedBundleBalance = selectedBundleWallets.reduce((sum, wallet) => sum + wallet.balanceSol, 0);
  const walletBalanceLabel = multiWalletSelected ? `Total ${selectedBundleBalance.toFixed(4)} SOL` : selectedWalletBalance;
  const walletModeLabel = multiWalletSelected ? `${bundleCount} wallets selected` : 'Primary wallet';

  return (
    <aside className="executionDock premiumExecutionDock">
      <section className="dockCard orderTicketCard premiumOrderCard">
        <div className="dockHeader tradingPanelHeader"><span>Trading panel</span><strong>{side} · {mode}</strong></div>
        <div className="axiomOrderTicket terminalTradeOnlyPanel">
          <div className="terminalWalletDropdownRow">
            <div className="primaryWalletDropdownWrap">
              <button className={`primaryWalletDropdownButton ${multiWalletOpen ? 'walletDropdownOpen' : ''}`} type="button" onClick={() => setMultiWalletOpen((open) => !open)} aria-expanded={multiWalletOpen} aria-label="Open trading wallet selector">
                <span className="walletDropdownEyebrow">Wallets</span>
                <em aria-hidden>▾</em>
              </button>
              <div className="selectedWalletStatusLine" aria-label="Selected trading wallet status">
                <span>{walletModeLabel}</span>
                <strong>{walletLabel}</strong>
                <small>{walletBalanceLabel}</small>
              </div>
              {multiWalletOpen && <div className="terminalWalletDropdown" aria-label="Select trading wallets">
                <div className="terminalWalletDropdownHead"><span>Trading wallets</span><strong>{bundleCount || 1} selected</strong></div>
                {wallets.slice(0, 10).map((wallet) => {
                  const selected = selectedWalletId === wallet.id;
                  const bundled = bundleWalletIds.includes(wallet.id);
                  return <div className={`terminalWalletDropdownItem ${selected ? 'selectedPrimaryWallet' : ''} ${bundled ? 'selectedBundleWallet' : ''}`} key={wallet.id}>
                    <button type="button" onClick={() => setSelectedWalletId(wallet.id)}><strong>{wallet.role}</strong><small>{compactWallet(wallet.address)} · {wallet.balanceSol.toFixed(4)} SOL</small></button>
                    <label><input type="checkbox" checked={bundled} onChange={() => toggleBundleWallet(wallet.id)} /> Multi</label>
                  </div>;
                })}
                {!wallets.length && <div className="multiWalletEmpty">No wallets loaded</div>}
                <button className="terminalWalletSignerButton" type="button" onClick={() => void connectBrowserWallet()}>{walletPublicKey ? `Signer ${compactWallet(walletPublicKey)}` : 'Connect signer'}</button>
              </div>}
            </div>
            <button className={capabilities?.liveTradingEnabled ? 'axiomLiveBadge' : 'axiomGateBadge'} type="button">{capabilities?.liveTradingEnabled ? 'Live' : 'Gated'}</button>
          </div>

          <div className={`tradeActionBar primaryBuySellBar ${side === 'Sell' ? 'sellSelected' : 'buySelected'}`}>
            <button type="button" onClick={() => { setSide('Buy'); setInstantSide('Buy'); setSizeUnit('SOL'); }}>Buy</button>
            <button type="button" onClick={() => { setSide('Sell'); setInstantSide('Sell'); setSizeUnit('%'); }}>Sell</button>
          </div>

          <div className="tradeInputGrid" aria-label="Fast order sizes">
            {(side === 'Buy' ? buyPresets : sellPresets).map(([presetAmount, label]) => <button type="button" className={amount === presetAmount ? 'activeTradeInputSlot' : ''} onClick={() => { setAmount(presetAmount); setSizeUnit(presetAmount.includes('%') ? '%' : 'SOL'); }} key={`slot-${side}-${presetAmount}`}><strong>{presetAmount}</strong><span>{label}</span></button>)}
          </div>

          <div className="amountUnitRow">
            <div className="axiomAmountBox compactAmountBox focusedAmountBox">
              <label><span>{side === 'Buy' ? 'Spend' : 'Sell size'}</span><input placeholder={sizeUnit === '%' ? '0%' : '0.00'} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            </div>
            <div className="amountUnitSwitch"><button type="button" className={sizeUnit === 'SOL' ? 'activeAmountUnit' : ''} onClick={() => { setSizeUnit('SOL'); setSpendAsset('SOL'); }}>SOL</button><button type="button" className={sizeUnit === '%' ? 'activeAmountUnit' : ''} onClick={() => setSizeUnit('%')}>%</button></div>
          </div>

          <div className="quickTradePopoverWrap instantTradePanelWrap">
            <button className="quickTradePopoverButton instantTradePanelButton" type="button" onClick={() => setQuickPanelOpen((open) => !open)}><span>Instant trade</span></button>
            {quickPanelOpen && <div className="quickTradePopover instantTradePopover floatingInstantTerminal" style={{ left: quickPanelPosition.x, top: quickPanelPosition.y }} aria-label="Instant trade mini terminal">
              <div className="floatingInstantTerminalHeader" onMouseDown={startQuickPanelDrag}><span>Instant trade</span><strong>Drag mini terminal</strong><button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={() => setInstantEditMode((editing) => !editing)}>{instantEditMode ? 'Done' : 'Edit'}</button><button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={() => setQuickPanelOpen(false)} aria-label="Close instant trade panel">×</button></div>
              <div className={`quickTradeSideBar ${instantSide === 'Sell' ? 'sellSelected' : 'buySelected'}`}><button type="button" onClick={() => { setInstantSide('Buy'); setSide('Buy'); setSizeUnit('SOL'); }}>Buy</button><button type="button" onClick={() => { setInstantSide('Sell'); setSide('Sell'); setSizeUnit('%'); }}>Sell</button></div>
              <div className="instantSettingsGrid" aria-label="Instant trade settings">
                <label><span>Slippage</span><input value={slippage} onChange={(event) => setSlippage(event.target.value)} /></label>
                <label><span>Priority</span><input value={priorityFee} onChange={(event) => setPriorityFee(event.target.value)} /></label>
                <label><span>MEV</span><select value={mevProtection} onChange={(event) => setMevProtection(event.target.value)}><option>Off</option><option>Jito</option><option>Private</option></select></label>
              </div>
              {!instantEditMode && <div className="instantPresetGrid">{(instantSide === 'Buy' ? instantBuyPresets : instantSellPresets).map(([presetAmount, label], index) => <button type="button" onClick={() => { setSide(instantSide); setAmount(presetAmount); setSizeUnit(presetAmount.includes('%') ? '%' : 'SOL'); }} key={`instant-${instantSide}-${index}`}><strong>{presetAmount}</strong><span>{label}</span></button>)}</div>}
              {instantEditMode && <div className="instantPresetEditor" aria-label="Edit instant trade presets">{(instantSide === 'Buy' ? instantBuyPresets : instantSellPresets).map(([presetAmount, label], index) => <div className="instantPresetEditorRow" key={`instant-edit-${instantSide}-${index}`}><label><span>Amount</span><input value={presetAmount} onChange={(event) => updateInstantPreset(index, 'amount', event.target.value)} /></label><label><span>Label</span><input value={label} onChange={(event) => updateInstantPreset(index, 'label', event.target.value)} /></label></div>)}</div>}
              <div className="quickTradeWalletBlock"><div className="quickTradePopoverHeader"><span>Wallets</span><strong>{bundleCount || 1} selected</strong></div><div className="quickTradeWalletList">{wallets.slice(0, 8).map((wallet) => <label className={bundleWalletIds.includes(wallet.id) ? 'activeMultiWallet' : ''} key={`instant-wallet-${wallet.id}`}><input type="checkbox" checked={bundleWalletIds.includes(wallet.id)} onChange={() => toggleBundleWallet(wallet.id)} /><span><strong>{wallet.role}</strong><small>{compactWallet(wallet.address)} · {wallet.balanceSol.toFixed(4)} SOL</small></span></label>)}{!wallets.length && <em>No wallets loaded</em>}</div></div>
            </div>}
          </div>

          <div className="compactTicketMatrix executionSettingsMatrix">
            <div className="axiomModeTabs compactModeTabs">{ticketModes.map((ticketMode) => <button type="button" className={mode === ticketMode ? 'activeTicketMode' : ''} onClick={() => setMode(ticketMode)} key={ticketMode}>{ticketMode === 'Take Profit' ? 'TP' : ticketMode === 'Stop Loss' ? 'SL' : ticketMode}</button>)}</div>
            <div className="axiomSettingsRow compactSettingsRow">
              <label><span>Slippage</span><input value={slippage} onChange={(event) => setSlippage(event.target.value)} /></label>
              {mode !== 'Market' && mode !== 'Bundle' && <label><span>Trigger</span><input value={triggerPrice} onChange={(event) => setTriggerPrice(event.target.value)} placeholder="price" /></label>}
              <label><span>Priority</span><input value={priorityFee} onChange={(event) => setPriorityFee(event.target.value)} /></label>
              <label><span>MEV</span><select value={mevProtection} onChange={(event) => setMevProtection(event.target.value)}><option>Off</option><option>Jito</option><option>Private</option></select></label>
            </div>
          </div>

          <div className="axiomRouteLine compactRouteLine"><span>{estimate}</span><small>{impact} · {txWindow} · best available route</small></div>

          <div className="axiomActionRow">
            <button className="axiomPreviewButton" type="button" onClick={() => mode === 'Bundle' ? void buildBundlePreflight() : mode === 'Market' ? void previewQuote() : void createStoredOrder()} disabled={mode === 'Market' ? !canPreview : !canCreateOrder}>{quoteLoading ? 'Quoting' : mode === 'Bundle' ? 'Preflight' : mode === 'Market' ? 'Preview' : 'Create'}</button>
            <button className={`axiomExecuteButton ${side === 'Sell' ? 'sellExecute' : 'buyExecute'}`} type="button" onClick={() => mode === 'Market' ? void signAndSendSwap() : mode === 'Bundle' ? void buildBundlePreflight() : void createStoredOrder()} disabled={mode === 'Market' ? !canLiveSwap : !canCreateOrder}>{liveLoading ? 'Preparing' : mode === 'Market' ? (capabilities?.liveTradingEnabled ? side : 'Gated') : mode === 'Bundle' ? 'Bundle' : 'Store'}</button>
          </div>

          <div className="axiomTicketFooter"><button type="button" onClick={() => void connectBrowserWallet()}>{walletPublicKey ? 'Signer linked' : 'Connect signer'}</button><span>{quote?.status === 'ok' ? `${latestQuote?.routePlanLength ?? 0} hop route` : liveMessage ?? 'Ready'}</span></div>
          {quote?.error && <p className="orderTicketErrorLine">{quote.error}</p>}
          {liveMessage && <p className={liveMessage.startsWith('Sent:') ? 'orderTicketSuccessLine' : 'orderTicketErrorLine'}>{liveMessage}</p>}
        </div>
      </section>

    </aside>
  );
}
