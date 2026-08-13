'use client';

import { VersionedTransaction } from '@solana/web3.js';
import { useEffect, useMemo, useState } from 'react';
import type { TransactionPreview } from '../../../lib/transaction-preview';

type ExecutionQuote = {
  status?: string;
  error?: string;
  quote?: { outAmount: string | null; priceImpactPct: string | null; routeLabels: string[]; routePlanLength: number; contextSlot: number | null };
  transactionPreview?: TransactionPreview;
};

type SwapBuild = ExecutionQuote & {
  swap?: { swapTransaction?: string; lastValidBlockHeight?: number | null; simulationError?: unknown };
};

type SimulationPayload = { status?: string; error?: string; simulation?: { err?: unknown; logs?: string[]; unitsConsumed?: number | null; failureSummary?: string | null }; transactionPreview?: TransactionPreview };
type SignedSwapPayload = { signedTransaction: string; signature?: string; explorerUrl?: string; submitted?: boolean };

type BrowserSolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string; toBase58?: () => string };
  connect(): Promise<{ publicKey: { toString(): string; toBase58?: () => string } }>;
  signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type BrowserWindowWithSolana = Window & { solana?: BrowserSolanaProvider };

type ExecutionCapabilities = {
  liveTradingEnabled: boolean;
  signingEnabled?: boolean;
  broadcastEnabled?: boolean;
  requireSimulation?: boolean;
  readinessLevel?: string;
  disabledReason?: string | null;
  blockers?: string[];
  warnings?: string[];
  limits?: { maxSolPerSwap: number; maxUsdcPerSwap: number; maxSlippageBps: number };
  auth?: { configured?: boolean; authenticated?: boolean; reason?: string | null };
};

