'use client';

import { useState } from 'react';
import { Keypair, VersionedTransaction } from '@solana/web3.js';

type BuildState = {
  status?: string;
  operation?: string;
  execution?: string;
  reason?: string;
  error?: string;
  signer?: string;
  requiredSigners?: string[];
  mint?: string;
  ownerAta?: string | null;
  transactionBase64?: string;
};

type PumpPortalPreviewState = {
  status?: string;
  preview?: {
    status: string;
    execution: string;
    blockers: string[];
    warnings: string[];
    payloadPreview: {
      publicKey: string | null;
      mint: string | null;
      amount: number;
      slippage: number;
      priorityFee: number;
      pool: string;
    };
    ipfs: {
      status: string;
      imageSource: string;
      metadataUri: string | null;
      providerConfigured: boolean;
    };
    signerPreview: {
      devWalletAddress: string | null;
      connectedSigner: string | null;
      signerProofStatus: string;
      custodyMode: string;
      serverCustody: boolean;
    };
  };
  error?: string;
};

type PumpPortalBuildState = {
  status?: string;
  result?: {
    status: string;
    execution: string;
    blockers: string[];
    warnings: string[];
    safety: { providerCallEnabled: boolean; confirmBuild: boolean };
    builder?: { selected: string; pumpPortalEnabled: boolean; directSdkEnabled: boolean; directSdkMode?: string };
    requestBody: { publicKey: string | null; mint: string | null; amount: number; slippage: number; priorityFee: number; pool: string };
    build?: { transactionBytes: number; transactionHash: string; transactionBase64?: string; messageHash: string; requiredSigners: string[]; mint: string; feePayer: string | null; programs: string[] };
    intent?: { id: string; status: string; expectedSigner: string; expectedMint: string; transactionMessageHash: string | null; expiresAt: string } | null;
    providerResponse?: { status: number; statusText: string; contentType: string; bodyPreview?: string };
  };
  error?: string;
};

type IpfsMetadataState = {
  status?: string;
  metadataUri?: string;
  imageUri?: string;
  execution?: string;
  readiness?: {
    status: string;
    providerConfigured: boolean;
    blockers: string[];
    metadataUri: string | null;
    image: { source: string; url: string | null };
    metadataJson: { name: string; symbol: string; image: string };
  };
  error?: string;
};

type ShadowPlanState = {
  status?: string;
  packet?: {
    status: string;
    packetHash: string;
    completeness: {
      backendScore: number;
      shadowExecutableScore: number;
      readyStages: number;
      totalStages: number;
      missingStages: string[];
    };
    spine: Array<{ step: string; status: string; blockers: string[]; detail: string }>;
    blockers: string[];
    warnings: string[];
    audit: { persisted: boolean; storage: string; auditId: string; error?: string };
    gates: {
      signingEnabled: boolean;
      broadcastEnabled: boolean;
      fundingBroadcastEnabled: boolean;
      deploymentEnabled: boolean;
      jitoRelayEnabled: boolean;
    };
    execution: string;
  };
  error?: string;
};

type SimulationState = {
  status?: string;
  execution?: string;
  error?: string;
  broadcastEnabled?: boolean;
  simulation?: { err?: unknown; logs?: string[]; unitsConsumed?: number | null; failureSummary?: string | null };
  transactionPreview?: { simulationStatus?: string; blockers?: string[]; warnings?: string[] };
};

type SignedCreateState = {
  status: 'idle' | 'signed' | 'blocked' | 'error';
  message: string;
  signedTransaction?: string;
  intentId?: string;
  expectedSigner?: string;
  expectedMint?: string;
  transactionMessageHash?: string | null;
  simulationStatus?: string;
};

type SignedReviewState = {
  status?: string;
  execution?: string;
  broadcast?: string;
  intentId?: string;
  blockers?: string[];
  warnings?: string[];
  error?: string;
  review?: {
    localSignatureReviewPassed?: boolean;
    safeToBroadcastIfLiveEnabled?: boolean;
    signerMatched?: boolean;
    expectedMintReferenced?: boolean;
    programsAllowed?: boolean;
    transactionMessageHash?: string | null;
  };
};

