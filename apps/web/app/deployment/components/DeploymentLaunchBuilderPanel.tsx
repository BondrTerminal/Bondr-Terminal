'use client';

import { useState } from 'react';

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
          <span>PumpPortal create preview</span>
          <strong>IPFS metadata + trade-local create contract</strong>
          <small>No provider call, no signature request, no broadcast. This only shows whether the create payload is structurally ready.</small>
        </div>
        <button className="button secondary" type="button" onClick={previewPumpPortalCreate} disabled={previewLoading}>
          {previewLoading ? 'Checking...' : 'Preview PumpPortal create'}
        </button>
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
    </section>
  );
}
