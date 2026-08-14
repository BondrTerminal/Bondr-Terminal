'use client';

import { useState } from 'react';
import { Keypair } from '@solana/web3.js';

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
    requestBody: { publicKey: string | null; mint: string | null; amount: number; slippage: number; priorityFee: number; pool: string };
    build?: { transactionBytes: number; transactionHash: string; requiredSigners: string[]; mint: string; feePayer: string | null };
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

type BrowserSolanaProvider = {
  publicKey?: { toString(): string; toBase58?: () => string };
  connect(): Promise<{ publicKey: { toString(): string; toBase58?: () => string } }>;
};
type BrowserWindowWithSolana = Window & { solana?: BrowserSolanaProvider };

function short(value?: string | null) {
  return value ? `${value.slice(0, 6)}...${value.slice(-5)}` : 'not set';
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
        body: JSON.stringify({ projectId, mintPublicKey: mint.trim() || null })
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
    try {
      const response = await fetch('/api/deployment/pumpportal/build-create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, mintPublicKey: mint.trim() || null, connectedSigner: connectedSigner.trim() || null, confirmBuild })
      });
      const payload = await response.json().catch(() => ({})) as PumpPortalBuildState;
      setPumpPortalBuild(payload);
    } catch (error) {
      setPumpPortalBuild({ status: 'error', error: error instanceof Error ? error.message : 'PumpPortal build-create request failed.' });
    } finally {
      setPumpPortalBuildLoading(false);
    }
  }

  function generateClientMintKeypair() {
    const keypair = Keypair.generate();
    setClientMintKeypair(keypair);
    setMint(keypair.publicKey.toBase58());
    setResult(null);
    setPumpPortalPreview(null);
    setPumpPortalBuild(null);
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
      setSignerProofMessage(address === payer || !payer ? 'Browser signer connected.' : 'Connected signer does not match the selected deployer.');
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
          <small>Preview is read-only. Pinning requires `PINATA_JWT` and the explicit pin action.</small>
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
        </span>
      </div>
      {pumpPortalPreview && (
        <div className="pumpPortalPreviewResult">
          <div><span>Status</span><strong>{pumpPortalPreview.preview?.status ?? pumpPortalPreview.status ?? 'unknown'}</strong></div>
          <div><span>IPFS</span><strong>{pumpPortalPreview.preview?.ipfs.status ?? 'unknown'}</strong><small>{pumpPortalPreview.preview?.ipfs.imageSource ?? 'no image'} · provider {pumpPortalPreview.preview?.ipfs.providerConfigured ? 'configured' : 'missing'}</small></div>
          <div><span>Dev signer</span><strong>{short(pumpPortalPreview.preview?.signerPreview.devWalletAddress)}</strong><small>{pumpPortalPreview.preview?.signerPreview.custodyMode ?? 'unknown'} · server custody {pumpPortalPreview.preview?.signerPreview.serverCustody ? 'yes' : 'no'}</small></div>
          <div><span>Amount / fee</span><strong>{pumpPortalPreview.preview ? `${pumpPortalPreview.preview.payloadPreview.amount.toFixed(4)} SOL` : 'unknown'}</strong><small>priority {pumpPortalPreview.preview?.payloadPreview.priorityFee ?? 0} SOL · slippage {pumpPortalPreview.preview?.payloadPreview.slippage ?? 0}%</small></div>
          <div className="wide"><span>Blockers</span><strong>{pumpPortalPreview.preview?.blockers.length ? pumpPortalPreview.preview.blockers.join(', ') : pumpPortalPreview.error ?? 'preview-ready; live gates still require approval'}</strong></div>
          {Boolean(pumpPortalPreview.preview?.warnings.length) && <div className="wide"><span>Warnings</span><strong>{pumpPortalPreview.preview?.warnings.join(', ')}</strong></div>}
        </div>
      )}
      {pumpPortalBuild && (
        <div className="pumpPortalPreviewResult">
          <div><span>Build status</span><strong>{pumpPortalBuild.result?.status ?? pumpPortalBuild.status ?? 'unknown'}</strong><small>{pumpPortalBuild.result?.execution ?? pumpPortalBuild.error ?? 'no provider call'}</small></div>
          <div><span>Provider call</span><strong>{pumpPortalBuild.result?.safety.providerCallEnabled ? 'enabled' : 'disabled'}</strong><small>confirm {pumpPortalBuild.result?.safety.confirmBuild ? 'yes' : 'no'}</small></div>
          <div><span>Mint</span><strong>{short(pumpPortalBuild.result?.requestBody.mint)}</strong><small>fee payer {short(pumpPortalBuild.result?.build?.feePayer)}</small></div>
          <div><span>Unsigned bytes</span><strong>{pumpPortalBuild.result?.build ? `${pumpPortalBuild.result.build.transactionBytes} bytes` : 'not built'}</strong><small>{short(pumpPortalBuild.result?.build?.transactionHash)}</small></div>
          <div className="wide"><span>Blockers</span><strong>{pumpPortalBuild.result?.blockers.length ? pumpPortalBuild.result.blockers.join(', ') : pumpPortalBuild.error ?? 'build-ready'}</strong></div>
        </div>
      )}
    </section>
  );
}
