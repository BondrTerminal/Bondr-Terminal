'use client';

import { VersionedTransaction } from '@solana/web3.js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TransactionPreview } from '../../../lib/transaction-preview';

type Capabilities = {
  status?: string;
  liveTradingEnabled?: boolean;
  signingEnabled?: boolean;
  broadcastEnabled?: boolean;
  deploymentEnabled?: boolean;
  requireSimulation?: boolean;
  allowedCluster?: string;
  readinessLevel?: string;
  auth?: { configured?: boolean; authenticated?: boolean; reason?: string | null };
  limits?: { maxSolPerSwap?: number; maxUsdcPerSwap?: number; maxSlippageBps?: number };
  warnings?: string[];
  blockers?: string[];
};

type WalletRecord = { id: string; address: string; role: string; groupId?: string; scope?: string; status?: string; balanceSol?: number };
type WalletsPayload = { status?: string; wallets?: WalletRecord[]; project?: { id?: string; name?: string } | null; groupId?: string | null; mutationMode?: string; persisted?: boolean; note?: string };
type QuotePayload = { status?: string; error?: string; quote?: { outAmount?: string | null; priceImpactPct?: string | null; routeLabels?: string[]; routePlanLength?: number | null }; transactionPreview?: TransactionPreview };
type BuildPayload = QuotePayload & { swap?: { swapTransaction?: string; lastValidBlockHeight?: number | null; computeUnitLimit?: number | null; prioritizationFeeLamports?: number | null }; signingEnabled?: boolean; broadcastEnabled?: boolean; deploymentEnabled?: boolean };
type SimulationPayload = { status?: string; error?: string; simulation?: { err?: unknown; logs?: string[]; unitsConsumed?: number | null; failureSummary?: string | null }; transactionPreview?: TransactionPreview };
type SignPayload = { status: 'idle' | 'signed' | 'blocked' | 'error'; message: string; signedTransaction?: string };
type WalletRailSnapshot = { connectedSigner: string | null; selectedWallet: string | null; inventoryMatch: boolean; selectedInventoryMatch: boolean; defaultWatchOnlyGroup?: { id: string; name: string; scope: string } | null; solBalance: number | null; selectedSolBalance: number | null; tokenBalances?: Array<{ uiAmountString?: string; uiAmount?: number | null }>; selectedTokenBalances?: Array<{ uiAmountString?: string; uiAmount?: number | null }>; balanceStatus: string; warnings: string[]; blockers: string[] };
type QaEvent = { id: string; at: string; type: string; status: 'info' | 'pass' | 'warn' | 'fail'; message: string };

type BrowserSolanaProvider = {
  publicKey?: { toString(): string; toBase58?(): string };
  connect(): Promise<{ publicKey: { toString(): string; toBase58?(): string } }>;
  signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
};
type BrowserWindowWithSolana = Window & { solana?: BrowserSolanaProvider };

const USDC_MAINNET_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL_MAINNET_MINT = 'So11111111111111111111111111111111111111112';
const SOLANA_PUBLIC_KEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
type QaPreset = 'SOL → USDC micro buy' | 'Token → SOL sell rehearsal' | 'Custom';

function short(address?: string | null) { return address ? `${address.slice(0, 5)}…${address.slice(-5)}` : '—'; }
function walletSolLabel(wallet?: WalletRecord | null) {
  if (!wallet) return 'Select/import wallet in Wallet Ops';
  return typeof wallet.balanceSol === 'number' && wallet.balanceSol > 0 ? `${wallet.status ?? 'record'} · ${wallet.balanceSol} SOL` : `${wallet.status ?? 'record'} · balance read through wallet rail`;
}
function jsonText(value: unknown) { return JSON.stringify(value, null, 2); }
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}
function nowIso() { return new Date().toISOString(); }

function ResultCard({ title, status, children }: { title: string; status?: string; children: ReactNode }) {
  return <section className="qaResultCard"><div className="qaResultHeader"><span>{title}</span><strong>{status ?? 'pending'}</strong></div>{children}</section>;
}

function PreviewCard({ preview }: { preview?: TransactionPreview | null }) {
  if (!preview) return <p className="qaMuted">No transaction preview yet.</p>;
  return <div className="qaPreviewGrid">
    <div><span>Mode</span><strong>{preview.mode}</strong></div>
    <div><span>Action</span><strong>{preview.action}</strong></div>
    <div><span>Signing</span><strong>{preview.signingEnabled ? 'enabled' : 'disabled'}</strong></div>
    <div><span>Broadcast</span><strong>{preview.broadcastEnabled ? 'enabled' : 'disabled'}</strong></div>
    <div><span>Simulation</span><strong>{preview.simulationStatus ?? 'not-run'}</strong></div>
    <div><span>Provider</span><strong>{preview.provider ?? preview.route ?? '—'}</strong></div>
    {preview.blockers.length > 0 && <div className="qaWide"><span>Blockers</span><strong>{preview.blockers.join(' · ')}</strong></div>}
    {preview.warnings.length > 0 && <div className="qaWide"><span>Warnings</span><strong>{preview.warnings.join(' · ')}</strong></div>}
  </div>;
}