type BroadcastState = {
  status?: string;
  execution?: string;
  error?: string;
  signature?: string;
  explorerUrl?: string;
  launchReceiptPersistence?: { status?: string; persisted?: boolean; error?: string; mode?: string } | null;
  blockers?: string[];
  warnings?: string[];
  broadcastEnabled?: boolean;
  transactionPreview?: { blockers?: string[]; warnings?: string[]; action?: string };
};

type BrowserSolanaProvider = {
  publicKey?: { toString(): string; toBase58?: () => string };
  connect(): Promise<{ publicKey: { toString(): string; toBase58?: () => string } }>;
  signTransaction?(transaction: VersionedTransaction): Promise<VersionedTransaction>;
};
type BrowserWindowWithSolana = Window & { solana?: BrowserSolanaProvider };

function short(value?: string | null) {
  return value ? `${value.slice(0, 6)}...${value.slice(-5)}` : 'not set';
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

export function DeploymentLaunchBuilderPanel({ projectId, defaultPayer, deploymentEnabled }: { projectId: string; defaultPayer?: string | null; deploymentEnabled: boolean }) {
  const [payer, setPayer] = useState(defaultPayer ?? '');
  const [mint, setMint] = useState('');
  const [decimals, setDecimals] = useState('6');
  const [initialSupply, setInitialSupply] = useState('0');
  const [freezeAuthority, setFreezeAuthority] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BuildState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pumpPortalPreview, setPumpPortalPreview] = useState<PumpPortalPreviewState | null>(null);
  const [pumpPortalBuild, setPumpPortalBuild] = useState<PumpPortalBuildState | null>(null);
  const [pumpPortalBuildLoading, setPumpPortalBuildLoading] = useState(false);
  const [ipfsLoading, setIpfsLoading] = useState(false);
  const [ipfsResult, setIpfsResult] = useState<IpfsMetadataState | null>(null);
  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [signedCreate, setSignedCreate] = useState<SignedCreateState>({ status: 'idle', message: 'Build and simulate an unsigned create transaction before local signing.' });
  const [signedReview, setSignedReview] = useState<SignedReviewState | null>(null);
  const [signedReviewLoading, setSignedReviewLoading] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastState | null>(null);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [shadowLoading, setShadowLoading] = useState(false);
  const [shadowPlan, setShadowPlan] = useState<ShadowPlanState | null>(null);
  const [clientMintKeypair, setClientMintKeypair] = useState<Keypair | null>(null);
  const [connectedSigner, setConnectedSigner] = useState('');
  const [signerProofMessage, setSignerProofMessage] = useState('Connect browser wallet to prove the deployer signer before building.');

  async function buildUnsigned() {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/deployment-engine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'create-spl-token',
          projectId,
          payer,
          mint,
          decimals: Number(decimals),
          initialSupply: Number(initialSupply),
          freezeAuthority: freezeAuthority.trim() || null
        })
      });
      const payload = await response.json().catch(() => ({})) as BuildState;
      setResult(payload);
    } catch (error) {
      setResult({ status: 'error', error: error instanceof Error ? error.message : 'Launch builder request failed.' });
    } finally {
      setLoading(false);
    }
  }

  async function previewPumpPortalCreate() {
    setPreviewLoading(true);
    setPumpPortalPreview(null);
    try {
      const response = await fetch('/api/deployment/pumpportal/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, mintPublicKey: mint.trim() || null, connectedSigner: connectedSigner.trim() || null })
      });
      const payload = await response.json().catch(() => ({})) as PumpPortalPreviewState;
      setPumpPortalPreview(payload);
    } catch (error) {
      setPumpPortalPreview({ status: 'error', error: error instanceof Error ? error.message : 'PumpPortal preview request failed.' });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function buildPumpPortalCreate(confirmBuild: boolean) {
    setPumpPortalBuildLoading(true);
    setPumpPortalBuild(null);
    setSimulation(null);
    setSignedReview(null);
    setBroadcastResult(null);
    setSignedCreate({ status: 'idle', message: 'Build and simulate an unsigned create transaction before local signing.' });
    try {
      const response = await fetch('/api/deployment/pumpportal/build-create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          mintPublicKey: mint.trim() || null,
          connectedSigner: connectedSigner.trim() || null,
          confirmBuild,
          includeUnsignedTransaction: confirmBuild,
          createIntent: confirmBuild
        })
      });
      const payload = await response.json().catch(() => ({})) as PumpPortalBuildState;
      setPumpPortalBuild(payload);
    } catch (error) {
      setPumpPortalBuild({ status: 'error', error: error instanceof Error ? error.message : 'PumpPortal build-create request failed.' });
    } finally {
      setPumpPortalBuildLoading(false);
    }
  }

  async function simulatePumpPortalCreate() {
    const unsignedTransaction = pumpPortalBuild?.result?.build?.transactionBase64;
    if (!unsignedTransaction) {
      setSimulation({ status: 'blocked', error: 'Build an unsigned PumpPortal create transaction first.' });
      return;
    }
    setSimulationLoading(true);
    setSignedCreate({ status: 'idle', message: 'Simulation running. Sign only after it passes.' });
    try {
      const response = await fetch('/api/terminal/signer-dry-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          unsignedTransaction,
          action: 'create',
          mint: pumpPortalBuild?.result?.requestBody.mint ?? mint,
          wallet: connectedSigner || payer
        })
      });
      const payload = await response.json().catch(() => ({})) as SimulationState;
      setSimulation(payload);
      setSignedCreate({
        status: payload.status === 'ok' ? 'idle' : 'blocked',
        message: payload.status === 'ok' ? 'Simulation passed. Ready for local browser signing.' : payload.error ?? 'Simulation did not pass.'
      });
    } catch (error) {
      setSimulation({ status: 'error', error: error instanceof Error ? error.message : 'Simulation request failed.' });
      setSignedCreate({ status: 'error', message: error instanceof Error ? error.message : 'Simulation request failed.' });
    } finally {
      setSimulationLoading(false);
    }
  }

  async function signPumpPortalCreate() {
    const unsignedTransaction = pumpPortalBuild?.result?.build?.transactionBase64;
    const intent = pumpPortalBuild?.result?.intent;
    if (!unsignedTransaction || !intent) {
      setSignedCreate({ status: 'blocked', message: 'Unsigned transaction and bound intent are required before signing.' });
      return;
    }
    if (simulation?.status !== 'ok') {
      setSignedCreate({ status: 'blocked', message: 'Simulation must pass before signing.' });
      return;
    }
    if (!clientMintKeypair || clientMintKeypair.publicKey.toBase58() !== pumpPortalBuild?.result?.requestBody.mint) {
      setSignedCreate({ status: 'blocked', message: 'The in-memory client mint keypair must match the built mint public key.' });
      return;
    }
    const provider = typeof window !== 'undefined' ? (window as BrowserWindowWithSolana).solana : undefined;
    if (!provider?.signTransaction) {
      setSignedCreate({ status: 'blocked', message: 'Browser wallet does not expose signTransaction.' });
      return;
    }
    try {
      const tx = VersionedTransaction.deserialize(base64ToBytes(unsignedTransaction));
      tx.sign([clientMintKeypair]);
      const signed = await provider.signTransaction(tx);
      const signedTransaction = bytesToBase64(signed.serialize());
      const signedState = {
        status: 'signed',
        message: 'Signed locally. Broadcast still requires explicit gate and final submit action.',
        signedTransaction,
        intentId: intent.id,
        expectedSigner: intent.expectedSigner,
        expectedMint: intent.expectedMint,
        transactionMessageHash: intent.transactionMessageHash,
        simulationStatus: 'ok'
      } satisfies SignedCreateState;
      setSignedCreate(signedState);
      await reviewSignedCreate(signedState);
    } catch (error) {
      setSignedCreate({ status: 'error', message: error instanceof Error ? error.message : 'Local signing failed.' });
    }
  }

  async function reviewSignedCreate(source: SignedCreateState = signedCreate) {
    if (!source.signedTransaction || !source.intentId) {
      setSignedReview({ status: 'blocked', error: 'Signed transaction and intent are required before signed review.' });
      return;
    }
    setSignedReviewLoading(true);
    setSignedReview(null);
    setBroadcastResult(null);
    try {
      const response = await fetch('/api/terminal/signed-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: source.signedTransaction,
          intentId: source.intentId,
          expectedSigner: source.expectedSigner,
          expectedMint: source.expectedMint,
          transactionMessageHash: source.transactionMessageHash,
          simulationStatus: source.simulationStatus
        })
      });
      const payload = await response.json().catch(() => ({})) as SignedReviewState;
      setSignedReview(payload);
    } catch (error) {
      setSignedReview({ status: 'error', error: error instanceof Error ? error.message : 'Signed review request failed.' });
    } finally {
      setSignedReviewLoading(false);
    }
  }

  async function broadcastSignedCreate() {
    if (!signedCreate.signedTransaction || !signedCreate.intentId || signedReview?.status !== 'ok') {
      setBroadcastResult({ status: 'blocked', error: 'Broadcast requires a signed packet and passed signed review.' });
      return;
    }
    setBroadcastLoading(true);
    setBroadcastResult(null);
    try {
      const response = await fetch('/api/send-signed-transaction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'launch',
          projectId,
          signedTransaction: signedCreate.signedTransaction,
          intentId: signedCreate.intentId,
          expectedSigner: signedCreate.expectedSigner,
          expectedMint: signedCreate.expectedMint,
          transactionMessageHash: signedCreate.transactionMessageHash,
          simulationStatus: signedCreate.simulationStatus
        })
      });
      const payload = await response.json().catch(() => ({})) as BroadcastState;
      setBroadcastResult(payload);
    } catch (error) {
      setBroadcastResult({ status: 'error', error: error instanceof Error ? error.message : 'Broadcast request failed.' });
    } finally {
      setBroadcastLoading(false);
    }
  }

  function generateClientMintKeypair() {
    const keypair = Keypair.generate();
    setClientMintKeypair(keypair);
    setMint(keypair.publicKey.toBase58());
    setResult(null);
    setPumpPortalPreview(null);
    setPumpPortalBuild(null);
    setShadowPlan(null);
    setSignedReview(null);
    setBroadcastResult(null);
    setSignedCreate({ status: 'idle', message: 'Build and simulate an unsigned create transaction before local signing.' });
  }

  async function connectBrowserSigner() {
    const provider = typeof window !== 'undefined' ? (window as BrowserWindowWithSolana).solana : undefined;
    if (!provider) {
      setSignerProofMessage('No browser Solana wallet provider found.');
      return;
    }
    try {
      const response = await provider.connect();
      const address = response.publicKey.toBase58?.() ?? response.publicKey.toString();
      setConnectedSigner(address);
      setPayer((current) => current || address);
      setSignerProofMessage(address === payer || !payer ? 'Browser signer connected. No transaction signature requested.' : 'Connected signer does not match the selected deployer.');
    } catch (error) {
      setSignerProofMessage(error instanceof Error ? error.message : 'Browser signer connection failed.');
    }
  }

  const signerMatches = Boolean(connectedSigner && payer && connectedSigner === payer);

  async function requestIpfsMetadata(confirmPin: boolean) {
    setIpfsLoading(true);
    setIpfsResult(null);
    try {
      const response = await fetch('/api/deployment/ipfs/metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, confirmPin })
      });
      const payload = await response.json().catch(() => ({})) as IpfsMetadataState;
      setIpfsResult(payload);
    } catch (error) {
      setIpfsResult({ status: 'error', error: error instanceof Error ? error.message : 'IPFS metadata request failed.' });
    } finally {
      setIpfsLoading(false);
    }
  }

  async function buildShadowPlan(persistAudit: boolean) {
    setShadowLoading(true);
    setShadowPlan(null);
    try {
      const response = await fetch('/api/execution/shadow-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          mintPublicKey: mint.trim() || null,
          connectedSigner: connectedSigner.trim() || null,
          expectedSigners: connectedSigner ? [connectedSigner] : [],
          simulationProof: result?.transactionBase64 || pumpPortalBuild?.result?.build?.transactionHash ? { source: 'local-shadow-build-preview' } : null,
          approvalId: null,
          persistAudit
        })
      });
      const payload = await response.json().catch(() => ({})) as ShadowPlanState;
      setShadowPlan(payload);
    } catch (error) {
      setShadowPlan({ status: 'error', error: error instanceof Error ? error.message : 'Shadow execution packet request failed.' });
    } finally {
      setShadowLoading(false);
    }
  }

  const disabledReason = !deploymentEnabled
    ? 'Deployment gate closed. Builder is visible for planning only.'
    : !payer || !mint
      ? 'Payer and client-created mint address are required.'
      : null;

  return (
    <section className="documentCard deploymentLaunchBuilderPanel">
      <div className="sectionIntro compactIntro">
        <span>Launch builder</span>
        <h2>Unsigned SPL token launch transaction</h2>
        <p>Builds an unsigned token-mint transaction only after the deployment gate is opened. Browser wallet and mint keypair signatures are still required. No broadcast happens here.</p>
      </div>
      <div className="deploymentBuilderGrid">
        <label><span>Payer / deployer signer</span><input value={payer} onChange={(event) => setPayer(event.target.value)} placeholder="Browser wallet public key" /></label>
        <label><span>Mint public key</span><input value={mint} onChange={(event) => setMint(event.target.value)} placeholder="Client-created mint keypair public key" /></label>
        <label><span>Decimals</span><input type="number" min="0" max="9" step="1" value={decimals} onChange={(event) => setDecimals(event.target.value)} /></label>
        <label><span>Initial supply</span><input type="number" min="0" step="1" value={initialSupply} onChange={(event) => setInitialSupply(event.target.value)} /></label>
        <label className="wide"><span>Freeze authority</span><input value={freezeAuthority} onChange={(event) => setFreezeAuthority(event.target.value)} placeholder="Optional. Leave blank for none." /></label>
      </div>
      <div className="pumpPortalPreviewPanel">
        <div>
          <span>Mint keypair</span>
          <strong>{clientMintKeypair ? short(clientMintKeypair.publicKey.toBase58()) : 'Not generated in this browser session'}</strong>
          <small>The mint keypair is generated client-side and held only in browser memory. BONDR sends/stores the public key only.</small>
        </div>
        <button className="button secondary" type="button" onClick={generateClientMintKeypair}>
          Generate Client Mint
        </button>
      </div>
      <div className="pumpPortalPreviewPanel">
        <div>
          <span>Signer proof</span>
          <strong className={signerMatches ? 'profitText' : 'dangerText'}>{signerMatches ? 'Deployer signer matched' : short(connectedSigner) || 'Not connected'}</strong>
          <small>{signerProofMessage}</small>
        </div>
        <button className="button secondary" type="button" onClick={() => void connectBrowserSigner()}>
          Connect Signer
        </button>
      </div>
      <div className="deploymentBuilderActionRow">
        <button className="button secondary" type="button" onClick={buildUnsigned} disabled={loading || Boolean(disabledReason)}>
          {loading ? 'Building...' : deploymentEnabled ? 'Build unsigned launch tx' : 'Launch builder gated'}
        </button>
        <small className={disabledReason ? 'dangerText' : 'profitText'}>{disabledReason ?? 'Ready to build unsigned transaction. No signing or broadcast.'}</small>
      </div>
      {result && (
        <div className="deploymentBuilderResult">
          <div><span>Status</span><strong>{result.status ?? result.execution ?? 'unknown'}</strong></div>
          <div><span>Mint</span><strong>{short(result.mint ?? mint)}</strong></div>
          <div><span>Required signers</span><strong>{result.requiredSigners?.map(short).join(', ') || 'not built'}</strong></div>
          <div><span>Owner ATA</span><strong>{short(result.ownerAta)}</strong></div>
          {(result.error || result.reason) && <p>{result.error ?? result.reason}</p>}
          {result.transactionBase64 && <p>Unsigned payload built. Transaction bytes intentionally hidden from the normal UI.</p>}
        </div>
      )}
      <div className="pumpPortalPreviewPanel">
        <div>
          <span>IPFS metadata</span>
          <strong>Pinata image + metadata JSON</strong>
          <small>Preview is read-only. Pinning requires `PINATA_JWT` or `BONDR_PINATA_API` and the explicit pin action.</small>
        </div>
        <span className="deploymentBuilderActionRow">
          <button className="button secondary" type="button" onClick={() => void requestIpfsMetadata(false)} disabled={ipfsLoading}>
            {ipfsLoading ? 'Checking...' : 'Preview IPFS'}
          </button>
          <button className="button secondary" type="button" onClick={() => void requestIpfsMetadata(true)} disabled={ipfsLoading}>
            Pin Metadata
          </button>
        </span>
      </div>
      {ipfsResult && (
        <div className="pumpPortalPreviewResult">
          <div><span>Status</span><strong>{ipfsResult.status ?? ipfsResult.readiness?.status ?? 'unknown'}</strong></div>
          <div><span>Provider</span><strong>{ipfsResult.readiness?.providerConfigured ? 'configured' : 'missing'}</strong><small>Pinata JWT</small></div>
          <div><span>Image</span><strong>{ipfsResult.imageUri ?? ipfsResult.readiness?.image.source ?? 'unknown'}</strong><small>{short(ipfsResult.readiness?.image.url)}</small></div>
          <div><span>Metadata URI</span><strong>{ipfsResult.metadataUri ?? ipfsResult.readiness?.metadataUri ?? 'not pinned'}</strong></div>
          <div className="wide"><span>Blockers</span><strong>{ipfsResult.readiness?.blockers.length ? ipfsResult.readiness.blockers.join(', ') : ipfsResult.error ?? ipfsResult.execution ?? 'ready'}</strong></div>
        </div>
      )}
      <div className="pumpPortalPreviewPanel">
        <div>
          <span>PumpPortal create preview</span>
          <strong>IPFS metadata + trade-local create contract</strong>
          <small>Preview stays local. Build-create calls PumpPortal only when the provider build flag is enabled and still returns unsigned bytes only.</small>
        </div>
        <span className="deploymentBuilderActionRow">
          <button className="button secondary" type="button" onClick={previewPumpPortalCreate} disabled={previewLoading || pumpPortalBuildLoading}>
            {previewLoading ? 'Checking...' : 'Preview Create'}
          </button>
          <button className="button secondary" type="button" onClick={() => void buildPumpPortalCreate(false)} disabled={previewLoading || pumpPortalBuildLoading}>
            {pumpPortalBuildLoading ? 'Checking...' : 'Build Readiness'}
          </button>
          <button className="button secondary" type="button" onClick={() => void buildPumpPortalCreate(true)} disabled={previewLoading || pumpPortalBuildLoading}>
            {pumpPortalBuildLoading ? 'Building...' : 'Build Unsigned Create'}
          </button>
        </span>
      </div>
      {pumpPortalPreview && (
        <div className="pumpPortalPreviewResult">
          <div><span>Status</span><strong>{pumpPortalPreview.preview?.status ?? pumpPortalPreview.status ?? 'unknown'}</strong></div>
          <div><span>IPFS</span><strong>{pumpPortalPreview.preview?.ipfs.status ?? 'unknown'}</strong><small>{pumpPortalPreview.preview?.ipfs.imageSource ?? 'no image'} · provider {pumpPortalPreview.preview?.ipfs.providerConfigured ? 'configured' : 'missing'}</small></div>
          <div><span>Dev signer</span><strong>{short(pumpPortalPreview.preview?.signerPreview.devWalletAddress)}</strong><small>{pumpPortalPreview.preview?.signerPreview.custodyMode ?? 'unknown'} · server custody {pumpPortalPreview.preview?.signerPreview.serverCustody ? 'yes' : 'no'}</small></div>
          <div><span>Signer proof</span><strong>{pumpPortalPreview.preview?.signerPreview.signerProofStatus ?? 'unknown'}</strong><small>{short(pumpPortalPreview.preview?.signerPreview.connectedSigner)}</small></div>
          <div><span>Amount / fee</span><strong>{pumpPortalPreview.preview ? `${pumpPortalPreview.preview.payloadPreview.amount.toFixed(4)} SOL` : 'unknown'}</strong><small>priority {pumpPortalPreview.preview?.payloadPreview.priorityFee ?? 0} SOL · slippage {pumpPortalPreview.preview?.payloadPreview.slippage ?? 0}%</small></div>
          <div className="wide"><span>Blockers</span><strong>{pumpPortalPreview.preview?.blockers.length ? pumpPortalPreview.preview.blockers.join(', ') : pumpPortalPreview.error ?? 'preview-ready; live gates still require approval'}</strong></div>
          {Boolean(pumpPortalPreview.preview?.warnings.length) && <div className="wide"><span>Warnings</span><strong>{pumpPortalPreview.preview?.warnings.join(', ')}</strong></div>}
        </div>
      )}
      {pumpPortalBuild && (
        <div className="pumpPortalPreviewResult">
          <div><span>Build status</span><strong>{pumpPortalBuild.result?.status ?? pumpPortalBuild.status ?? 'unknown'}</strong><small>{pumpPortalBuild.result?.execution ?? pumpPortalBuild.error ?? 'no provider call'}</small></div>
          <div><span>Provider call</span><strong>{pumpPortalBuild.result?.safety.providerCallEnabled ? 'enabled' : 'disabled'}</strong><small>confirm {pumpPortalBuild.result?.safety.confirmBuild ? 'yes' : 'no'}</small></div>
          <div><span>Builder</span><strong>{pumpPortalBuild.result?.builder?.selected ?? 'pumpportal-local-create'}</strong><small>{pumpPortalBuild.result?.builder?.directSdkMode ?? (pumpPortalBuild.result?.builder?.directSdkEnabled ? 'direct SDK enabled' : 'PumpPortal Local')}</small></div>
          <div><span>Mint</span><strong>{short(pumpPortalBuild.result?.requestBody.mint)}</strong><small>fee payer {short(pumpPortalBuild.result?.build?.feePayer)}</small></div>
          <div><span>Unsigned bytes</span><strong>{pumpPortalBuild.result?.build ? `${pumpPortalBuild.result.build.transactionBytes} bytes` : 'not built'}</strong><small>{pumpPortalBuild.result?.build?.transactionBase64 ? 'handoff ready' : short(pumpPortalBuild.result?.build?.transactionHash)}</small></div>
          <div><span>Intent</span><strong>{short(pumpPortalBuild.result?.intent?.id)}</strong><small>{pumpPortalBuild.result?.intent?.status ?? 'not bound'}</small></div>
          <div className="wide"><span>Blockers</span><strong>{pumpPortalBuild.result?.blockers.length ? pumpPortalBuild.result.blockers.join(', ') : pumpPortalBuild.error ?? 'build-ready'}</strong></div>
          {pumpPortalBuild.result?.providerResponse && <div className="wide"><span>Provider response</span><strong>{pumpPortalBuild.result.providerResponse.status} {pumpPortalBuild.result.providerResponse.statusText}</strong><small>{pumpPortalBuild.result.providerResponse.bodyPreview ?? pumpPortalBuild.result.providerResponse.contentType}</small></div>}
        </div>
      )}
      <div className="pumpPortalPreviewPanel">
        <div>
          <span>Simulation and local signature</span>
          <strong>Unsigned tx → simulate → browser sign</strong>
          <small>Requires a built unsigned create transaction, matching client mint keypair, matching browser signer, and passed simulation.</small>
        </div>
        <span className="deploymentBuilderActionRow">
          <button className="button secondary" type="button" onClick={() => void simulatePumpPortalCreate()} disabled={simulationLoading || !pumpPortalBuild?.result?.build?.transactionBase64}>
            {simulationLoading ? 'Simulating...' : 'Simulate Create'}
          </button>
          <button className="button secondary" type="button" onClick={() => void signPumpPortalCreate()} disabled={simulationLoading || simulation?.status !== 'ok' || signedCreate.status === 'signed'}>
            {signedCreate.status === 'signed' ? 'Signed Locally' : 'Sign Locally'}
          </button>
          <button className="button secondary" type="button" onClick={() => void reviewSignedCreate()} disabled={signedReviewLoading || !signedCreate.signedTransaction}>
            {signedReviewLoading ? 'Reviewing...' : 'Review Signed'}
          </button>
          <button className="button danger" type="button" onClick={() => void broadcastSignedCreate()} disabled={broadcastLoading || signedReview?.status !== 'ok' || !signedCreate.signedTransaction}>
            {broadcastLoading ? 'Submitting...' : 'Submit Signed'}
          </button>
        </span>
      </div>
      {(simulation || signedCreate.status !== 'idle' || signedReview || broadcastResult) && (
        <div className="pumpPortalPreviewResult">
          <div><span>Simulation</span><strong>{simulation?.status ?? 'not-run'}</strong><small>{simulation?.transactionPreview?.simulationStatus ?? simulation?.execution ?? simulation?.error ?? 'pending'}</small></div>
          <div><span>Signed packet</span><strong>{signedCreate.status}</strong><small>{signedCreate.message}</small></div>
          <div><span>Intent</span><strong>{short(signedCreate.intentId ?? pumpPortalBuild?.result?.intent?.id)}</strong><small>message {short(signedCreate.transactionMessageHash ?? pumpPortalBuild?.result?.intent?.transactionMessageHash)}</small></div>
          <div><span>Signed review</span><strong>{signedReview?.status ?? 'not-run'}</strong><small>{signedReview?.review?.safeToBroadcastIfLiveEnabled ? 'policy passed; gate controls submit' : signedReview?.execution ?? signedReview?.error ?? 'review required'}</small></div>
          <div><span>Broadcast packet</span><strong>{broadcastResult?.signature ? 'sent' : signedReview?.status === 'ok' ? 'ready' : 'not ready'}</strong><small>{broadcastResult?.explorerUrl ?? broadcastResult?.error ?? (signedReview?.status === 'ok' ? 'Submit only through /api/send-signed-transaction after final gate approval.' : 'Simulation, local signing, and signed review required.')}</small></div>
          <div><span>Project receipt</span><strong>{broadcastResult?.launchReceiptPersistence?.status ?? 'not recorded'}</strong><small>{broadcastResult?.launchReceiptPersistence?.persisted ? `saved via ${broadcastResult.launchReceiptPersistence.mode}` : broadcastResult?.launchReceiptPersistence?.error ?? 'Launch receipt saves after signed submit.'}</small></div>
          <div className="wide"><span>Blockers</span><strong>{broadcastResult?.blockers?.length ? broadcastResult.blockers.join(', ') : broadcastResult?.transactionPreview?.blockers?.length ? broadcastResult.transactionPreview.blockers.join(', ') : signedReview?.blockers?.length ? signedReview.blockers.join(', ') : simulation?.transactionPreview?.blockers?.length ? simulation.transactionPreview.blockers.join(', ') : signedReview?.status === 'ok' ? 'broadcast gate still controls submit' : signedCreate.message}</strong></div>
        </div>
      )}
      <div className="pumpPortalPreviewPanel">
        <div>
          <span>Shadow execution packet</span>
          <strong>Compile full backend plan</strong>
          <small>Builds one policy packet across metadata, builder, signer, simulation, Jito, receipts, monitoring, recovery, and gates. No signing or broadcast.</small>
        </div>
        <span className="deploymentBuilderActionRow">
          <button className="button secondary" type="button" onClick={() => void buildShadowPlan(false)} disabled={shadowLoading}>
            {shadowLoading ? 'Compiling...' : 'Compile Shadow Plan'}
          </button>
          <button className="button secondary" type="button" onClick={() => void buildShadowPlan(true)} disabled={shadowLoading}>
            Audit Snapshot
          </button>
        </span>
      </div>
      {shadowPlan && (
        <div className="pumpPortalPreviewResult">
          <div><span>Packet</span><strong>{shadowPlan.packet?.status ?? shadowPlan.status ?? 'unknown'}</strong><small>{short(shadowPlan.packet?.packetHash)}</small></div>
          <div><span>Backend score</span><strong>{shadowPlan.packet ? `${shadowPlan.packet.completeness.backendScore}%` : 'unknown'}</strong><small>{shadowPlan.packet ? `${shadowPlan.packet.completeness.readyStages}/${shadowPlan.packet.completeness.totalStages} shadow stages` : shadowPlan.error}</small></div>
          <div><span>Executable shadow</span><strong>{shadowPlan.packet ? `${shadowPlan.packet.completeness.shadowExecutableScore}%` : 'unknown'}</strong><small>{shadowPlan.packet?.completeness.missingStages.join(', ') || 'no missing hard stages'}</small></div>
          <div><span>Audit</span><strong>{shadowPlan.packet?.audit.persisted ? 'stored' : shadowPlan.packet?.audit.storage ?? 'not stored'}</strong><small>{shadowPlan.packet?.audit.auditId ?? 'preview only'}</small></div>
          <div className="wide"><span>Gates</span><strong>{shadowPlan.packet ? `deploy ${shadowPlan.packet.gates.deploymentEnabled ? 'on' : 'off'} · broadcast ${shadowPlan.packet.gates.broadcastEnabled ? 'on' : 'off'} · jito ${shadowPlan.packet.gates.jitoRelayEnabled ? 'on' : 'off'}` : 'unknown'}</strong></div>
          <div className="wide"><span>Blockers</span><strong>{shadowPlan.packet?.blockers.length ? shadowPlan.packet.blockers.join(', ') : shadowPlan.error ?? 'shadow-ready'}</strong></div>
          {shadowPlan.packet?.spine.map((item) => (
            <div key={item.step}>
              <span>{item.step}</span>
              <strong>{item.status}</strong>
              <small>{item.blockers.length ? item.blockers.join(', ') : item.detail}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
