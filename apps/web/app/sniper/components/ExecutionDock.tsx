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
  intentId?: string;
  expectedSigner?: string;
  expectedMint?: string;
  transactionMessageHash?: string | null;
  request?: { inputMint?: string; outputMint?: string; rawAmount?: string; amount?: number | string; side?: string; spendAsset?: string; slippageBps?: number; userPublicKey?: string };
  allowedPrograms?: string[];
  requiredAccounts?: string[];
};

type SimulationPayload = { status?: string; error?: string; simulation?: { err?: unknown; logs?: string[]; unitsConsumed?: number | null; failureSummary?: string | null }; transactionPreview?: TransactionPreview };
type SignedReviewPayload = { status?: string; error?: string; execution?: string; intentId?: string; expectedSigner?: string; expectedMint?: string; simulationStatus?: string | null; review?: { signerMatched?: boolean; expectedMintReferenced?: boolean; requiredAccountsMatched?: boolean; programsAllowed?: boolean; transactionMessageHash?: string | null; expectedTransactionMessageHash?: string | null; altPolicy?: string; safeToBroadcastIfLiveEnabled?: boolean; localSignatureReviewPassed?: boolean; programs?: string[] }; blockers?: string[]; warnings?: string[]; broadcast?: string };
type SignedSwapPayload = { signedTransaction: string; signature?: string; explorerUrl?: string; submitted?: boolean; review?: SignedReviewPayload | null };


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
function hashLabel(value?: string | null) { return value ? `${value.slice(0, 10)}…${value.slice(-8)}` : '—'; }

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

function statusTone(status: boolean | null | undefined) {
  if (status === true) return 'pass';
  if (status === false) return 'fail';
  return 'warn';
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone?: 'pass' | 'warn' | 'fail' | 'neutral' }) {
  return <div className={`terminalStatusPill ${tone ?? 'neutral'}`}><span>{label}</span><strong>{value}</strong></div>;
}

function StepRow({ index, label, status, detail }: { index: number; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }) {
  return <li className={`terminalStepRow ${status}`}><span>{index}</span><strong>{label}</strong><small>{detail}</small></li>;
}