export function AProfileManualQaPanel() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [selectedWalletAddress, setSelectedWalletAddress] = useState('');
  const [connectedWallet, setConnectedWallet] = useState('');
  const [preset, setPreset] = useState<QaPreset>('SOL → USDC micro buy');
  const [mint, setMint] = useState(USDC_MAINNET_MINT);
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy');
  const [amount, setAmount] = useState('0.001');
  const [spendAsset, setSpendAsset] = useState<'SOL' | 'USDC'>('SOL');
  const [slippageBps, setSlippageBps] = useState('100');
  const [message, setMessage] = useState('Load capabilities, connect wallet, then test each phase in order.');
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [build, setBuild] = useState<BuildPayload | null>(null);
  const [simulation, setSimulation] = useState<SimulationPayload | null>(null);
  const [signer, setSigner] = useState<SignPayload>({ status: 'idle', message: 'No local signature yet.' });
  const [events, setEvents] = useState<QaEvent[]>([]);
  const [railSnapshot, setRailSnapshot] = useState<WalletRailSnapshot | null>(null);
  const [reportMessage, setReportMessage] = useState('No report copied yet.');
  const [loading, setLoading] = useState<string | null>(null);

  function logEvent(type: string, status: QaEvent['status'], eventMessage: string) {
    const event: QaEvent = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: nowIso(), type, status, message: eventMessage };
    setEvents((current) => [event, ...current].slice(0, 80));
  }

  async function refresh() {
    const [capResponse, walletResponse] = await Promise.all([
      fetch('/api/execution-capabilities', { cache: 'no-store' }),
      fetch('/api/wallets', { cache: 'no-store' })
    ]);
    const capPayload = await capResponse.json() as Capabilities;
    const walletPayload = await walletResponse.json() as WalletsPayload;
    setCaps(capPayload);
    const nextWallets = walletPayload.wallets ?? [];
    setWallets(nextWallets);
    setSelectedWalletAddress((current) => current || nextWallets.find((wallet) => wallet.address === connectedWallet)?.address || nextWallets[0]?.address || '');
    logEvent('capabilities loaded', capPayload.signingEnabled ? 'pass' : 'warn', `readiness=${capPayload.readinessLevel ?? 'unknown'} broadcast=${capPayload.broadcastEnabled ? 'enabled' : 'disabled'}`);
    return walletPayload;
  }

  async function refreshRail(nextSigner = connectedWallet, nextSelected = selectedWalletAddress) {
    const params = new URLSearchParams();
    if (nextSigner) params.set('connectedSigner', nextSigner);
    if (nextSelected) params.set('selectedWallet', nextSelected);
    if (mint && SOLANA_PUBLIC_KEY_RE.test(mint.trim())) params.set('mint', mint.trim());
    try {
      const response = await fetch(`/api/wallet-rail?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json() as WalletRailSnapshot;
      setRailSnapshot(payload);
      logEvent('wallet rail refreshed', payload.balanceStatus === 'fresh' ? 'pass' : 'warn', `balance=${payload.balanceStatus} inventory=${payload.inventoryMatch ? 'matched' : 'not-matched'}`);
    } catch {
      logEvent('wallet rail refreshed', 'fail', 'Wallet rail refresh failed.');
    }
  }

  useEffect(() => {
    void refresh().catch((error) => {
      const text = error instanceof Error ? error.message : 'Capabilities load failed.';
      setMessage(text);
      logEvent('capabilities loaded', 'fail', text);
    });
    const provider = (window as BrowserWindowWithSolana).solana;
    const key = provider?.publicKey?.toBase58?.() ?? provider?.publicKey?.toString?.() ?? '';
    if (key) {
      setConnectedWallet(key);
      logEvent('wallet connected', 'pass', `existing signer ${short(key)}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const walletMismatch = Boolean(connectedWallet && selectedWalletAddress && connectedWallet !== selectedWalletAddress);
  const selectedWallet = wallets.find((wallet) => wallet.address === selectedWalletAddress) ?? null;
  const connectedInventoryWallet = connectedWallet ? wallets.find((wallet) => wallet.address === connectedWallet) ?? null : null;
  const simulationPassed = simulation?.status === 'ok';
  const canSign = Boolean(caps?.signingEnabled && build?.swap?.swapTransaction && simulationPassed && connectedWallet && !walletMismatch);
  const authBlocked = Boolean(caps?.auth?.configured && !caps.auth.authenticated);
  const providerLimited = Boolean(caps?.warnings?.some((warning) => /rpc|provider|helius|quota|degraded/i.test(warning)));
  const connectedSignerNeedsSol = Boolean(connectedWallet && railSnapshot?.balanceStatus === 'fresh' && (railSnapshot.solBalance ?? 0) <= 0);
  const simulationFailureText = simulation?.simulation?.failureSummary ?? simulation?.error ?? (simulation?.simulation?.err ? `Simulation failed: ${JSON.stringify(simulation.simulation.err)}` : null);
  const amountNumber = Number(amount);
  const slippageNumber = Number(slippageBps);
  const maxSol = Number(caps?.limits?.maxSolPerSwap ?? 0.01);
  const maxUsdc = Number(caps?.limits?.maxUsdcPerSwap ?? 5);
  const maxSlippage = Number(caps?.limits?.maxSlippageBps ?? 100);
  const mintLooksValid = SOLANA_PUBLIC_KEY_RE.test(mint.trim());
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const slippageValid = Number.isFinite(slippageNumber) && slippageNumber > 0 && slippageNumber <= maxSlippage;
  const profileCapValid = !amountValid ? false : spendAsset === 'SOL' ? amountNumber <= maxSol : amountNumber <= maxUsdc;
  const solToSolRisk = mint.trim() === WSOL_MAINNET_MINT && spendAsset === 'SOL';
  const inputBlockingIssues = [
    !mintLooksValid ? 'Mint must look like a Solana public key, 32–44 base58 chars.' : null,
    !amountValid ? 'Amount must be a positive number.' : null,
    !slippageValid ? `Slippage bps must be positive and <= ${maxSlippage}.` : null,
    !profileCapValid ? `Amount exceeds A-profile ${spendAsset} cap.` : null,
    solToSolRisk ? 'SOL-to-SOL route is not useful for QA. Use USDC mint or another token mint.' : null
  ].filter(Boolean) as string[];
  const buildBlockingIssues = [
    ...inputBlockingIssues,
    authBlocked ? 'Operator login required before live signing test.' : null,
    !connectedWallet ? 'Connect a Solana browser wallet.' : null,
    walletMismatch ? `Signing blocked: selected wallet ${short(selectedWalletAddress)} does not match connected signer ${short(connectedWallet)}.` : null,
    connectedSignerNeedsSol && spendAsset === 'SOL' ? 'Connected signer has 0 SOL; SOL buys need spend amount plus network fees.' : null
  ].filter(Boolean) as string[];
  const preflightRows = [
    ['Mint format', mintLooksValid ? 'pass' : 'blocked', mintLooksValid ? 'Mint format looks valid.' : 'Mint must look like a Solana public key, 32–44 base58 chars.'],
    ['Amount', amountValid ? 'pass' : 'blocked', amountValid ? `${amountNumber} ${spendAsset}` : 'Amount must be a positive number.'],
    ['Slippage', slippageValid ? 'pass' : 'blocked', slippageValid ? `${slippageNumber} bps <= ${maxSlippage} bps` : `Slippage bps must be positive and <= ${maxSlippage}.`],
    ['Profile caps', profileCapValid ? 'pass' : 'blocked', profileCapValid ? `Inside ${spendAsset === 'SOL' ? maxSol + ' SOL' : maxUsdc + ' USDC'} cap.` : `Amount exceeds A-profile ${spendAsset} cap.`],
    ['SOL/SOL no-op risk', solToSolRisk ? 'warn' : 'pass', solToSolRisk ? 'SOL-to-SOL route is not useful for QA. Use USDC mint or another token mint.' : 'Route is not the wrapped-SOL no-op default.'],
    ['Auth', authBlocked ? 'blocked' : caps ? 'pass' : 'pending', authBlocked ? 'Operator login required before live signing test.' : 'Auth state is acceptable for this environment.'],
    ['Wallet match', walletMismatch ? 'blocked' : connectedWallet ? 'pass' : 'pending', walletMismatch ? `Signing blocked: selected wallet ${short(selectedWalletAddress)} does not match connected signer ${short(connectedWallet)}.` : connectedWallet ? 'Connected signer matches selected wallet or no selected-wallet test required.' : 'Connect a Solana browser wallet for build/sign.'],
    ['Broadcast disabled', caps?.broadcastEnabled === false ? 'pass' : caps ? 'blocked' : 'pending', caps?.broadcastEnabled === false ? 'Broadcast disabled in A-profile.' : 'Checking broadcast gate.']
  ] as const;
  const quoteBlocked = inputBlockingIssues.length > 0;
  const buildBlocked = buildBlockingIssues.length > 0;

  useEffect(() => {
    if (walletMismatch) logEvent('wallet mismatch detected', 'warn', `selected=${short(selectedWalletAddress)} connected=${short(connectedWallet)}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletMismatch, selectedWalletAddress, connectedWallet]);

  const statusRows = useMemo(() => [
    ['Live trading', caps?.liveTradingEnabled ? 'enabled' : 'disabled'],
    ['Signing', caps?.signingEnabled ? 'enabled' : 'disabled'],
    ['Simulation required', caps?.requireSimulation ? 'enabled' : 'disabled'],
    ['Broadcast', caps?.broadcastEnabled ? 'enabled' : 'disabled'],
    ['Deployment', caps?.deploymentEnabled ? 'enabled' : 'disabled'],
    ['Readiness', caps?.readinessLevel ?? 'loading'],
    ['Operator auth', caps?.auth?.configured ? caps.auth.authenticated ? 'authenticated' : 'required' : 'not configured'],
    ['Wallet match', walletMismatch ? 'mismatch' : connectedWallet ? 'matched/selected' : 'connect wallet']
  ], [caps, walletMismatch, connectedWallet]);

  const checklist = [
    ['Open Profile / operator auth', authBlocked ? 'blocked' : caps ? 'pass' : 'pending', authBlocked ? 'Operator login required before live signing test.' : caps ? 'Auth state loaded.' : 'Load capabilities.'],
    ['1. Wallet connected', connectedWallet ? 'pass' : 'pending', connectedWallet ? short(connectedWallet) : 'Connect a Solana browser wallet.'],
    ['2. Active selected', walletMismatch ? 'blocked' : connectedWallet && selectedWalletAddress ? 'pass' : 'pending', walletMismatch ? `Signing blocked: selected wallet ${short(selectedWalletAddress)} does not match connected signer ${short(connectedWallet)}.` : 'Connected signer is selected/active or pending.'],
    ['3. Quote', quote?.status === 'ok' ? 'pass' : quote?.error ? 'blocked' : 'pending', quote?.status === 'ok' ? 'Quote preview complete.' : quote?.error ?? 'Run Quote preview only.'],
    ['4. Unsigned build', build?.swap?.swapTransaction ? 'pass' : build?.error ? 'blocked' : 'pending', build?.swap?.swapTransaction ? 'Unsigned transaction built.' : build?.error ?? 'Run Build unsigned tx only.'],
    ['5. Simulation', simulationPassed ? 'pass' : simulationFailureText ? 'blocked' : 'pending', simulationPassed ? 'Simulation passed.' : simulationFailureText ?? 'Run Simulate unsigned tx only.'],
    ['6. Browser signing eligible', signer.status === 'signed' ? 'pass' : signer.status === 'error' || signer.status === 'blocked' ? 'blocked' : canSign ? 'pass' : 'pending', signer.status === 'signed' ? 'Signed locally; bytes omitted from reports.' : canSign ? 'Ready for wallet prompt.' : signer.message],
    ['7. Broadcast disabled', caps?.broadcastEnabled === false ? 'pass' : 'blocked', caps?.broadcastEnabled === false ? 'Broadcast disabled in A-profile.' : 'Unexpected broadcast gate state.']
  ] as const;

  function applyPreset(nextPreset: QaPreset) {
    setPreset(nextPreset);
    if (nextPreset === 'SOL → USDC micro buy') {
      setSpendAsset('SOL');
      setSide('Buy');
      setAmount('0.001');
      setMint(USDC_MAINNET_MINT);
    }
    if (nextPreset === 'Token → SOL sell rehearsal') {
      setSpendAsset('SOL');
      setSide('Sell');
      setAmount('0.001');
      if (mint === USDC_MAINNET_MINT || mint === WSOL_MAINNET_MINT) setMint('');
    }
    resetDownstream('quote');
    logEvent('preset selected', 'info', nextPreset);
  }

  async function connectWallet() {
    const provider = (window as BrowserWindowWithSolana).solana;
    if (!provider) { setMessage('Connect a Solana browser wallet.'); logEvent('wallet connected', 'fail', 'No Solana browser wallet provider.'); return; }
    try {
      const connected = await provider.connect();
      const key = connected.publicKey.toBase58?.() ?? connected.publicKey.toString();
      setConnectedWallet(key);
      setSelectedWalletAddress(key);
      window.localStorage.setItem('bondr.activeWallet', key);
      window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address: key } }));
      await refreshRail(key, key);
      setMessage('Browser wallet connected and set as selected/active signer for local signing test. Add it as watch-only if Wallet Ops inventory is missing.');
      logEvent('wallet connected', 'pass', `connected signer ${short(key)}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Wallet connection rejected.';
      setMessage(text);
      logEvent('wallet connected', 'fail', text);
    }
  }

  async function addConnectedSignerAsWatchOnly() {
    if (!connectedWallet) { setMessage('Connect a Solana browser wallet.'); return; }
    setLoading('wallet');
    setMessage('Adding connected signer as watch-only wallet.');
    try {
      const walletPayload = await refresh();
      let groupId = walletPayload.groupId ?? wallets.find((wallet) => wallet.address === selectedWalletAddress)?.groupId ?? wallets[0]?.groupId;
      if (!groupId) {
        const railResponse = await fetch(`/api/wallet-rail?connectedSigner=${encodeURIComponent(connectedWallet)}`, { cache: 'no-store' });
        const railPayload = await railResponse.json().catch(() => null) as WalletRailSnapshot | null;
        groupId = railPayload?.defaultWatchOnlyGroup?.id;
      }
      if (!groupId) throw new Error('No Wallet Ops group is available for watch-only add.');
      const response = await fetch('/api/wallets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: connectedWallet,
          role: 'browser signer watch-only',
          groupId,
          purpose: 'Watch-only public address for A-profile browser-wallet matching and balance display.',
          status: 'active'
        })
      });
      const payload = await response.json().catch(() => null) as { error?: string; wallet?: WalletRecord; note?: string; mutationMode?: string; persisted?: boolean; alreadyExisted?: boolean } | null;
      if (!response.ok) throw new Error(`${payload?.error ?? 'Watch-only wallet add failed.'} HTTP ${response.status}.`);
      const nextWalletsPayload = await refresh();
      const savedWallet = payload?.wallet ?? nextWalletsPayload.wallets?.find((wallet) => wallet.address === connectedWallet);
      setSelectedWalletAddress(savedWallet?.address ?? connectedWallet);
      window.localStorage.setItem('bondr.activeWallet', connectedWallet);
      window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address: connectedWallet } }));
      window.dispatchEvent(new CustomEvent('bondr-watch-only-wallet-added', { detail: { address: connectedWallet } }));
      await refreshRail(connectedWallet, connectedWallet);
      setMessage(`${payload?.alreadyExisted ? 'Connected signer already existed in Wallet Ops' : 'Connected signer added as watch-only'} and selected. Storage=${payload?.mutationMode ?? 'unknown'} persisted=${Boolean(payload?.persisted)}. No private key, custody, funding, deployment, claims, or broadcast enabled.`);
      logEvent('watch-only wallet added', 'pass', `${payload?.alreadyExisted ? 'selected existing' : 'added'} public signer ${short(connectedWallet)} storage=${payload?.mutationMode ?? 'unknown'} persisted=${Boolean(payload?.persisted)}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Watch-only wallet add failed.';
      setMessage(text);
      logEvent('watch-only wallet added', 'fail', text);
    } finally {
      setLoading(null);
    }
  }

  function useConnectedSignerAsSelectedWallet() {
    if (!connectedWallet) { setMessage('Connect a Solana browser wallet.'); return; }
    if (!connectedInventoryWallet) {
      const text = 'Connected signer is not in Wallet Ops. Add it as a watch-only wallet before project-wallet match testing.';
      setMessage(text);
      logEvent('wallet match helper', 'warn', text);
      return;
    }
    setSelectedWalletAddress(connectedInventoryWallet.address);
    void refreshRail(connectedWallet, connectedInventoryWallet.address);
    setMessage('Selected wallet switched to connected signer.');
    logEvent('wallet match helper', 'pass', `selected ${connectedInventoryWallet.role} ${short(connectedInventoryWallet.address)}`);
  }

  function resetDownstream(phase: 'quote' | 'build' | 'simulation') {
    if (phase === 'quote') { setQuote(null); setBuild(null); setSimulation(null); setSigner({ status: 'idle', message: 'No local signature yet.' }); }
    if (phase === 'build') { setBuild(null); setSimulation(null); setSigner({ status: 'idle', message: 'No local signature yet.' }); }
    if (phase === 'simulation') { setSimulation(null); setSigner({ status: 'idle', message: 'No local signature yet.' }); }
  }

  function resetQaSession() {
    setQuote(null);
    setBuild(null);
    setSimulation(null);
    setSigner({ status: 'idle', message: 'No local signature yet.' });
    setEvents([]);
    setReportMessage('No report copied yet.');
    setMessage('QA session reset. Wallet remains connected in your browser extension if it was already connected.');
  }

  async function runQuote() {
    if (quoteBlocked) { setMessage(inputBlockingIssues.join(' ')); logEvent('preflight blocked', 'fail', inputBlockingIssues.join(' | ')); return; }
    logEvent('preflight passed', 'pass', 'Quote preflight passed.');
    resetDownstream('quote');
    setLoading('quote'); setMessage('Requesting quote preview only.');
    logEvent('quote requested', 'info', `${side} ${amount} ${spendAsset} mint=${short(mint)}`);
    try {
      const response = await fetch('/api/execution-quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mint, side, amount, spendAsset, slippageBps }) });
      const payload = await response.json() as QuotePayload;
      setQuote(payload);
      const text = response.ok ? 'Quote preview complete.' : payload.error ?? 'Quote preview failed.';
      setMessage(text);
      logEvent('quote result', response.ok ? 'pass' : 'fail', text);
    } catch (error) { const text = error instanceof Error ? error.message : 'Quote preview failed.'; setMessage(text); logEvent('quote result', 'fail', text); }
    finally { setLoading(null); }
  }

  async function runBuild() {
    if (buildBlocked) { setMessage(buildBlockingIssues.join(' ')); logEvent('preflight blocked', 'fail', buildBlockingIssues.join(' | ')); return; }
    logEvent('preflight passed', 'pass', 'Build preflight passed.');
    resetDownstream('build');
    if (authBlocked) { setMessage('Operator login required before live signing test.'); logEvent('unsigned build requested', 'fail', 'Operator login required before live signing test.'); return; }
    if (!connectedWallet) { setMessage('Connect a Solana browser wallet.'); logEvent('unsigned build requested', 'fail', 'Connect a Solana browser wallet.'); return; }
    if (walletMismatch) { const text = `Signing blocked: selected wallet ${selectedWalletAddress} does not match connected signer ${connectedWallet}.`; setMessage(text); logEvent('unsigned build requested', 'fail', text); return; }
    setLoading('build'); setMessage('Building unsigned transaction only.');
    logEvent('unsigned build requested', 'info', `${side} ${amount} ${spendAsset} signer=${short(connectedWallet)}`);
    try {
      const response = await fetch('/api/execution-swap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mint, side, amount, spendAsset, slippageBps, userPublicKey: connectedWallet }) });
      const payload = await response.json() as BuildPayload;
      setBuild(payload);
      if (payload.status === 'ok') setQuote(payload);
      const text = response.ok ? 'Unsigned transaction built. Simulation still required before signing.' : payload.error ?? 'Unsigned transaction build failed.';
      setMessage(text);
      logEvent('unsigned build result', response.ok ? 'pass' : 'fail', text);
    } catch (error) { const text = error instanceof Error ? error.message : 'Unsigned transaction build failed.'; setMessage(text); logEvent('unsigned build result', 'fail', text); }
    finally { setLoading(null); }
  }

  async function runSimulation() {
    resetDownstream('simulation');
    if (!build?.swap?.swapTransaction) { setMessage('Build unsigned transaction before simulation.'); logEvent('simulation requested', 'fail', 'Build unsigned transaction before simulation.'); return; }
    setLoading('simulation'); setMessage('Simulating unsigned transaction.');
    logEvent('simulation requested', 'info', 'Simulating unsigned transaction via signer dry-run route.');
    try {
      const response = await fetch('/api/terminal/signer-dry-run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unsignedTransaction: build.swap.swapTransaction, action: 'swap', mint, wallet: connectedWallet }) });
      const payload = await response.json() as SimulationPayload;
      setSimulation(payload);
      const failureText = payload.simulation?.failureSummary ?? payload.error ?? (payload.simulation?.err ? `Simulation failed: ${JSON.stringify(payload.simulation.err)}` : 'Simulation failed. Signing blocked.');
      const text = response.ok && payload.status === 'ok' ? 'Simulation passed. Signing is now eligible.' : failureText;
      setMessage(text);
      logEvent('simulation result', response.ok && payload.status === 'ok' ? 'pass' : 'warn', text);
    } catch (error) { const text = error instanceof Error ? error.message : 'Simulation request failed. Signing blocked.'; setMessage(text); logEvent('simulation result', 'warn', text); }
    finally { setLoading(null); }
  }

  async function runSign() {
    logEvent('sign requested', 'info', 'Browser-wallet signing requested.');
    if (!canSign || !build?.swap?.swapTransaction) {
      const text = walletMismatch ? `Signing blocked: selected wallet ${short(selectedWalletAddress)} does not match connected signer ${short(connectedWallet)}.` : simulationPassed ? 'Signing blocked by auth/build state.' : 'Simulation must pass before signing.';
      setSigner({ status: 'blocked', message: text });
      logEvent('sign result', 'fail', text);
      return;
    }
    const provider = (window as BrowserWindowWithSolana).solana;
    if (!provider) { setMessage('Connect a Solana browser wallet.'); logEvent('sign result', 'fail', 'Connect a Solana browser wallet.'); return; }
    setLoading('sign'); setMessage('Opening browser-wallet signing prompt. Broadcast will remain disabled.');
    try {
      const tx = VersionedTransaction.deserialize(base64ToBytes(build.swap.swapTransaction));
      const signed = await provider.signTransaction(tx);
      const signedTransaction = bytesToBase64(signed.serialize());
      setSigner({ status: 'signed', message: 'Signed locally. Broadcast disabled in A-profile.', signedTransaction });
      setMessage('Signed locally. Broadcast disabled in A-profile.');
      logEvent('sign result', 'pass', 'Signed locally. Transaction bytes omitted from reports.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Wallet signing failed or was rejected.';
      setSigner({ status: 'error', message: text });
      logEvent('sign result', 'fail', text);
    } finally { setLoading(null); }
  }

  function buildQaReport() {
    return [
      '# BONDR A-profile QA report',
      `timestamp: ${nowIso()}`,
      `path: ${typeof window !== 'undefined' ? window.location.pathname : '/live-beta-test'}`,
      '',
      '## Gates',
      `liveTradingEnabled: ${Boolean(caps?.liveTradingEnabled)}`,
      `signingEnabled: ${Boolean(caps?.signingEnabled)}`,
      `broadcastEnabled: ${Boolean(caps?.broadcastEnabled)}`,
      `deploymentEnabled: ${Boolean(caps?.deploymentEnabled)}`,
      `readinessLevel: ${caps?.readinessLevel ?? 'unknown'}`,
      `simulationRequired: ${Boolean(caps?.requireSimulation)}`,
      '',
      '## Auth / wallet',
      `auth: ${caps?.auth?.configured ? caps.auth.authenticated ? 'authenticated' : `required (${caps.auth.reason ?? 'not authenticated'})` : 'not configured'}`,
      `selectedWallet: ${short(selectedWalletAddress)}`,
      `connectedSigner: ${short(connectedWallet)}`,
      `walletMatch: ${connectedWallet && selectedWalletAddress ? String(connectedWallet === selectedWalletAddress) : 'pending'}`,
      '',
      '## Test input',
      `preset: ${preset}`,
      `mint: ${mint}`,                             
      `side: ${side}`,
      `amount: ${amount}`,
      `spendAsset: ${spendAsset}`,
      `slippageBps: ${slippageBps}`,
      '',
      '## Preflight',
      `blockingIssues: ${inputBlockingIssues.length ? inputBlockingIssues.join(' | ') : 'none'}`,
      `buildBlockingIssues: ${buildBlockingIssues.length ? buildBlockingIssues.join(' | ') : 'none'}`,
      `warnings: ${solToSolRisk ? 'SOL-to-SOL route is not useful for QA. Use USDC mint or another token mint.' : 'none'}`,
      '',
      '## Phase summary',
      `quoteStatus: ${quote?.status ?? quote?.error ?? 'not-run'}`,
      `buildStatus: ${build?.swap?.swapTransaction ? 'unsigned-built' : build?.error ?? build?.status ?? 'not-run'}`,
      `simulationStatus: ${simulation?.status ?? simulation?.error ?? 'not-run'}`,
      `signerStatus: ${signer.status} — ${signer.message}`,
      'broadcastDisabled: true — Broadcast disabled in A-profile.',
      providerLimited ? 'providerWarning: Provider-limited: simulation may fail until RPC plan is upgraded/reset.' : 'providerWarning: none observed in this session.',
      '',
      '## Wallet rail',
      `railConnectedSigner: ${short(railSnapshot?.connectedSigner ?? connectedWallet)}`,
      `railSelectedWallet: ${short(railSnapshot?.selectedWallet ?? selectedWalletAddress)}`,
      `railInventoryMatch: ${String(railSnapshot?.inventoryMatch ?? false)}`,
      `railSolBalance: ${railSnapshot?.solBalance ?? 'unknown'}`,
      `railSelectedSolBalance: ${railSnapshot?.selectedSolBalance ?? 'unknown'}`,
      `railBalanceStatus: ${railSnapshot?.balanceStatus ?? 'not-loaded'}`,
      `railWarnings: ${railSnapshot?.warnings?.join(' | ') ?? 'none'}`,
      '',
      '## Event log',
      ...(events.length ? events.slice().reverse().map((event) => `- ${event.at} [${event.status}] ${event.type}: ${event.message}`) : ['- no events recorded']),
      '',
      '## Omitted intentionally',
      '- private keys / seed phrases',
      '- full unsigned transaction base64',
      '- full signed transaction bytes',
      '- cookies / session secrets / auth tokens'
    ].join('\n');
  }

  async function copyQaReport() {
    const report = buildQaReport();
    try {
      await navigator.clipboard.writeText(report);
      setReportMessage('QA report copied. It omits signed/unsigned transaction bytes and secrets.');
      logEvent('qa report copied', 'pass', 'Copied sanitized QA report.');
    } catch {
      setReportMessage('Clipboard copy failed. Select the report text from browser devtools/state is not exposed here; retry from a secure browser context.');
      logEvent('qa report copied', 'fail', 'Clipboard copy failed.');
    }
  }

  return (
    <section className="documentCard qaHarnessPanel" aria-label="A-profile manual QA harness">
      <div className="sectionIntro compactIntro"><span>Manual QA harness</span><h2>Test each A-profile phase separately.</h2><p>{message}</p></div>
      <ol className="qaChecklist" aria-label="A-profile QA checklist">
        {checklist.map(([label, state, detail]) => <li className={`qaChecklistStep ${state}`} key={label}><strong>{label}</strong><span>{detail}</span><em>{state}</em></li>)}
      </ol>
      <div className="qaStatusGrid">{statusRows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {authBlocked && <div className="operatorAuthNotice"><strong>Operator login required before live signing test.</strong><p>Open Profile, authenticate, then return to this page.</p><a className="button secondary" href="/profile">Open Profile</a></div>}
      {walletMismatch && <div className="walletMismatchNotice"><strong>Signer mismatch blocks signing</strong><p>Selected wallet and connected signer must match before build/sign testing.</p><p>Selected wallet: <code>{selectedWalletAddress}</code></p><p>Connected signer: <code>{connectedWallet}</code></p></div>}
      {connectedWallet && !connectedInventoryWallet && <div className="walletMismatchNotice"><strong>Connected signer is not in Wallet Ops.</strong><p>Add it as a watch-only wallet before project-wallet match testing. This stores only the public address and does not enable custody, funding, deployment, claims, or broadcast.</p><button className="button secondary" type="button" onClick={() => void addConnectedSignerAsWatchOnly()} disabled={loading !== null}>{loading === 'wallet' ? 'Adding…' : 'Add connected signer as watch-only wallet'}</button></div>}
      <section className="qaPresetPanel" aria-label="A-profile test presets">
        <div className="qaResultHeader"><span>Test presets</span><strong>{preset}</strong></div>
        <div className="qaActionRow">
          <button className="button secondary" type="button" onClick={() => applyPreset('SOL → USDC micro buy')}>SOL → USDC micro buy</button>
          <button className="button secondary" type="button" onClick={() => applyPreset('Token → SOL sell rehearsal')}>Token → SOL sell rehearsal</button>
          <button className="button secondary" type="button" onClick={() => applyPreset('Custom')}>Custom</button>
        </div>
        <p className="qaMuted">USDC preset uses the canonical mainnet USDC mint. Sell rehearsal requires your connected wallet to actually hold the token and may fail if balance is missing.</p>
      </section>
      <section className="qaResultCard" aria-label="Preflight input status">
        <div className="qaResultHeader"><span>Preflight input status</span><strong>{inputBlockingIssues.length ? 'blocked' : 'pass'}</strong></div>
        <div className="qaPreviewGrid">{preflightRows.map(([label, state, detail]) => <div className={`qaPreflightRow ${state}`} key={label}><span>{label}</span><strong>{state}</strong><small>{detail}</small></div>)}</div>
      </section>
      <div className="qaFormGrid">
        <label><span>Test mint</span><input value={mint} onChange={(event) => { setPreset('Custom'); setMint(event.target.value); resetDownstream('quote'); }} /></label>
        <label><span>Selected/project wallet</span><select value={selectedWalletAddress} onChange={(event) => { setSelectedWalletAddress(event.target.value); resetDownstream('build'); }}>{wallets.map((wallet) => <option value={wallet.address} key={wallet.id}>{wallet.role} · {short(wallet.address)}</option>)}{!wallets.length && <option value="">No wallets loaded</option>}</select><small>{walletSolLabel(selectedWallet)}</small></label>
        <label><span>Side</span><select value={side} onChange={(event) => { setPreset('Custom'); setSide(event.target.value as 'Buy' | 'Sell'); resetDownstream('quote'); }}><option>Buy</option><option>Sell</option></select></label>
        <label><span>Amount</span><input value={amount} onChange={(event) => { setPreset('Custom'); setAmount(event.target.value); resetDownstream('quote'); }} /></label>
        <label><span>Spend asset</span><select value={spendAsset} onChange={(event) => { setPreset('Custom'); setSpendAsset(event.target.value as 'SOL' | 'USDC'); resetDownstream('quote'); }}><option>SOL</option><option>USDC</option></select></label>
        <label><span>Slippage bps</span><input value={slippageBps} onChange={(event) => { setPreset('Custom'); setSlippageBps(event.target.value); resetDownstream('quote'); }} /></label>
        <label><span>Connected signer</span><input value={connectedWallet || 'No browser wallet connected'} readOnly /></label>
      </div>
      <div className="qaActionRow">
        <button className="button secondary" type="button" onClick={() => void refresh()}>Refresh capabilities</button>
        <button className="button secondary" type="button" onClick={() => void refreshRail()}>Refresh wallet rail</button>
        <button className="button secondary" type="button" onClick={() => void connectWallet()}>{connectedWallet ? 'Reconnect wallet' : 'Connect wallet'}</button>
        <button className="button secondary" type="button" onClick={() => void addConnectedSignerAsWatchOnly()} disabled={loading !== null || !connectedWallet || Boolean(connectedInventoryWallet)}>{loading === 'wallet' ? 'Adding…' : connectedInventoryWallet ? 'Connected signer already in Wallet Ops' : 'Add signer watch-only'}</button>
        <button className="button secondary" type="button" onClick={useConnectedSignerAsSelectedWallet}>Use connected signer as selected wallet</button>
        <button className="button" type="button" onClick={() => void runQuote()} disabled={loading !== null || quoteBlocked}>{loading === 'quote' ? 'Quoting…' : 'Quote preview only'}</button>
        <button className="button" type="button" onClick={() => void runBuild()} disabled={loading !== null || buildBlocked}>{loading === 'build' ? 'Building…' : 'Build unsigned tx only'}</button>
        <button className="button" type="button" onClick={() => void runSimulation()} disabled={loading !== null || !build?.swap?.swapTransaction}>{loading === 'simulation' ? 'Simulating…' : 'Simulate unsigned tx only'}</button>
        <button className="button" type="button" onClick={() => void runSign()} disabled={loading !== null || !canSign}>{loading === 'sign' ? 'Signing…' : 'Sign in wallet'}</button>
        <button className="button secondary" type="button" disabled onClick={() => setMessage('Broadcast disabled in A-profile.')}>Broadcast disabled in A-profile</button>
        <button className="button secondary" type="button" onClick={() => void copyQaReport()}>Copy QA Report</button>
        <button className="button secondary" type="button" onClick={resetQaSession}>Reset QA Session</button>
      </div>
      <p className="qaMuted">{reportMessage}</p>
      <div className="qaResultGrid">
        <ResultCard title="Capabilities / auth" status={caps?.readinessLevel}><pre>{jsonText({ liveTradingEnabled: caps?.liveTradingEnabled, signingEnabled: caps?.signingEnabled, broadcastEnabled: caps?.broadcastEnabled, deploymentEnabled: caps?.deploymentEnabled, readinessLevel: caps?.readinessLevel, auth: caps?.auth, limits: caps?.limits })}</pre></ResultCard>
        <ResultCard title="Quote result" status={quote?.status}><PreviewCard preview={quote?.transactionPreview} /><pre>{jsonText(quote?.quote ?? quote?.error ?? 'No quote yet.')}</pre></ResultCard>
        <ResultCard title="Unsigned transaction result" status={build?.status}><PreviewCard preview={build?.transactionPreview} /><pre>{jsonText(build?.swap ? { hasSwapTransaction: Boolean(build.swap.swapTransaction), lastValidBlockHeight: build.swap.lastValidBlockHeight, computeUnitLimit: build.swap.computeUnitLimit, prioritizationFeeLamports: build.swap.prioritizationFeeLamports } : build?.error ?? 'No build yet.')}</pre></ResultCard>
        <ResultCard title="Simulation logs/result" status={simulation?.status}><PreviewCard preview={simulation?.transactionPreview} /><pre>{jsonText(simulation?.simulation ?? simulation?.error ?? 'No simulation yet.')}</pre></ResultCard>
        <ResultCard title="Signer result" status={signer.status}><p>{signer.message}</p><small>{signer.signedTransaction ? `${signer.signedTransaction.length} base64 chars held client-side only; omitted from QA reports` : 'No signed transaction stored.'}</small></ResultCard>
        <ResultCard title="Broadcast gate result" status="disabled"><p>Broadcast disabled in A-profile.</p><small>Submit/Broadcast remains a separate future gate and is not called by this harness.</small></ResultCard>
        <ResultCard title="Wallet rail result" status={railSnapshot?.balanceStatus ?? 'not-loaded'}><pre>{jsonText({ connectedSigner: railSnapshot?.connectedSigner, selectedWallet: railSnapshot?.selectedWallet, inventoryMatch: railSnapshot?.inventoryMatch, selectedInventoryMatch: railSnapshot?.selectedInventoryMatch, solBalance: railSnapshot?.solBalance, selectedSolBalance: railSnapshot?.selectedSolBalance, tokenBalances: railSnapshot?.tokenBalances, selectedTokenBalances: railSnapshot?.selectedTokenBalances, warnings: railSnapshot?.warnings, blockers: railSnapshot?.blockers })}</pre></ResultCard>
        <ResultCard title="QA event log" status={`${events.length} events`}><div className="qaEventLog">{events.length ? events.map((event) => <div className={`qaEventRow ${event.status}`} key={event.id}><span>{event.at}</span><strong>{event.type}</strong><p>{event.message}</p></div>) : <p className="qaMuted">No QA events yet.</p>}</div></ResultCard>
      </div>
    </section>
  );
}
