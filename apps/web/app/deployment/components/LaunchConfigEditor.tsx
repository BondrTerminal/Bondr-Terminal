'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { LaunchConfig, Project, Wallet, WalletPlanEntry } from '../../../lib/meridian-store';

type Props = { project: Project; wallets: Wallet[] };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type WalletUse = 'creator' | 'launch-readiness' | 'treasury' | 'observe';

function short(address: string) { return address ? `${address.slice(0, 6)}…${address.slice(-5)}` : '—'; }

function defaultPlan(wallets: Wallet[]): WalletPlanEntry[] {
  return wallets.map((wallet, index) => ({
    walletId: wallet.id,
    role: wallet.role,
    participate: index === 0,
    plannedBuySol: 0,
    maxBuySol: 0,
    maxSlippageBps: 100,
    takeProfitPercents: [],
    stopLossPct: 0,
    trailingStopPct: 0,
    perTxSellCapPct: 0,
    cooldownSeconds: 0
  }));
}

function defaultConfig(project: Project, wallets: Wallet[]): LaunchConfig {
  return {
    route: {
      initialBuySol: project.fundingPlan.devBuySol ?? 0,
      slippageBps: 100,
      priorityFeeMode: 'auto capped',
      graduationMonitor: 'disabled',
      raydiumLiquiditySol: project.fundingPlan.liquiditySol ?? 0,
      raydiumWithheldTokenPct: 0,
      raydiumWithheldTokenAmount: 0,
      burnLiquidity: true
    },
    walletPlan: defaultPlan(wallets),
    devWalletRules: {
      controlledWalletRole: 'creator',
      maxInitialBuySol: project.fundingPlan.devBuySol ?? 0,
      maxSlippageBps: 100,
      maxPriorityFeeSol: 0.01,
      perTxSellCapPct: 0,
      cooldownSeconds: 0,
      takeProfitPercents: [],
      stopLossPct: 0,
      trailingStopPct: 0,
      trailingActivationPct: 0,
      maxDevExposureSol: project.fundingPlan.devBuySol ?? 0,
      maxDevSupplyPct: 0
    }
  };
}

function mergedConfig(project: Project, wallets: Wallet[]): LaunchConfig {
  const fallback = defaultConfig(project, wallets);
  const saved = project.launchConfig;
  const savedById = new Map((saved?.walletPlan ?? []).map((entry) => [entry.walletId, entry]));
  return {
    ...fallback,
    ...(saved ?? {}),
    route: { ...fallback.route, ...(saved?.route ?? {}) },
    walletPlan: wallets.map((wallet) => ({ ...(fallback.walletPlan.find((entry) => entry.walletId === wallet.id)!), ...(savedById.get(wallet.id) ?? {}), walletId: wallet.id, role: wallet.role })),
    devWalletRules: { ...fallback.devWalletRules, ...(saved?.devWalletRules ?? {}) }
  };
}

function numberFrom(form: FormData, name: string, fallback: number) {
  const value = Number(String(form.get(name) ?? '').trim());
  return Number.isFinite(value) ? value : fallback;
}

function walletUse(plan: WalletPlanEntry | undefined, index: number): WalletUse {
  const role = String(plan?.role ?? '').toLowerCase();
  if (role.includes('creator') || role.includes('deploy') || index === 0) return 'creator';
  if (role.includes('treasury')) return 'treasury';
  if (plan?.participate) return 'launch-readiness';
  return 'observe';
}

