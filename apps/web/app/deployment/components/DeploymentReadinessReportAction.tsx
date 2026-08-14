'use client';

import { useState } from 'react';

type JsonRecord = Record<string, unknown>;

async function readJson(path: string) {
  const response = await fetch(path, { cache: 'no-store' });
  const body = await response.json().catch(() => ({})) as JsonRecord;
  return { ok: response.ok, status: response.status, body };
}

function fencedJson(value: unknown) {
  return `# BONDR Deployment QA report\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

export function DeploymentReadinessReportAction({ projectId }: { projectId?: string | null }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const [message, setMessage] = useState('Copies gates, project, wallet rail, dry-run, bundle, and deployment backend status.');

  async function copyReport() {
    setState('copying');
    setMessage('Collecting deployment readiness...');
    try {
      const suffix = projectId ? `?project=${encodeURIComponent(projectId)}` : '';
      const [capabilities, deployment, dryRun, bundle, walletRail] = await Promise.all([
        readJson('/api/execution-capabilities'),
        readJson(`/api/deployment-engine${suffix}`),
        readJson(`/api/pre-live-dry-run${suffix}`),
        readJson('/api/bundle-sequencer'),
        readJson('/api/wallet-rail?surface=deployment')
      ]);
      const report = {
        timestamp: new Date().toISOString(),
        path: window.location.pathname,
        projectId: projectId ?? null,
        gates: {
          liveTradingEnabled: capabilities.body.liveTradingEnabled ?? null,
          signingEnabled: capabilities.body.signingEnabled ?? null,
          broadcastEnabled: capabilities.body.broadcastEnabled ?? null,
          fundingBroadcastEnabled: capabilities.body.fundingBroadcastEnabled ?? null,
          deploymentEnabled: capabilities.body.deploymentEnabled ?? null,
          readinessLevel: capabilities.body.readinessLevel ?? null,
          simulationRequired: capabilities.body.requireSimulation ?? capabilities.body.simulationRequired ?? null
        },
        deployment: {
          ok: deployment.ok,
          httpStatus: deployment.status,
          execution: deployment.body.execution ?? null,
          engineStatus: deployment.body.engines ?? null,
          snapshot: deployment.body.deploymentSnapshot ?? null
        },
        dryRun: {
          ok: dryRun.ok,
          httpStatus: dryRun.status,
          preview: dryRun.body.preview ?? null,
          lastDryRun: dryRun.body.lastDryRun ?? null
        },
        bundle: {
          ok: bundle.ok,
          httpStatus: bundle.status,
          stages: bundle.body.stages ?? null,
          maxWallets: bundle.body.maxWallets ?? null,
          maxTotalSol: bundle.body.maxTotalSol ?? null,
          relaySubmission: bundle.body.relaySubmission ?? null,
          execution: bundle.body.execution ?? null
        },
        walletRail: {
          ok: walletRail.ok,
          httpStatus: walletRail.status,
          status: walletRail.body.status ?? null,
          warnings: walletRail.body.warnings ?? walletRail.body.railWarnings ?? null,
          selectedWallet: walletRail.body.selectedWallet ?? null,
          connectedSigner: walletRail.body.connectedSigner ?? null
        },
        omittedIntentionally: [
          'private keys / seed phrases',
          'full unsigned transaction base64',
          'full signed transaction bytes',
          'cookies / session secrets / auth tokens'
        ]
      };
      await navigator.clipboard.writeText(fencedJson(report));
      setState('copied');
      setMessage('Deployment QA report copied.');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Could not copy deployment report.');
    }
  }

  return (
    <div className="deploymentReportAction">
      <button className="button secondary" type="button" onClick={copyReport} disabled={state === 'copying'}>
        {state === 'copying' ? 'Copying...' : 'Copy Deployment Report'}
      </button>
      <small className={state === 'error' ? 'dangerText' : state === 'copied' ? 'profitText' : ''}>{message}</small>
    </div>
  );
}
