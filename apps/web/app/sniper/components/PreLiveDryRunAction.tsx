'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type DryRunPayload = {
  status?: string;
  dryRun?: { status: 'pass' | 'warn' | 'fail'; participatingWalletCount: number; totalPlannedBuySol: number; totalMaxBuySol: number; warnings: string[]; blockers: string[]; execution: string };
  error?: string;
  execution?: string;
};

export function PreLiveDryRunAction({ projectId }: { projectId?: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<'ok' | 'warn' | 'error'>('warn');

  async function runDryRun() {
    if (!projectId) {
      setKind('error');
      setMessage('Select a Bond.Terminal project before running the dry-run build.');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/pre-live-dry-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: projectId })
      });
      const payload = await response.json().catch(() => ({})) as DryRunPayload;
      if (!response.ok || !payload.dryRun) {
        setKind('error');
        setMessage(payload.error ?? 'Dry-run build failed. Sign in as operator if the session gate is enabled.');
        return;
      }
      setKind(payload.dryRun.status === 'pass' ? 'ok' : payload.dryRun.status === 'warn' ? 'warn' : 'error');
      setMessage(`Dry-run ${payload.dryRun.status}: ${payload.dryRun.participatingWalletCount} wallet(s), planned ${payload.dryRun.totalPlannedBuySol.toFixed(3)} SOL, max ${payload.dryRun.totalMaxBuySol.toFixed(3)} SOL. Preview only — no signing or broadcast.`);
      router.refresh();
    } catch (error) {
      setKind('error');
      setMessage(error instanceof Error ? error.message : 'Dry-run request failed.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="preLiveDryRunAction">
    <button className="button secondary" type="button" onClick={runDryRun} disabled={loading || !projectId}>{loading ? 'Running dry-run…' : 'Run dry-run build'}</button>
    {message && <small className={`preLiveDryRunMessage ${kind}`}>{message}</small>}
  </div>;
}