type TicketSide = 'Buy' | 'Sell';
type DockWallet = { id: string; address: string; role: string; balanceSol: number; purpose?: string; scope?: string };
type WalletTokenBalanceRow = { id?: string | null; wallet?: string | null; address?: string | null; role?: string | null; uiAmount?: number | null; valueUsd?: number | null; status?: string | null; balanceStatus?: string | null; source?: string | string[] | null };
type WalletTokenBalances = { status?: string; provider?: string | null; confidence?: string | null; note?: string | null; wallets?: WalletTokenBalanceRow[]; totals?: { uiAmount?: number | null } };

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function compact(address: string) { return address ? `${address.slice(0, 6)}…${address.slice(-5)}` : '—'; }
function base64ToBytes(value: string): Uint8Array { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i); return bytes; }
function bytesToBase64(bytes: Uint8Array): string { let binary = ''; const chunkSize = 0x8000; for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.slice(i, i + chunkSize)); return btoa(binary); }
function formatTokenAmount(value?: number | null) { const n = Number(value ?? 0); if (!Number.isFinite(n) || n === 0) return '0'; if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`; if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)}K`; return n.toLocaleString(undefined, { maximumFractionDigits: 6 }); }
function formatBalanceRow(row?: WalletTokenBalanceRow | null) { if (!row) return '—'; if (row.uiAmount == null || row.balanceStatus === 'provider-unavailable' || row.balanceStatus === 'error' || row.status === 'modeled-only') return String(row.balanceStatus ?? row.status ?? 'provider-limited'); return formatTokenAmount(row.uiAmount); }
function formatWalletSol(wallet: DockWallet) { const status = (wallet as DockWallet & { balanceStatus?: string }).balanceStatus; return status && status !== 'live' ? status.replace(/unavailable/g, 'provider-limited') : `${wallet.balanceSol.toFixed(4)} SOL`; }
function parseSlippage(value: string, fallback = 100) { const n = Number(String(value).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : fallback; }
function formatBps(value: string) { const bps = parseSlippage(value, 0); return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`; }
function formatPriceImpact(value?: string | null) { const n = Number(value ?? NaN); if (!Number.isFinite(n)) return '—'; const pct = Math.abs(n) <= 1 ? n * 100 : n; return `${pct.toFixed(Math.abs(pct) >= 10 ? 1 : 2)}%`; }
function formatQuoteAmount(value?: string | null) { if (!value) return '—'; const n = Number(value); return Number.isFinite(n) ? formatTokenAmount(n) : value; }

const SOL_AMOUNT_PRESETS = ['0.01', '0.05', '0.10', '0.25'];
const SELL_PERCENT_PRESETS = [25, 50, 75, 100];
const SLIPPAGE_PRESETS = [50, 100, 250, 500];
const PRIORITY_FEE_PRESETS = ['auto', 'low', 'fast', 'turbo'] as const;

function TransactionPreviewCard({ preview }: { preview?: TransactionPreview | null }) {
  if (!preview) return <div className="transactionPreviewCard emptyPreview"><div><span>Transaction preview</span><strong>No transaction built yet</strong></div><p>Build an unsigned transaction, then simulate before signing.</p></div>;
  return <div className={`transactionPreviewCard ${preview.status === 'blocked' ? 'blockedPreview' : preview.status === 'error' ? 'errorPreview' : 'okPreview'}`}>
    <div className="transactionPreviewHeader"><div><span>Transaction preview</span><strong>{preview.mode.replace('-', ' ')}</strong></div><em>{preview.action}</em></div>
    <div className="transactionPreviewGrid"><div><span>Signing</span><strong>{preview.signingEnabled ? 'Enabled' : 'Disabled'}</strong></div><div><span>Broadcast</span><strong>{preview.broadcastEnabled ? 'Enabled' : 'Disabled'}</strong></div><div><span>Simulation</span><strong>{preview.simulationStatus ?? 'not-run'}</strong></div><div><span>Route</span><strong>{preview.provider ?? preview.route ?? '—'}</strong></div></div>
    {preview.blockers.length > 0 && <ul className="transactionPreviewList blockers">{preview.blockers.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>}
    {preview.warnings.length > 0 && <ul className="transactionPreviewList warnings">{preview.warnings.slice(0, 2).map((item) => <li key={item}>{item}</li>)}</ul>}
  </div>;
}

export function ExecutionDock({ mint, selectedWalletLabel, wallets = [] }: { mint?: string; selectedWalletLabel: string; wallets?: DockWallet[] }) {
  const [activeMint, setActiveMint] = useState(mint ?? '');
  const [side, setSide] = useState<TicketSide>('Buy');
  const [amount, setAmount] = useState('0.01');
  const [spendAsset, setSpendAsset] = useState<'SOL' | 'USDC'>('SOL');
  const [slippage, setSlippage] = useState('100');
  const [priorityFeePreset, setPriorityFeePreset] = useState<(typeof PRIORITY_FEE_PRESETS)[number]>('auto');
  const [sellPercentPreset, setSellPercentPreset] = useState<number | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState(wallets[0]?.id ?? 'browser-wallet');
  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<ExecutionCapabilities | null>(null);
  const [tokenBalances, setTokenBalances] = useState<WalletTokenBalances | null>(null);
  const [quote, setQuote] = useState<ExecutionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapBuild, setSwapBuild] = useState<SwapBuild | null>(null);
  const [simulation, setSimulation] = useState<SimulationPayload | null>(null);
  const [signedSwap, setSignedSwap] = useState<SignedSwapPayload | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);

  useEffect(() => { setActiveMint(mint ?? ''); }, [mint]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/execution-capabilities', { signal: controller.signal }).then((response) => response.ok ? response.json() : null).then((payload) => setCapabilities(payload as ExecutionCapabilities | null)).catch(() => setCapabilities(null));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const provider = (window as BrowserWindowWithSolana).solana;
    const existing = provider?.publicKey?.toBase58?.() ?? provider?.publicKey?.toString?.() ?? null;
    if (existing) setWalletPublicKey(existing);
    const onAccount = (pubkey?: unknown) => {
      const next = typeof pubkey === 'object' && pubkey && 'toString' in pubkey && typeof pubkey.toString === 'function' ? pubkey.toString() : ((window as BrowserWindowWithSolana).solana?.publicKey?.toBase58?.() ?? (window as BrowserWindowWithSolana).solana?.publicKey?.toString?.() ?? null);
      setWalletPublicKey(next || null);
      if (next) {
        window.localStorage.setItem('bondr.activeWallet', next);
        window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address: next } }));
      }
    };
    const onActiveWalletChanged = (event: Event) => {
      const custom = event as CustomEvent<{ address?: string }>;
      const next = custom.detail?.address ?? window.localStorage.getItem('bondr.activeWallet') ?? null;
      if (next) setSelectedWalletId((current) => wallets.find((wallet) => wallet.address === next)?.id ?? current);
    };
    provider?.on?.('accountChanged', onAccount);
    window.addEventListener('bondr-active-wallet-changed', onActiveWalletChanged);
    return () => {
      provider?.off?.('accountChanged', onAccount);
      window.removeEventListener('bondr-active-wallet-changed', onActiveWalletChanged);
    };
  }, [wallets]);
  useEffect(() => {
    function onTokenLoaded(event: Event) { const custom = event as CustomEvent<{ mint?: string }>; if (custom.detail?.mint) setActiveMint(custom.detail.mint); }
    window.addEventListener('meridian-token-loaded', onTokenLoaded);
    return () => window.removeEventListener('meridian-token-loaded', onTokenLoaded);
  }, []);
  useEffect(() => {
    if (!wallets.length) return;
    setSelectedWalletId((current) => wallets.some((wallet) => wallet.id === current) ? current : wallets[0].id);
  }, [wallets]);
  useEffect(() => {
    if (!activeMint) { setTokenBalances(null); return; }
    const controller = new AbortController();
    void fetch(`/api/wallet-token-balances?mint=${encodeURIComponent(activeMint)}`, { signal: controller.signal, cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((payload) => setTokenBalances(payload as WalletTokenBalances | null)).catch(() => setTokenBalances(null));
    return () => controller.abort();
  }, [activeMint]);
  useEffect(() => { setSwapBuild(null); setSimulation(null); setSignedSwap(null); }, [activeMint, side, amount, spendAsset, slippage, selectedWalletId]);
  useEffect(() => { if (side === 'Buy') setSellPercentPreset(null); }, [side]);

  const selectedDockWallet = wallets.find((wallet) => wallet.id === selectedWalletId) ?? wallets[0] ?? null;
  const tokenBalanceByAddress = useMemo(() => new Map((tokenBalances?.wallets ?? []).map((row) => [String(row.address ?? row.wallet ?? '').toLowerCase(), row])), [tokenBalances]);
  const selectedTokenBalance = selectedDockWallet ? tokenBalanceByAddress.get(selectedDockWallet.address.toLowerCase()) ?? null : null;
  const selectedExecutionAddress = selectedDockWallet?.address ?? walletPublicKey;
  const selectedSignerMatched = Boolean(walletPublicKey && selectedDockWallet && walletPublicKey === selectedDockWallet.address);
  const signerMismatch = Boolean(walletPublicKey && selectedDockWallet && walletPublicKey !== selectedDockWallet.address);
  const operatorAuthRequired = Boolean(capabilities?.auth?.configured && !capabilities.auth.authenticated);
  const simulationPassed = simulation?.status === 'ok';
  const canPreview = Boolean(activeMint && amount && !quoteLoading);
  const canBuild = Boolean(capabilities?.liveTradingEnabled && activeMint && amount && !liveLoading && !operatorAuthRequired);
  const canSign = Boolean(capabilities?.signingEnabled && swapBuild?.swap?.swapTransaction && (capabilities.requireSimulation === false || simulationPassed) && walletPublicKey && !liveLoading && !signerMismatch);
  const canBroadcast = Boolean(capabilities?.broadcastEnabled && signedSwap?.signedTransaction && !signedSwap.submitted && !liveLoading);
  const inputMint = side === 'Buy' ? (spendAsset === 'USDC' ? USDC_MINT : SOL_MINT) : activeMint;
  const outputMint = side === 'Buy' ? activeMint : (spendAsset === 'USDC' ? USDC_MINT : SOL_MINT);
  const sameMintRoute = Boolean(inputMint && outputMint && inputMint === outputMint);
  const routeLabel = `${inputMint === SOL_MINT ? 'SOL' : inputMint === USDC_MINT ? 'USDC' : 'token'} → ${outputMint === SOL_MINT ? 'SOL' : outputMint === USDC_MINT ? 'USDC' : 'token'}`;
  const quoteRouteLabels = quote?.quote?.routeLabels ?? [];
  const routePlanLabel = quoteRouteLabels.length ? quoteRouteLabels.join(' / ') : routeLabel;
  const estimatedReceive = formatQuoteAmount(quote?.quote?.outAmount);
  const priceImpact = formatPriceImpact(quote?.quote?.priceImpactPct);
  const priorityFeeCopy = priorityFeePreset === 'auto' ? 'Auto / API default' : priorityFeePreset === 'low' ? 'Low fee intent' : priorityFeePreset === 'fast' ? 'Fast fee intent' : 'Turbo intent (UI only)';
  const blockReasons = [
    !activeMint ? 'token mint missing' : null,
    sameMintRoute ? 'same input/output mint' : null,
    !walletPublicKey ? 'Connect a Solana browser wallet.' : null,
    operatorAuthRequired ? 'Operator auth required.' : null,
    signerMismatch ? `Signing blocked: selected wallet ${selectedDockWallet ? compact(selectedDockWallet.address) : '—'} does not match connected signer ${walletPublicKey ? compact(walletPublicKey) : '—'}.` : null,
    !simulationPassed ? 'Simulation must pass before signing.' : null,
    capabilities?.broadcastEnabled === false ? 'broadcast disabled in A-profile' : null
  ].filter(Boolean) as string[];

  function applySellPercent(percent: number) {
    setSide('Sell');
    setSellPercentPreset(percent);
    const balance = selectedTokenBalance?.uiAmount;
    if (typeof balance === 'number' && Number.isFinite(balance) && balance > 0) {
      const nextAmount = balance * (percent / 100);
      setAmount(nextAmount.toFixed(nextAmount >= 1 ? 4 : 6).replace(/0+$/, '').replace(/\.$/, ''));
    } else {
      setLiveMessage(`${percent}% sell preset selected. Live token balance is unavailable, so enter the token amount manually before quote/build.`);
    }
  }

  async function connectBrowserWallet(): Promise<string | null> {
    const provider = (window as BrowserWindowWithSolana).solana;
    if (!provider) { setLiveMessage('No Solana browser wallet detected. Install Phantom or Solflare.'); return null; }
    const connected = await provider.connect();
    const key = connected.publicKey.toString();
    setWalletPublicKey(key);
    window.localStorage.setItem('bondr.activeWallet', key);
    window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address: key } }));
    return key;
  }

  async function previewQuote() {
    if (!canPreview) return;
    if (sameMintRoute) {
      const text = spendAsset === 'SOL' ? 'Quote route is SOL → SOL. Use USDC mint or another token mint before preview.' : 'Quote input and output mint are identical. Pick a different token mint or settlement asset.';
      setQuote({ status: 'error', error: text });
      setLiveMessage(text);
      return;
    }
    setQuoteLoading(true); setQuote(null); setLiveMessage(null);
    try {
      const response = await fetch('/api/execution-quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mint: activeMint, side, amount, spendAsset, slippageBps: parseSlippage(slippage), mode: 'Market' }) });
      const payload = await response.json() as ExecutionQuote;
      setQuote(response.ok ? payload : { ...payload, status: 'error' });
      if (!response.ok) setLiveMessage(payload.error ?? 'Quote failed.');
    } catch (error) { setQuote({ status: 'error', error: error instanceof Error ? error.message : 'Quote failed.' }); }
    finally { setQuoteLoading(false); }
  }

  async function buildAndSimulateSwap() {
    if (!capabilities?.liveTradingEnabled) { setLiveMessage(capabilities?.disabledReason ?? 'Unsigned transaction build is disabled.'); return; }
    if (!activeMint || liveLoading) return;
    setLiveLoading(true); setLiveMessage(null); setSwapBuild(null); setSimulation(null); setSignedSwap(null);
    try {
      const publicKey = walletPublicKey ?? await connectBrowserWallet();
      if (!publicKey) return;
      if (selectedDockWallet && publicKey !== selectedDockWallet.address) { setLiveMessage(`Connected signer ${compact(publicKey)} does not match selected wallet ${compact(selectedDockWallet.address)}.`); return; }
      const buildResponse = await fetch('/api/execution-swap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mint: activeMint, side, amount, spendAsset, slippageBps: parseSlippage(slippage), userPublicKey: publicKey }) });
      const build = await buildResponse.json() as SwapBuild;
      setSwapBuild(build); setQuote(build);
      if (!buildResponse.ok || !build.swap?.swapTransaction) { setLiveMessage(build.error ?? 'Unsigned transaction build failed.'); return; }
      const simulationResponse = await fetch('/api/terminal/signer-dry-run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unsignedTransaction: build.swap.swapTransaction, action: 'swap', mint: activeMint, wallet: publicKey }) });
      const sim = await simulationResponse.json() as SimulationPayload;
      setSimulation(sim);
      if (!simulationResponse.ok || sim.status !== 'ok') { setLiveMessage(sim.simulation?.failureSummary ?? sim.error ?? 'Simulation failed. Signing blocked.'); return; }
      setLiveMessage('Unsigned transaction built and simulation passed. You can now sign in your browser wallet.');
    } catch (error) { setLiveMessage(error instanceof Error ? error.message : 'Unsigned build/simulation failed.'); }
    finally { setLiveLoading(false); }
  }

  async function signInWallet() {
    if (!canSign) { setLiveMessage(blockReasons.find((reason) => reason.startsWith('Signing blocked:')) ?? 'Signing blocked: connect a browser wallet, pass simulation, and match the selected wallet before signing.'); return; }
    setLiveLoading(true); setLiveMessage(null);
    try {
      const provider = (window as BrowserWindowWithSolana).solana;
      const publicKey = walletPublicKey ?? await connectBrowserWallet();
      if (!provider || !publicKey || !swapBuild?.swap?.swapTransaction) return;
      if (selectedDockWallet && publicKey !== selectedDockWallet.address) { setLiveMessage(`Connected signer ${compact(publicKey)} does not match selected wallet ${compact(selectedDockWallet.address)}.`); return; }
      const transaction = VersionedTransaction.deserialize(base64ToBytes(swapBuild.swap.swapTransaction));
      const signed = await provider.signTransaction(transaction);
      const signedTransaction = bytesToBase64(signed.serialize());
      setSignedSwap({ signedTransaction, submitted: false });
      setLiveMessage(capabilities?.broadcastEnabled ? 'Signed locally. Broadcast is available only through the separate submit step.' : 'Signed locally. Broadcast is disabled in A-profile.');
    } catch (error) { setLiveMessage(error instanceof Error ? error.message : 'Wallet signing failed or was rejected.'); }
    finally { setLiveLoading(false); }
  }

  async function submitBroadcast() {
    if (!capabilities?.broadcastEnabled) { setLiveMessage('Broadcast is disabled in A-profile.'); return; }
    if (!signedSwap?.signedTransaction || liveLoading) return;
    setLiveLoading(true); setLiveMessage(null);
    try {
      const response = await fetch('/api/send-signed-transaction', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signedTransaction: signedSwap.signedTransaction }) });
      const sent = await response.json() as { signature?: string; explorerUrl?: string; error?: string };
      if (!response.ok || !sent.signature) { setLiveMessage(sent.error ?? 'Broadcast failed.'); return; }
      setSignedSwap((current) => current ? { ...current, signature: sent.signature, explorerUrl: sent.explorerUrl, submitted: true } : current);
      setLiveMessage(`Sent: ${sent.signature}`);
    } catch (error) { setLiveMessage(error instanceof Error ? error.message : 'Broadcast failed.'); }
    finally { setLiveLoading(false); }
  }

  return (
    <aside className="executionDock premiumExecutionDock">
      <section className="dockCard orderTicketCard premiumOrderCard">
        <div className="dockHeader tradingPanelHeader proPaperHeader"><span>Terminal</span><strong>Quote → build → simulate → sign</strong><small>Broadcast disabled in A-profile</small></div>
        <div className="axiomOrderTicket terminalTradeOnlyPanel redesignedTradePanel">
          <div className="tradePanelSection tradeWalletSection"><div className="tradePanelSectionHead"><span>01</span><strong>Active wallet</strong><small>Browser signer must match selected wallet</small></div><div className="terminalWalletRoutingList cleanWalletList" role="radiogroup" aria-label="Select active wallet">{wallets.length ? wallets.map((wallet) => <button type="button" className={`terminalWalletRoutingItem ${selectedWalletId === wallet.id ? 'selectedPrimaryWallet' : ''}`} key={wallet.id} onClick={() => setSelectedWalletId(wallet.id)}><strong>{wallet.role}</strong><code>{compact(wallet.address)}</code><small>{formatWalletSol(wallet)} · token {formatBalanceRow(tokenBalanceByAddress.get(wallet.address.toLowerCase()))} · {tokenBalanceByAddress.get(wallet.address.toLowerCase())?.balanceStatus ?? tokenBalances?.status ?? 'provider-limited'}</small></button>) : <div className="ticketWalletEmpty"><strong>No saved wallets</strong><span>{selectedWalletLabel}. Connect a browser wallet or add a watch-only record in Wallet Ops.</span></div>}</div><div className="ticketSignerRow"><span>Connected signer</span><strong>{walletPublicKey ? compact(walletPublicKey) : 'Not connected'}</strong><button className="button secondary smallButton" type="button" onClick={() => void connectBrowserWallet()}>{walletPublicKey ? 'Reconnect' : 'Connect wallet'}</button></div><div className={`ticketSignerMatchStatus ${selectedSignerMatched ? 'pass' : signerMismatch ? 'fail' : 'warn'}`}><strong>{selectedSignerMatched ? 'Signer matches selected wallet' : signerMismatch ? 'Signer mismatch blocks signing' : 'Signer match pending'}</strong><small>{selectedDockWallet ? `Selected ${compact(selectedDockWallet.address)} · Connected ${walletPublicKey ? compact(walletPublicKey) : '—'}` : 'No Wallet Ops record selected; browser wallet rail still gates signing.'}</small></div></div>

          <div className="tradePanelSection tradeSideSection">
            <div className="tradePanelSectionHead"><span>02</span><strong>Route request</strong><small>Quote preview only until build/simulate</small></div>
            <div className={`tradeActionBar primaryBuySellBar ${side === 'Sell' ? 'sellSelected' : 'buySelected'}`} role="tablist" aria-label="Trade side">
              <button type="button" role="tab" aria-selected={side === 'Buy'} onClick={() => setSide('Buy')}>Buy</button>
              <button type="button" role="tab" aria-selected={side === 'Sell'} onClick={() => setSide('Sell')}>Sell</button>
            </div>
            <div className="tradeInputGrid">
              <label><span>Token mint</span><input value={activeMint} onChange={(event) => setActiveMint(event.target.value.trim())} placeholder="Paste token mint" /></label>
              <label><span>{side === 'Buy' ? `Spend amount (${spendAsset})` : 'Sell token amount'}</span><input value={amount} onChange={(event) => { setAmount(event.target.value); setSellPercentPreset(null); }} placeholder="0.01" /></label>
              <label><span>Settlement asset</span><select value={spendAsset} onChange={(event) => setSpendAsset(event.target.value as 'SOL' | 'USDC')}><option>SOL</option><option>USDC</option></select></label>
              <label><span>Slippage bps</span><input value={slippage} onChange={(event) => setSlippage(event.target.value)} placeholder="100" /></label>
            </div>
            {side === 'Buy' ? <div className="terminalPresetMatrix" aria-label="SOL amount presets">{SOL_AMOUNT_PRESETS.map((preset) => <button type="button" key={preset} className={amount === preset && spendAsset === 'SOL' ? 'selectedPrimaryWallet' : ''} onClick={() => { setSpendAsset('SOL'); setAmount(preset); }}><strong>{preset} SOL</strong><span>micro buy</span></button>)}</div> : <div className="terminalPresetMatrix" aria-label="Percent sell presets">{SELL_PERCENT_PRESETS.map((preset) => <button type="button" key={preset} className={sellPercentPreset === preset ? 'selectedPrimaryWallet' : ''} onClick={() => applySellPercent(preset)}><strong>{preset}%</strong><span>{selectedTokenBalance?.uiAmount ? `${formatTokenAmount((selectedTokenBalance.uiAmount * preset) / 100)} tokens` : 'manual amount'}</span></button>)}</div>}
            <div className="executionSettingsMatrix" aria-label="Execution settings presets">
              <div><span>Slippage</span><div className="terminalPresetMatrix compactPresetMatrix">{SLIPPAGE_PRESETS.map((preset) => <button type="button" key={preset} className={parseSlippage(slippage) === preset ? 'selectedPrimaryWallet' : ''} onClick={() => setSlippage(String(preset))}>{formatBps(String(preset))}</button>)}</div></div>
              <div><span>Priority fee</span><div className="terminalPresetMatrix compactPresetMatrix">{PRIORITY_FEE_PRESETS.map((preset) => <button type="button" key={preset} className={priorityFeePreset === preset ? 'selectedPrimaryWallet' : ''} onClick={() => setPriorityFeePreset(preset)}>{preset}</button>)}</div><small>{priorityFeeCopy}; no new live execution path.</small></div>
            </div>
            <div className="routePreviewBox terminalRoutePreview" aria-label="Route and quote preview">
              <span>Route / quote preview</span>
              <strong>{routePlanLabel}</strong>
              <div className="routePreviewGrid"><small>Estimated receive <b>{estimatedReceive}</b></small><small>Price impact <b>{priceImpact}</b></small><small>Slippage <b>{formatBps(slippage)}</b></small><small>Route legs <b>{quote?.quote?.routePlanLength ?? '—'}</b></small></div>
              <small>{quote?.status === 'ok' ? `Context slot ${quote.quote?.contextSlot ?? '—'}` : 'Run Preview quote for live Jupiter route details.'}</small>
            </div>
          </div>

          <div className="tradePanelSection tradeActionSection"><div className="tradePanelSectionHead"><span>03</span><strong>Execution ladder</strong><small>Simulation required before signing</small></div>{operatorAuthRequired && <div className="operatorAuthNotice"><strong>Operator login required.</strong><p>Open Profile before live signing routes.</p><a className="button secondary" href="/profile">Open Profile</a></div>}{signerMismatch && <div className="walletMismatchNotice"><strong>Selected wallet and connected signer do not match.</strong><p>Selected: <code>{selectedDockWallet?.address}</code></p><p>Connected: <code>{walletPublicKey}</code></p></div>}<ul className="liveBetaStepLadder" aria-label="A-profile signing steps"><li className={`walletReadinessRow ${walletPublicKey ? 'pass' : 'warn'}`}><strong>1. Connect browser wallet</strong><span>{walletPublicKey ? compact(walletPublicKey) : 'Phantom/Solflare required'}</span></li><li className={`walletReadinessRow ${quote?.status === 'ok' ? 'pass' : 'warn'}`}><strong>2. Preview quote</strong><span>{quote?.status === 'ok' ? 'Quote ready' : 'Run quote preview'}</span></li><li className={`walletReadinessRow ${swapBuild?.swap?.swapTransaction ? 'pass' : 'warn'}`}><strong>3. Build unsigned transaction</strong><span>{swapBuild?.swap?.swapTransaction ? 'Unsigned transaction built' : 'Run build + simulate'}</span></li><li className={`walletReadinessRow ${simulationPassed ? 'pass' : simulation?.status === 'error' ? 'fail' : 'warn'}`}><strong>4. Simulate</strong><span>{simulationPassed ? 'Simulation passed' : simulation?.error ?? 'Required before signing'}</span></li><li className={`walletReadinessRow ${signedSwap?.signedTransaction ? 'pass' : canSign ? 'warn' : 'fail'}`}><strong>5. Sign in wallet</strong><span>{signedSwap?.signedTransaction ? 'Signed locally' : canSign ? 'Ready for wallet prompt' : (blockReasons.find((reason) => reason.startsWith('Signing blocked:')) ?? 'Blocked until simulation passes')}</span></li><li className="walletReadinessRow fail"><strong>6. Broadcast</strong><span>{capabilities?.broadcastEnabled ? 'Separate submit step required' : 'Broadcast OFF: A-profile signs locally only'}</span></li></ul><div className="terminalBlockReasonCard"><strong>Exact block reasons</strong><p>{blockReasons.length ? blockReasons.join(' · ') : 'No local block reasons after simulation/signing gates pass.'}</p><small>Broadcast is intentionally off for this profile. Signing creates a local signed payload only; nothing is submitted on-chain here.</small></div><div className="axiomActionRow"><button className="axiomPreviewButton" type="button" onClick={() => void previewQuote()} disabled={!canPreview}>{quoteLoading ? 'Quoting…' : 'Preview quote'}</button><button className="axiomPreviewButton" type="button" onClick={() => void buildAndSimulateSwap()} disabled={!canBuild}>{liveLoading ? 'Working…' : 'Build + simulate'}</button><button className={`axiomExecuteButton ${canSign ? '' : 'proLiveDisabledButton'}`} type="button" onClick={() => void signInWallet()} disabled={!canSign}>Sign in wallet</button><button className={`axiomExecuteButton ${canBroadcast ? '' : 'proLiveDisabledButton'}`} type="button" onClick={() => void submitBroadcast()} disabled={!canBroadcast}>{capabilities?.broadcastEnabled ? 'Submit transaction' : 'Broadcast OFF — A-profile'}</button></div><div className="axiomTicketFooter"><button type="button" disabled>{capabilities?.readinessLevel ?? 'checking'}</button><span>{liveMessage ?? quote?.error ?? 'Ready for quote preview.'}</span></div></div>
          <TransactionPreviewCard preview={simulation?.transactionPreview ?? swapBuild?.transactionPreview ?? quote?.transactionPreview ?? null} />
        </div>
      </section>
    </aside>
  );
}
