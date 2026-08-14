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
    </section>
  );
}