export function ExecutionDock({ mint, selectedWalletLabel, wallets = [] }: { mint?: string; selectedWalletLabel: string; wallets?: DockWallet[] }) {
  const [activeMint, setActiveMint] = useState(mint ?? '');
  const [side, setSide] = useState<TicketSide>('Buy');
  const [amount, setAmount] = useState('0.01');
  const [spendAsset, setSpendAsset] = useState<'SOL' | 'USDC'>('SOL');
  const [slippage, setSlippage] = useState('100');
  const [priorityFeePreset, setPriorityFeePreset] = useState<(typeof PRIORITY_FEE_PRESETS)[number]>('auto');
  const [sellPercentPreset, setSellPercentPreset] = useState<number | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState('browser-wallet');
  const [clientWallets, setClientWallets] = useState<DockWallet[]>([]);
  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<ExecutionCapabilities | null>(null);
  const [tokenBalances, setTokenBalances] = useState<WalletTokenBalances | null>(null);
  const [quote, setQuote] = useState<ExecutionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapBuild, setSwapBuild] = useState<SwapBuild | null>(null);
  const [simulation, setSimulation] = useState<SimulationPayload | null>(null);
  const [signedSwap, setSignedSwap] = useState<SignedSwapPayload | null>(null);
  const [signedReview, setSignedReview] = useState<SignedReviewPayload | null>(null);
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
      if (next) setSelectedWalletId(wallets.find((wallet) => wallet.address === next)?.id ?? 'browser-wallet');
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
  const renderedWallets = useMemo(() => {
    const seen = new Set<string>();
    return [...wallets, ...clientWallets].filter((wallet) => {
      const key = wallet.address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [clientWallets, wallets]);
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('bondr.activeWallet') ?? '' : '';
    setSelectedWalletId((current) => {
      if (current === 'browser-wallet') return current;
      if (renderedWallets.some((wallet) => wallet.id === current)) return current;
      const storedWallet = renderedWallets.find((wallet) => wallet.address === stored);
      return storedWallet?.id ?? (stored ? 'browser-wallet' : renderedWallets[0]?.id ?? 'browser-wallet');
    });
  }, [renderedWallets]);
  useEffect(() => {
    if (!activeMint) { setTokenBalances(null); return; }
    const controller = new AbortController();
    void fetch(`/api/wallet-token-balances?mint=${encodeURIComponent(activeMint)}`, { signal: controller.signal, cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((payload) => setTokenBalances(payload as WalletTokenBalances | null)).catch(() => setTokenBalances(null));
    return () => controller.abort();
  }, [activeMint]);
  useEffect(() => { setSwapBuild(null); setSimulation(null); setSignedSwap(null); setSignedReview(null); }, [activeMint, side, amount, spendAsset, slippage, selectedWalletId]);
  useEffect(() => { if (side === 'Buy') setSellPercentPreset(null); }, [side]);

  const selectedDockWallet = renderedWallets.find((wallet) => wallet.id === selectedWalletId) ?? (selectedWalletId === 'browser-wallet' ? null : renderedWallets[0] ?? null);
  const connectedInventoryWallet = walletPublicKey ? renderedWallets.find((wallet) => wallet.address === walletPublicKey) ?? null : null;
  const tokenBalanceByAddress = useMemo(() => new Map((tokenBalances?.wallets ?? []).map((row) => [String(row.address ?? row.wallet ?? '').toLowerCase(), row])), [tokenBalances]);
  const selectedTokenBalance = selectedDockWallet ? tokenBalanceByAddress.get(selectedDockWallet.address.toLowerCase()) ?? null : null;
  const selectedExecutionAddress = selectedDockWallet?.address ?? walletPublicKey;
  const selectedSignerMatched = Boolean(walletPublicKey && selectedExecutionAddress && walletPublicKey === selectedExecutionAddress);
  const signerMismatch = Boolean(walletPublicKey && selectedDockWallet && walletPublicKey !== selectedDockWallet.address);
  const signerMissingFromWalletOps = Boolean(walletPublicKey && !connectedInventoryWallet);
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

  function useConnectedWalletAsActive(address = walletPublicKey) {
    if (!address) { setLiveMessage('Connect a Solana browser wallet first.'); return; }
    const saved = renderedWallets.find((wallet) => wallet.address === address);
    setSelectedWalletId(saved?.id ?? 'browser-wallet');
    window.localStorage.setItem('bondr.activeWallet', address);
    window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address } }));
    setLiveMessage(saved ? `Connected signer ${compact(address)} is now the active wallet.` : `Connected signer ${compact(address)} is active for this browser. Add it as watch-only to save the public record in Wallet Ops.`);
  }

  async function connectBrowserWallet(): Promise<string | null> {
    const provider = (window as BrowserWindowWithSolana).solana;
    if (!provider) { setLiveMessage('No Solana browser wallet detected. Install Phantom or Solflare.'); return null; }
    const connected = await provider.connect();
    const key = connected.publicKey.toBase58?.() ?? connected.publicKey.toString();
    setWalletPublicKey(key);
    useConnectedWalletAsActive(key);
    return key;
  }

  async function addConnectedSignerAsWatchOnly() {
    const publicKey = walletPublicKey ?? await connectBrowserWallet();
    if (!publicKey) return;
    if (renderedWallets.some((wallet) => wallet.address === publicKey)) { useConnectedWalletAsActive(publicKey); return; }
    setLiveLoading(true);
    setLiveMessage('Adding connected signer as a watch-only public address.');
    try {
      const railResponse = await fetch(`/api/wallet-rail?connectedSigner=${encodeURIComponent(publicKey)}&selectedWallet=${encodeURIComponent(publicKey)}`, { cache: 'no-store' });
      const rail = await railResponse.json().catch(() => null) as { defaultWatchOnlyGroup?: { id?: string } } | null;
      const groupId = rail?.defaultWatchOnlyGroup?.id;
      if (!groupId) throw new Error('No Wallet Ops group is available for watch-only add.');
      const response = await fetch('/api/wallets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: publicKey, role: 'browser signer watch-only', groupId, purpose: 'Watch-only public address for Bond.Terminal browser-wallet matching and balance display.', status: 'active' }) });
      const payload = await response.json().catch(() => null) as { error?: string; wallet?: DockWallet; alreadyExisted?: boolean; mutationMode?: string; persisted?: boolean } | null;
      if (!response.ok) throw new Error(payload?.error ?? `Watch-only wallet add failed with HTTP ${response.status}.`);
      const saved = payload?.wallet;
      if (saved?.address) setClientWallets((current) => current.some((wallet) => wallet.address === saved.address) ? current : [...current, { id: saved.id, address: saved.address, role: saved.role, balanceSol: saved.balanceSol ?? 0, purpose: saved.purpose, scope: saved.scope }]);
      useConnectedWalletAsActive(publicKey);
      window.dispatchEvent(new CustomEvent('bondr-watch-only-wallet-added', { detail: { address: publicKey } }));
      setLiveMessage(`${payload?.alreadyExisted ? 'Connected signer already existed in Wallet Ops' : 'Connected signer added as watch-only'} and selected. Storage=${payload?.mutationMode ?? 'unknown'} persisted=${Boolean(payload?.persisted)}. Public address only; browser wallet still signs.`);
    } catch (error) { setLiveMessage(error instanceof Error ? error.message : 'Watch-only wallet add failed.'); }
    finally { setLiveLoading(false); }
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
    setLiveLoading(true); setLiveMessage(null); setSwapBuild(null); setSimulation(null); setSignedSwap(null); setSignedReview(null);
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
      const reviewResponse = await fetch('/api/terminal/signed-review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signedTransaction, intentId: swapBuild.intentId, expectedSigner: swapBuild.expectedSigner ?? publicKey, expectedMint: swapBuild.expectedMint ?? activeMint, transactionMessageHash: swapBuild.transactionMessageHash ?? null, simulationStatus: simulation?.status ?? null }) });
      const review = await reviewResponse.json().catch(() => null) as SignedReviewPayload | null;
      setSignedReview(review);
      setSignedSwap({ signedTransaction, submitted: false, review });
      if (!reviewResponse.ok || review?.status !== 'ok') { setLiveMessage(review?.error ?? review?.blockers?.[0] ?? 'Signed transaction review failed. Broadcast remains blocked.'); return; }
      setLiveMessage(capabilities?.broadcastEnabled ? 'Signed locally and review passed. Broadcast is available only through the separate submit step.' : 'Signed locally and review passed. Broadcast is disabled in A-profile.');
    } catch (error) { setLiveMessage(error instanceof Error ? error.message : 'Wallet signing failed or was rejected.'); }
    finally { setLiveLoading(false); }
  }

  async function submitBroadcast() {
    if (!capabilities?.broadcastEnabled) { setLiveMessage('Broadcast is disabled in A-profile.'); return; }
    if (!signedSwap?.signedTransaction || liveLoading) return;
    setLiveLoading(true); setLiveMessage(null);
    try {
      const response = await fetch('/api/send-signed-transaction', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signedTransaction: signedSwap.signedTransaction, intentId: swapBuild?.intentId, expectedSigner: swapBuild?.expectedSigner, expectedMint: swapBuild?.expectedMint, transactionMessageHash: swapBuild?.transactionMessageHash ?? signedReview?.review?.transactionMessageHash ?? null, simulationStatus: simulation?.status ?? null }) });
      const sent = await response.json() as { signature?: string; explorerUrl?: string; error?: string };
      if (!response.ok || !sent.signature) { setLiveMessage(sent.error ?? 'Broadcast failed.'); return; }
      setSignedSwap((current) => current ? { ...current, signature: sent.signature, explorerUrl: sent.explorerUrl, submitted: true } : current);
      setLiveMessage(`Sent: ${sent.signature}`);
    } catch (error) { setLiveMessage(error instanceof Error ? error.message : 'Broadcast failed.'); }
    finally { setLiveLoading(false); }
  }

  function buildTerminalQaReport() {
    const observedAt = new Date().toISOString();
    const report = {
      timestamp: observedAt,
      path: '/sniper',
      gates: {
        liveTradingEnabled: Boolean(capabilities?.liveTradingEnabled),
        signingEnabled: Boolean(capabilities?.signingEnabled),
        broadcastEnabled: Boolean(capabilities?.broadcastEnabled),
        readinessLevel: capabilities?.readinessLevel ?? 'unknown',
        simulationRequired: capabilities?.requireSimulation !== false
      },
      authAndWallet: {
        auth: operatorAuthRequired ? 'operator-login-required' : 'ready-or-not-configured',
        selectedWallet: selectedExecutionAddress ?? null,
        connectedSigner: walletPublicKey,
        walletMatch: selectedSignerMatched,
        signerMismatch
      },
      testInput: {
        side,
        mint: activeMint,
        amount,
        spendAsset,
        slippageBps: parseSlippage(slippage),
        route: routeLabel
      },
      phaseSummary: {
        quoteStatus: quote?.status ?? 'not-run',
        buildStatus: swapBuild?.swap?.swapTransaction ? 'unsigned-built' : swapBuild?.error ? 'error' : 'not-run',
        simulationStatus: simulation?.status ?? 'not-run',
        signerStatus: signedSwap?.signedTransaction ? 'signed' : canSign ? 'eligible' : 'idle',
        broadcastStatus: signedSwap?.submitted ? 'sent' : capabilities?.broadcastEnabled ? 'enabled-not-sent' : 'disabled',
        signature: signedSwap?.signature ?? null,
        explorerUrl: signedSwap?.explorerUrl ?? null,
        messageHash: swapBuild?.transactionMessageHash ?? signedReview?.review?.transactionMessageHash ?? null,
        intentId: swapBuild?.intentId ?? null,
        expectedSigner: swapBuild?.expectedSigner ?? selectedExecutionAddress ?? null,
        expectedMint: swapBuild?.expectedMint ?? activeMint,
        routeLabels: quote?.quote?.routeLabels ?? [],
        priceImpactPct: quote?.quote?.priceImpactPct ?? null,
        estimatedOutAmount: quote?.quote?.outAmount ?? null
      },
      review: {
        status: signedReview?.status ?? 'not-run',
        execution: signedReview?.execution ?? null,
        broadcast: signedReview?.broadcast ?? null,
        signerMatched: signedReview?.review?.signerMatched ?? null,
        expectedMintReferenced: signedReview?.review?.expectedMintReferenced ?? null,
        requiredAccountsMatched: signedReview?.review?.requiredAccountsMatched ?? null,
        programsAllowed: signedReview?.review?.programsAllowed ?? null,
        safeToBroadcastIfLiveEnabled: signedReview?.review?.safeToBroadcastIfLiveEnabled ?? null,
        blockers: signedReview?.blockers ?? [],
        warnings: signedReview?.warnings ?? []
      },
      localBlockReasons: blockReasons,
      omittedIntentionally: [
        'private keys / seed phrases',
        'full unsigned transaction base64',
        'full signed transaction bytes',
        'cookies / session secrets / auth tokens'
      ]
    };
    return `# BONDR Terminal QA report\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\``;
  }

  async function copyTerminalQaReport() {
    const report = buildTerminalQaReport();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = report;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setLiveMessage('Terminal QA report copied. Paste it back here after the final test.');
    } catch {
      setLiveMessage('Could not copy report automatically. Open signed review details and paste the signature or error.');
    }
  }

  return (
    <aside className="executionDock premiumExecutionDock freshTradingDock">
      <section className="dockCard orderTicketCard premiumOrderCard freshTradingTicket">
        <header className="freshTicketHeader">
          <div>
            <span>Trading terminal</span>
            <strong>Market ticket</strong>
            <small>Preview, build, simulate, sign. Broadcast stays gated.</small>
          </div>
          <StatusPill label="Broadcast" value={capabilities?.broadcastEnabled ? 'Enabled' : 'Disabled'} tone={capabilities?.broadcastEnabled ? 'warn' : 'fail'} />
        </header>

        <div className="freshTradingStack">
          <section className="freshTradeZone">
            <div className="freshZoneHead">
              <span>Wallet Status</span>
              <strong>{walletPublicKey ? compact(walletPublicKey) : 'Not connected'}</strong>
            </div>
            <div className="freshStatusGrid" aria-label="Wallet and gate status">
              <StatusPill label="Auth" value={operatorAuthRequired ? 'Login needed' : 'Ready'} tone={operatorAuthRequired ? 'warn' : 'pass'} />
              <StatusPill label="Signer" value={selectedSignerMatched ? 'Matched' : signerMismatch ? 'Mismatch' : 'Pending'} tone={selectedSignerMatched ? 'pass' : signerMismatch ? 'fail' : 'warn'} />
              <StatusPill label="Signing" value={capabilities?.signingEnabled ? 'Enabled' : 'Disabled'} tone={statusTone(capabilities?.signingEnabled)} />
              <StatusPill label="Readiness" value={capabilities?.readinessLevel ?? 'Checking'} tone={capabilities?.readinessLevel === 'signing-ready' ? 'pass' : 'warn'} />
            </div>
            <div className="freshWalletList" role="radiogroup" aria-label="Select trading wallet">
              {renderedWallets.length ? renderedWallets.map((wallet) => {
                const tokenRow = tokenBalanceByAddress.get(wallet.address.toLowerCase());
                return (
                  <button type="button" className={`freshWalletRow ${selectedWalletId === wallet.id ? 'selected' : ''}`} key={wallet.id} onClick={() => setSelectedWalletId(wallet.id)}>
                    <span>{wallet.role}</span>
                    <strong>{compact(wallet.address)}</strong>
                    <small>{formatWalletSol(wallet)} · token {formatBalanceRow(tokenRow)} · {tokenRow?.balanceStatus ?? tokenBalances?.status ?? 'provider-limited'}</small>
                  </button>
                );
              }) : <div className="freshEmptyPanel"><strong>No saved wallets</strong><small>{selectedWalletLabel}. Connect a browser wallet or add a watch-only public record.</small></div>}
            </div>
            <div className="freshWalletActions">
              <button className="button secondary smallButton" type="button" onClick={() => void connectBrowserWallet()}>{walletPublicKey ? 'Reconnect' : 'Connect wallet'}</button>
              <button className="button secondary smallButton" type="button" onClick={() => useConnectedWalletAsActive()} disabled={!walletPublicKey}>Use connected</button>
              <button className="button secondary smallButton" type="button" onClick={() => void addConnectedSignerAsWatchOnly()} disabled={!walletPublicKey || liveLoading || !signerMissingFromWalletOps}>{signerMissingFromWalletOps ? 'Add watch-only' : 'Saved'}</button>
            </div>
            <p className={`freshInlineState ${selectedSignerMatched ? 'pass' : signerMismatch ? 'fail' : 'warn'}`}>
              {selectedSignerMatched ? 'Selected wallet matches the connected browser signer.' : signerMismatch ? `Selected ${selectedDockWallet ? compact(selectedDockWallet.address) : '—'} does not match signer ${walletPublicKey ? compact(walletPublicKey) : '—'}.` : 'Connect or select the browser signer before signing.'}
            </p>
          </section>

          <section className="freshTradeZone">
            <div className="freshZoneHead">
              <span>Trade Ticket</span>
              <strong>{routeLabel}</strong>
            </div>
            <div className="freshSegmentedControl" role="tablist" aria-label="Trade side">
              <button type="button" aria-selected={side === 'Buy'} onClick={() => setSide('Buy')}>Buy</button>
              <button type="button" aria-selected={side === 'Sell'} onClick={() => setSide('Sell')}>Sell</button>
            </div>
            <div className="freshModeTabs" role="tablist" aria-label="Order type">
              <button type="button" aria-selected="true">Market</button>
              <button type="button" disabled title="Limit orders are a later policy gate.">Limit locked</button>
            </div>
            <div className="freshTradeInputs">
              <label><span>Token mint</span><input value={activeMint} onChange={(event) => setActiveMint(event.target.value.trim())} placeholder="Paste token mint" /></label>
              <label><span>{side === 'Buy' ? `Spend amount (${spendAsset})` : 'Sell token amount'}</span><input value={amount} onChange={(event) => { setAmount(event.target.value); setSellPercentPreset(null); }} placeholder="0.01" /></label>
              <label><span>Settle to</span><select value={spendAsset} onChange={(event) => setSpendAsset(event.target.value as 'SOL' | 'USDC')}><option>SOL</option><option>USDC</option></select></label>
            </div>
            {side === 'Buy' ? (
              <div className="freshPresetRow" aria-label="SOL buy presets">
                {SOL_AMOUNT_PRESETS.map((preset) => <button type="button" key={preset} className={amount === preset && spendAsset === 'SOL' ? 'selected' : ''} onClick={() => { setSpendAsset('SOL'); setAmount(preset); }}>{preset} SOL</button>)}
              </div>
            ) : (
              <div className="freshPresetRow" aria-label="Sell percentage presets">
                {SELL_PERCENT_PRESETS.map((preset) => <button type="button" key={preset} className={sellPercentPreset === preset ? 'selected' : ''} onClick={() => applySellPercent(preset)}>{preset}%</button>)}
              </div>
            )}
            <div className="freshRouteSummary">
              <div><span>Estimated receive</span><strong>{estimatedReceive}</strong></div>
              <div><span>Price impact</span><strong>{priceImpact}</strong></div>
              <div><span>Route</span><strong>{routePlanLabel}</strong></div>
            </div>
          </section>

          <section className="freshTradeZone freshRiskZone">
            <div className="freshZoneHead">
              <span>Risk And Settings</span>
              <strong>Simulation required</strong>
            </div>
            <div className="freshSettingBlock">
              <span>Slippage</span>
              <div className="freshPresetRow compact">
                {SLIPPAGE_PRESETS.map((preset) => <button type="button" key={preset} className={parseSlippage(slippage) === preset ? 'selected' : ''} onClick={() => setSlippage(String(preset))}>{formatBps(String(preset))}</button>)}
              </div>
              <label className="freshInlineInput"><span>Custom bps</span><input value={slippage} onChange={(event) => setSlippage(event.target.value)} placeholder="100" /></label>
            </div>
            <details className="freshAdvancedSettings">
              <summary>Advanced settings</summary>
              <div className="freshSettingBlock">
                <span>Priority fee intent</span>
                <div className="freshPresetRow compact">
                  {PRIORITY_FEE_PRESETS.map((preset) => <button type="button" key={preset} className={priorityFeePreset === preset ? 'selected' : ''} onClick={() => setPriorityFeePreset(preset)}>{preset}</button>)}
                </div>
                <small>{priorityFeeCopy}. This does not open a new live execution path.</small>
              </div>
              <div className="freshBlockReasons">
                <strong>Block reasons</strong>
                <p>{blockReasons.length ? blockReasons.join(' · ') : 'No local block reasons. Broadcast still requires explicit activation.'}</p>
              </div>
            </details>
          </section>

          <section className="freshTradeZone">
            <div className="freshZoneHead">
              <span>Execution Steps</span>
              <strong>{signedSwap?.submitted ? 'Sent' : signedSwap?.signedTransaction ? 'Signed locally' : simulationPassed ? 'Ready to sign' : quote?.status === 'ok' ? 'Ready to build' : 'Ready to quote'}</strong>
            </div>
            {operatorAuthRequired && <div className="operatorAuthNotice"><strong>Operator login required.</strong><p>Open Profile before live signing routes.</p><a className="button secondary" href="/profile">Open Profile</a></div>}
            <ol className="freshStepList" aria-label="Trading execution steps">
              <StepRow index={1} label="Wallet connected" status={walletPublicKey ? 'pass' : 'warn'} detail={walletPublicKey ? compact(walletPublicKey) : 'Connect Phantom or Solflare'} />
              <StepRow index={2} label="Signer match" status={selectedExecutionAddress ? signerMismatch ? 'fail' : 'pass' : 'warn'} detail={selectedExecutionAddress ? signerMismatch ? 'Selected wallet differs from signer' : compact(selectedExecutionAddress) : 'Select or use connected wallet'} />
              <StepRow index={3} label="Quote ready" status={quote?.status === 'ok' ? 'pass' : quote?.status === 'error' ? 'fail' : 'warn'} detail={quote?.status === 'ok' ? 'Jupiter quote loaded' : quote?.error ?? 'Run Preview Quote'} />
              <StepRow index={4} label="Unsigned build" status={swapBuild?.swap?.swapTransaction ? 'pass' : swapBuild?.error ? 'fail' : 'warn'} detail={swapBuild?.swap?.swapTransaction ? 'Unsigned transaction built' : swapBuild?.error ?? 'Run Build + Simulate'} />
              <StepRow index={5} label="Simulation" status={simulationPassed ? 'pass' : simulation?.status === 'error' ? 'fail' : 'warn'} detail={simulationPassed ? 'Simulation passed' : simulation?.simulation?.failureSummary ?? simulation?.error ?? 'Required before signing'} />
              <StepRow index={6} label="Browser signature" status={signedSwap?.signedTransaction ? 'pass' : canSign ? 'warn' : 'fail'} detail={signedSwap?.signedTransaction ? 'Signed locally' : canSign ? 'Ready for wallet prompt' : 'Blocked until wallet, build, and simulation pass'} />
              <StepRow index={7} label="Broadcast" status={canBroadcast ? 'warn' : 'fail'} detail={capabilities?.broadcastEnabled ? 'Requires separate submit click' : 'Terminal broadcast disabled'} />
            </ol>
          </section>

          <section className="freshTradeZone freshActionZone">
            <div className="freshZoneHead">
              <span>Action Bar</span>
              <strong>{liveLoading || quoteLoading ? 'Working' : 'Idle'}</strong>
            </div>
            <div className="freshPrimaryActions">
              <button className="axiomPreviewButton" type="button" onClick={() => void previewQuote()} disabled={!canPreview}>{quoteLoading ? 'Previewing...' : 'Preview Quote'}</button>
              <button className="axiomPreviewButton" type="button" onClick={() => void buildAndSimulateSwap()} disabled={!canBuild}>{liveLoading ? 'Working...' : 'Build + Simulate'}</button>
              <button className={`axiomExecuteButton ${canSign ? '' : 'proLiveDisabledButton'}`} type="button" onClick={() => void signInWallet()} disabled={!canSign}>Sign Locally</button>
              <button className={`axiomExecuteButton ${canBroadcast ? '' : 'proLiveDisabledButton'}`} type="button" onClick={() => void submitBroadcast()} disabled={!canBroadcast}>{capabilities?.broadcastEnabled ? 'Broadcast' : 'Broadcast Disabled'}</button>
              <button className="axiomPreviewButton freshWideAction" type="button" onClick={() => void copyTerminalQaReport()}>Copy QA Report</button>
            </div>
            <div className="freshMessageLine" role="status">{liveMessage ?? quote?.error ?? 'Ready. Broadcast remains disabled until explicit activation.'}</div>
            <details className="freshAdvancedSettings">
              <summary>Signed review and transaction details</summary>
              <div className={`transactionPreviewCard ${signedReview?.status === 'blocked' ? 'blockedPreview' : signedReview?.status === 'ok' ? 'okPreview' : 'emptyPreview'}`} aria-label="Signed transaction intent review">
                <div className="transactionPreviewHeader"><div><span>Signed transaction review</span><strong>{signedReview?.status === 'ok' ? 'intent matched' : signedReview?.status === 'blocked' ? 'blocked' : 'awaiting signature'}</strong></div><em>{signedReview?.broadcast ?? 'broadcast-not-performed'}</em></div>
                <div className="transactionPreviewGrid"><div><span>Intent</span><strong>{swapBuild?.intentId ? hashLabel(swapBuild.intentId) : '—'}</strong></div><div><span>Signer</span><strong>{signedReview?.review?.signerMatched ? 'matched' : swapBuild?.expectedSigner ? compact(swapBuild.expectedSigner) : '—'}</strong></div><div><span>Mint</span><strong>{signedReview?.review?.expectedMintReferenced ? 'referenced' : swapBuild?.expectedMint ? compact(swapBuild.expectedMint) : '—'}</strong></div><div><span>Message hash</span><strong>{hashLabel(signedReview?.review?.transactionMessageHash ?? swapBuild?.transactionMessageHash)}</strong></div><div><span>Simulation</span><strong>{simulation?.status ?? 'not-run'}</strong></div><div><span>ALT policy</span><strong>{signedReview?.review?.altPolicy ?? 'pending'}</strong></div></div>
                {signedReview?.blockers?.length ? <ul className="transactionPreviewList blockers">{signedReview.blockers.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul> : null}
                <p>Signing only. This review binds the browser-wallet signature to the stored intent; it does not broadcast or enable trading.</p>
              </div>
              <TransactionPreviewCard preview={simulation?.transactionPreview ?? swapBuild?.transactionPreview ?? quote?.transactionPreview ?? null} />
            </details>
          </section>
        </div>
      </section>
    </aside>
  );
}