export function LaunchConfigEditor({ project, wallets }: Props) {
  const router = useRouter();
  const initial = useMemo(() => mergedConfig(project, wallets), [project, wallets]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('Deployment execution is disabled. Saving configuration only.');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState('saving');
    setMessage('Saving launch configuration…');
    const form = new FormData(event.currentTarget);
    const walletPlan = wallets.map((wallet, index) => ({
      ...(initial.walletPlan.find((entry) => entry.walletId === wallet.id) ?? defaultPlan([wallet])[0]),
      walletId: wallet.id,
      role: String(form.get(`wallet.${wallet.id}.role`) ?? wallet.role),
      participate: form.get(`wallet.${wallet.id}.enabled`) === 'on',
      plannedBuySol: 0,
      maxBuySol: 0,
      maxSlippageBps: numberFrom(form, 'route.slippageBps', initial.route.slippageBps)
    }));
    const body: LaunchConfig = {
      ...initial,
      route: {
        ...initial.route,
        initialBuySol: numberFrom(form, 'route.initialBuySol', initial.route.initialBuySol),
        slippageBps: numberFrom(form, 'route.slippageBps', initial.route.slippageBps),
        priorityFeeMode: String(form.get('route.priorityFeeMode') ?? initial.route.priorityFeeMode),
        graduationMonitor: String(form.get('route.graduationMonitor') ?? 'disabled'),
        raydiumLiquiditySol: numberFrom(form, 'route.raydiumLiquiditySol', initial.route.raydiumLiquiditySol),
        burnLiquidity: form.get('route.burnLiquidity') === 'on'
      },
      walletPlan,
      devWalletRules: {
        ...initial.devWalletRules,
        maxInitialBuySol: numberFrom(form, 'route.initialBuySol', initial.devWalletRules.maxInitialBuySol),
        maxSlippageBps: numberFrom(form, 'route.slippageBps', initial.devWalletRules.maxSlippageBps)
      }
    };

    const response = await fetch(`/api/projects/${project.id}/launch-config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ launchConfig: body }) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      setSaveState('error');
      setMessage(error?.error ?? 'Save failed.');
      return;
    }
    setSaveState('saved');
    setMessage('Configuration saved. Deployment remains disabled.');
    router.refresh();
  }

  return (
    <form className="launchConfigEditor cleanLaunchConfigEditor" onSubmit={save}>
      <section className="documentCard launchConfigPanel">
        <div className="sectionIntro compactIntro">
          <span>Project config</span>
          <h2>{project.name}</h2>
          <p>Configure metadata, route preferences, and launch-wallet roles. This screen does not deploy tokens, fund wallets, sign, or broadcast.</p>
        </div>
        <div className="launchConfigEditorGrid compact">
          <label><span>Token name</span><input name="metadata.name" defaultValue={project.name} readOnly /></label>
          <label><span>Ticker</span><input name="metadata.ticker" defaultValue={project.ticker} readOnly /></label>
          <label><span>Launch path</span><input name="launchPath" defaultValue={project.launchPath} readOnly /></label>
          <label><span>Token mint</span><input name="tokenMint" defaultValue={project.tokenMint ?? ''} placeholder="not launched" readOnly /></label>
          <label><span>Pool</span><input name="pool" defaultValue={project.pool ?? ''} placeholder="not created" readOnly /></label>
          <label><span>Initial buy SOL cap</span><input name="route.initialBuySol" type="number" step="0.001" defaultValue={initial.route.initialBuySol} /></label>
          <label><span>Slippage bps cap</span><input name="route.slippageBps" type="number" step="1" defaultValue={initial.route.slippageBps} /></label>
          <label><span>Priority fee policy</span><input name="route.priorityFeeMode" defaultValue={initial.route.priorityFeeMode} /></label>
          <label><span>Graduation monitor</span><input name="route.graduationMonitor" defaultValue={initial.route.graduationMonitor} /></label>
          <label className="launchCheckbox"><span>Burn LP if a future LP adapter is approved</span><input name="route.burnLiquidity" type="checkbox" defaultChecked={initial.route.burnLiquidity} /></label>
        </div>
      </section>

      <section className="documentCard launchWalletPanel">
        <div className="sectionIntro compactIntro">
          <span>Wallet selection</span>
          <h2>Launch wallet roles</h2>
          <p>Only saved public wallet records are listed. A wallet becomes signable only when the connected browser wallet matches that address.</p>
        </div>
        <div className="walletRouteTable" role="table" aria-label="Launch wallet roles">
          <div className="walletRouteRow walletRouteHead" role="row"><span>Use</span><span>Wallet</span><span>Address</span><span>Role</span><span>Custody</span><span>Status</span></div>
          {wallets.length ? wallets.map((wallet, index) => {
            const plan = initial.walletPlan.find((entry) => entry.walletId === wallet.id);
            const use = walletUse(plan, index);
            return <label className="walletRouteRow" role="row" key={wallet.id}>
              <span><input name={`wallet.${wallet.id}.enabled`} type="checkbox" defaultChecked={use !== 'observe'} /></span>
              <strong>{wallet.role || `Wallet ${index + 1}`}</strong>
              <code title={wallet.address}>{short(wallet.address)}</code>
              <select name={`wallet.${wallet.id}.role`} defaultValue={use}>
                <option value="creator">creator</option>
                <option value="launch-readiness">launch-readiness</option>
                <option value="treasury">treasury</option>
                <option value="observe">observe</option>
              </select>
              <span>{wallet.custodyMode === 'watch-only' ? 'watch-only' : 'browser match required'}</span>
              <em>{wallet.status}</em>
            </label>;
          }) : <div className="simpleEmptyBundle">No saved wallets. Add your connected browser signer as a watch-only wallet in Wallet Ops.</div>}
        </div>
      </section>

      <section className="documentCard deploymentDisabledPanel">
        <div className="sectionIntro compactIntro"><span>Execution gate</span><h2>Deploy controls are disabled</h2><p>Deployment execution requires explicit approval, valid preflight, wallet confirmation, and the separate broadcast gate.</p></div>
        <div className="deploymentAdapterGrid">
          <div><span>Unsigned deploy builder</span><strong>Disabled</strong><small>adapter not active</small></div>
          <div><span>Browser-wallet deploy signature</span><strong>Disabled</strong><small>deployment gate off</small></div>
          <div><span>Broadcast</span><strong>Disabled</strong><small>broadcast gate off</small></div>
        </div>
      </section>

      <div className="launchConfigFooter"><button type="submit" disabled={saveState === 'saving'}>{saveState === 'saving' ? 'Saving…' : 'Save Configuration'}</button><span>{message}</span></div>
    </form>
  );
}
