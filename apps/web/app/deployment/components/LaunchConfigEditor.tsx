'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { LaunchConfig, Project, Wallet, WalletPlanEntry } from '../../../lib/meridian-store';

type Props = { project: Project; wallets: Wallet[] };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type LaunchTab = 'token' | 'risk' | 'wallets' | 'review';

type WalletUse = 'creator' | 'launch-readiness' | 'treasury' | 'observe';
const LAUNCH_TABS: Array<{ id: LaunchTab; label: string; detail: string }> = [
  { id: 'token', label: 'Token Info', detail: 'Metadata, launch path, funding' },
  { id: 'risk', label: 'Risk', detail: 'Caps, TP/SL, cooldowns' },
  { id: 'wallets', label: 'Wallet Setup', detail: 'Dev, bundle, sniper, task' },
  { id: 'review', label: 'Review', detail: 'Gates and save state' }
];
const DEFAULT_TAKE_PROFIT = [35, 75, 150];
const TASK_TYPES = ['timed-buy', 'timed-sell', 'smart-sell', 'auto-take-profit', 'stop-loss', 'trailing-stop'] as const;
const TASK_PRESETS = ['fast-paced-balance', 'smooth-flow', 'custom'] as const;
const TASK_ROTATION_MODES = ['random', 'sequential', 'balanced'] as const;
const TASK_SIZE_MODES = ['mixed', 'fixed', 'randomized'] as const;
const TASK_RESPONSE_MODES = ['off', 'defensive', 'follow-flow'] as const;

const taskTypeLabels: Record<(typeof TASK_TYPES)[number], string> = {
  'timed-buy': 'Timed buy',
  'timed-sell': 'Timed sell',
  'smart-sell': 'Smart sell',
  'auto-take-profit': 'Auto take-profit',
  'stop-loss': 'Stop-loss',
  'trailing-stop': 'Trailing stop'
};

const presetLabels: Record<(typeof TASK_PRESETS)[number], string> = {
  'fast-paced-balance': 'Fast paced balance',
  'smooth-flow': 'Smooth flow',
  custom: 'Custom'
};

function short(address: string) { return address ? `${address.slice(0, 6)}…${address.slice(-5)}` : '—'; }
function formatPctList(values: number[]) { return values.length ? values.join(', ') : ''; }
function pctListFrom(form: FormData, name: string, fallback: number[]) {
  const raw = String(form.get(name) ?? '').trim();
  if (!raw) return fallback;
  return raw.split(',').map((item) => Number(item.trim())).filter((value) => Number.isFinite(value));
}

function WalletPlanNumberField({ label, name, value, placeholder, min, max, step }: { label: string; name: string; value: number; placeholder: string; min?: string; max?: string; step: string }) {
  return (
    <label className="launchWalletMiniField">
      <span>{label}</span>
      <input name={name} type="number" min={min} max={max} step={step} defaultValue={value} placeholder={placeholder} />
    </label>
  );
}

function WalletPlanTextField({ label, name, value, placeholder }: { label: string; name: string; value: string; placeholder: string }) {
  return (
    <label className="launchWalletMiniField">
      <span>{label}</span>
      <input name={name} defaultValue={value} placeholder={placeholder} />
    </label>
  );
}

function defaultPlan(wallets: Wallet[]): WalletPlanEntry[] {
  return wallets.map((wallet, index) => ({
    walletId: wallet.id,
    role: wallet.role,
    participate: index === 0,
    executionPhase: index === 0 ? 'dev' : 'observe',
    plannedBuySol: 0,
    maxBuySol: 0,
    maxSlippageBps: 100,
    takeProfitPercents: DEFAULT_TAKE_PROFIT,
    stopLossPct: -18,
    trailingStopPct: 22,
    perTxSellCapPct: 25,
    cooldownSeconds: 60,
    taskType: 'timed-buy',
    taskName: '',
    taskPreset: 'fast-paced-balance',
    taskAmountSol: 0,
    taskSellPercent: 0,
    taskMaxTotalSol: 0,
    taskDelaySeconds: 0,
    taskIntervalSeconds: 0,
    taskMaxExecutions: 1,
    taskBuyPowerPct: 50,
    taskSellPowerPct: 50,
    taskSellMinPct: 5,
    taskSellMaxPct: 35,
    taskBuyMinSol: 0,
    taskBuyMaxSol: 0,
    taskDelayMinMs: 500,
    taskDelayMaxMs: 4000,
    taskWalletRotation: 'random',
    taskTradeSizeMode: 'mixed',
    taskPriorityFeeSol: 0,
    taskExternalResponse: 'off'
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
      perTxSellCapPct: 25,
      cooldownSeconds: 60,
      takeProfitPercents: DEFAULT_TAKE_PROFIT,
      stopLossPct: -18,
      trailingStopPct: 22,
      trailingActivationPct: 60,
      maxDevExposureSol: project.fundingPlan.devBuySol ?? 0,
      maxDevSupplyPct: 8
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
function stringFrom(form: FormData, name: string, fallback: string) {
  const value = String(form.get(name) ?? '').trim();
  return value || fallback;
}

function walletUse(plan: WalletPlanEntry | undefined, index: number): WalletUse {
  const role = String(plan?.role ?? '').toLowerCase();
  if (role.includes('creator') || role.includes('deploy') || index === 0) return 'creator';
  if (role.includes('treasury')) return 'treasury';
  if (plan?.participate) return 'launch-readiness';
  return 'observe';
}

function checked(form: FormData, name: string) {
  return form.get(name) === 'on';
}

function phaseForWallet(form: FormData, wallet: Wallet, index: number, devWalletId: string): NonNullable<WalletPlanEntry['executionPhase']> {
  if (wallet.id === devWalletId) return 'dev';
  if (checked(form, `task.${wallet.id}.enabled`)) return 'task';
  if (checked(form, `sniper.${wallet.id}.enabled`)) return 'sniper';
  if (checked(form, `bundle.${wallet.id}.enabled`)) return 'bundle';
  return index === 0 && !devWalletId ? 'dev' : 'observe';
}

function roleLabelForPhase(phase: NonNullable<WalletPlanEntry['executionPhase']>) {
  if (phase === 'dev') return 'dev wallet';
  if (phase === 'bundle') return 'bundle wallet';
  if (phase === 'sniper') return 'sniper wallet';
  if (phase === 'task') return 'task wallet';
  return 'observe';
}

function taskTypeFrom(form: FormData, walletId: string, fallback: WalletPlanEntry['taskType']) {
  const value = String(form.get(`task.${walletId}.type`) ?? form.get('taskCommand.type') ?? fallback ?? 'timed-buy');
  return TASK_TYPES.includes(value as (typeof TASK_TYPES)[number]) ? value as WalletPlanEntry['taskType'] : 'timed-buy';
}

function optionFrom<const T extends readonly string[]>(form: FormData, name: string, options: T, fallback: T[number]) {
  const value = String(form.get(name) ?? fallback);
  return options.includes(value) ? value as T[number] : fallback;
}

export function LaunchConfigEditor({ project, wallets }: Props) {
  const router = useRouter();
  const initial = useMemo(() => mergedConfig(project, wallets), [project, wallets]);
  const [activeTab, setActiveTab] = useState<LaunchTab>('token');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('Deployment execution is disabled. Saving configuration only.');
  const defaultDevWalletId = initial.walletPlan.find((entry) => entry.executionPhase === 'dev' || entry.role.toLowerCase().includes('dev') || entry.role.toLowerCase().includes('creator'))?.walletId ?? wallets[0]?.id ?? '';
  const taskPlans = initial.walletPlan.filter((entry) => entry.executionPhase === 'task' || entry.role.toLowerCase().includes('task'));
  const taskDefaults = taskPlans[0] ?? initial.walletPlan[0] ?? defaultPlan(wallets)[0];
  const selectedTaskCount = taskPlans.length;
  const selectedTaskSol = taskPlans.reduce((sum, entry) => sum + (entry.taskMaxTotalSol ?? entry.maxBuySol ?? 0), 0);
  const activeTabIndex = LAUNCH_TABS.findIndex((tab) => tab.id === activeTab);
  const previousTab = LAUNCH_TABS[Math.max(0, activeTabIndex - 1)]?.id ?? 'token';
  const nextTab = LAUNCH_TABS[Math.min(LAUNCH_TABS.length - 1, activeTabIndex + 1)]?.id ?? 'review';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState('saving');
    setMessage('Saving launch configuration…');
    const form = new FormData(event.currentTarget);
    const devWalletId = stringFrom(form, 'dev.walletId', wallets[0]?.id ?? '');
    const walletPlan = wallets.map((wallet, index) => {
      const existing = initial.walletPlan.find((entry) => entry.walletId === wallet.id) ?? defaultPlan([wallet])[0];
      const phase = phaseForWallet(form, wallet, index, devWalletId);
      const prefix = phase === 'dev' ? `devPlan.${wallet.id}` : phase === 'bundle' ? `bundle.${wallet.id}` : phase === 'sniper' ? `sniper.${wallet.id}` : phase === 'task' ? `task.${wallet.id}` : `observe.${wallet.id}`;
      const fallbackTakeProfit = existing.takeProfitPercents?.length ? existing.takeProfitPercents : initial.devWalletRules.takeProfitPercents;
      const taskAmountSol = numberFrom(form, `task.${wallet.id}.taskAmountSol`, existing.taskAmountSol ?? existing.plannedBuySol ?? 0);
      const taskSellPercent = numberFrom(form, `task.${wallet.id}.taskSellPercent`, existing.taskSellPercent ?? 0);
      const taskMaxTotalSol = numberFrom(form, `task.${wallet.id}.taskMaxTotalSol`, existing.taskMaxTotalSol ?? existing.maxBuySol ?? 0);
      const plannedBuySol = phase === 'task' ? taskAmountSol : numberFrom(form, `${prefix}.plannedBuySol`, existing.plannedBuySol ?? 0);
      const maxBuySol = phase === 'task'
        ? taskMaxTotalSol
        : phase === 'sniper'
          ? numberFrom(form, `${prefix}.plannedBuySol`, existing.maxBuySol || existing.plannedBuySol || 0)
          : numberFrom(form, `${prefix}.maxBuySol`, existing.maxBuySol ?? 0);
      return {
        ...existing,
        walletId: wallet.id,
        role: roleLabelForPhase(phase),
        participate: phase !== 'observe',
        executionPhase: phase,
        plannedBuySol,
        maxBuySol,
        maxSlippageBps: numberFrom(form, `${prefix}.maxSlippageBps`, existing.maxSlippageBps ?? initial.route.slippageBps),
        stopLossPct: numberFrom(form, `${prefix}.stopLossPct`, existing.stopLossPct || initial.devWalletRules.stopLossPct),
        trailingStopPct: numberFrom(form, `${prefix}.trailingStopPct`, existing.trailingStopPct || initial.devWalletRules.trailingStopPct),
        takeProfitPercents: pctListFrom(form, `${prefix}.takeProfitPercents`, fallbackTakeProfit),
        perTxSellCapPct: numberFrom(form, `${prefix}.perTxSellCapPct`, existing.perTxSellCapPct || initial.devWalletRules.perTxSellCapPct),
        cooldownSeconds: numberFrom(form, `${prefix}.cooldownSeconds`, existing.cooldownSeconds || initial.devWalletRules.cooldownSeconds),
        taskType: taskTypeFrom(form, wallet.id, existing.taskType),
        taskName: stringFrom(form, `task.${wallet.id}.name`, stringFrom(form, 'taskCommand.name', existing.taskName ?? '')),
        taskPreset: optionFrom(form, `task.${wallet.id}.preset`, TASK_PRESETS, optionFrom(form, 'taskCommand.preset', TASK_PRESETS, existing.taskPreset ?? 'fast-paced-balance')),
        taskAmountSol,
        taskSellPercent,
        taskMaxTotalSol,
        taskDelaySeconds: numberFrom(form, `task.${wallet.id}.delaySeconds`, existing.taskDelaySeconds ?? 0),
        taskIntervalSeconds: numberFrom(form, `task.${wallet.id}.intervalSeconds`, existing.taskIntervalSeconds ?? 0),
        taskMaxExecutions: numberFrom(form, `task.${wallet.id}.maxExecutions`, existing.taskMaxExecutions ?? 1),
        taskBuyPowerPct: numberFrom(form, `task.${wallet.id}.buyPowerPct`, numberFrom(form, 'taskCommand.buyPowerPct', existing.taskBuyPowerPct ?? 50)),
        taskSellPowerPct: numberFrom(form, `task.${wallet.id}.sellPowerPct`, numberFrom(form, 'taskCommand.sellPowerPct', existing.taskSellPowerPct ?? 50)),
        taskSellMinPct: numberFrom(form, `task.${wallet.id}.sellMinPct`, numberFrom(form, 'taskCommand.sellMinPct', existing.taskSellMinPct ?? 5)),
        taskSellMaxPct: numberFrom(form, `task.${wallet.id}.sellMaxPct`, numberFrom(form, 'taskCommand.sellMaxPct', existing.taskSellMaxPct ?? 35)),
        taskBuyMinSol: numberFrom(form, `task.${wallet.id}.buyMinSol`, numberFrom(form, 'taskCommand.buyMinSol', existing.taskBuyMinSol ?? 0)),
        taskBuyMaxSol: numberFrom(form, `task.${wallet.id}.buyMaxSol`, numberFrom(form, 'taskCommand.buyMaxSol', existing.taskBuyMaxSol ?? taskAmountSol)),
        taskDelayMinMs: numberFrom(form, `task.${wallet.id}.delayMinMs`, numberFrom(form, 'taskCommand.delayMinMs', existing.taskDelayMinMs ?? 500)),
        taskDelayMaxMs: numberFrom(form, `task.${wallet.id}.delayMaxMs`, numberFrom(form, 'taskCommand.delayMaxMs', existing.taskDelayMaxMs ?? 4000)),
        taskWalletRotation: optionFrom(form, `task.${wallet.id}.rotation`, TASK_ROTATION_MODES, optionFrom(form, 'taskCommand.rotation', TASK_ROTATION_MODES, existing.taskWalletRotation ?? 'random')),
        taskTradeSizeMode: optionFrom(form, `task.${wallet.id}.sizeMode`, TASK_SIZE_MODES, optionFrom(form, 'taskCommand.sizeMode', TASK_SIZE_MODES, existing.taskTradeSizeMode ?? 'mixed')),
        taskPriorityFeeSol: numberFrom(form, `task.${wallet.id}.priorityFeeSol`, numberFrom(form, 'taskCommand.priorityFeeSol', existing.taskPriorityFeeSol ?? 0)),
        taskExternalResponse: optionFrom(form, `task.${wallet.id}.externalResponse`, TASK_RESPONSE_MODES, optionFrom(form, 'taskCommand.externalResponse', TASK_RESPONSE_MODES, existing.taskExternalResponse ?? 'off'))
      };
    });
    const body = {
      launchPath: stringFrom(form, 'launchPath', project.launchPath),
      tokenMint: stringFrom(form, 'tokenMint', project.tokenMint ?? ''),
      pool: stringFrom(form, 'pool', project.pool ?? ''),
      metadata: {
        name: stringFrom(form, 'metadata.name', project.metadata.name),
        symbol: stringFrom(form, 'metadata.symbol', project.metadata.symbol),
        description: stringFrom(form, 'metadata.description', project.metadata.description),
        imageUrl: stringFrom(form, 'metadata.imageUrl', project.metadata.imageUrl),
        website: stringFrom(form, 'metadata.website', project.metadata.website),
        twitter: stringFrom(form, 'metadata.twitter', project.metadata.twitter),
        telegram: stringFrom(form, 'metadata.telegram', project.metadata.telegram)
      },
      fundingPlan: {
        budgetSol: numberFrom(form, 'funding.budgetSol', project.fundingPlan.budgetSol),
        devBuySol: numberFrom(form, 'funding.devBuySol', project.fundingPlan.devBuySol),
        liquiditySol: numberFrom(form, 'funding.liquiditySol', project.fundingPlan.liquiditySol),
        feeReserveSol: numberFrom(form, 'funding.feeReserveSol', project.fundingPlan.feeReserveSol),
        collectionWalletId: stringFrom(form, 'funding.collectionWalletId', project.fundingPlan.collectionWalletId)
      },
      launchConfig: {
        ...initial,
        route: {
          ...initial.route,
          initialBuySol: numberFrom(form, 'route.initialBuySol', initial.route.initialBuySol),
          slippageBps: numberFrom(form, 'route.slippageBps', initial.route.slippageBps),
          priorityFeeMode: stringFrom(form, 'route.priorityFeeMode', initial.route.priorityFeeMode),
          graduationMonitor: stringFrom(form, 'route.graduationMonitor', initial.route.graduationMonitor),
          raydiumLiquiditySol: numberFrom(form, 'route.raydiumLiquiditySol', initial.route.raydiumLiquiditySol),
          raydiumWithheldTokenPct: numberFrom(form, 'route.raydiumWithheldTokenPct', initial.route.raydiumWithheldTokenPct),
          raydiumWithheldTokenAmount: numberFrom(form, 'route.raydiumWithheldTokenAmount', initial.route.raydiumWithheldTokenAmount),
          burnLiquidity: form.get('route.burnLiquidity') === 'on'
        },
        walletPlan,
        devWalletRules: {
          ...initial.devWalletRules,
          maxInitialBuySol: numberFrom(form, 'dev.maxInitialBuySol', initial.devWalletRules.maxInitialBuySol),
          maxSlippageBps: numberFrom(form, 'dev.maxSlippageBps', initial.devWalletRules.maxSlippageBps),
          maxPriorityFeeSol: numberFrom(form, 'dev.maxPriorityFeeSol', initial.devWalletRules.maxPriorityFeeSol),
          maxDevExposureSol: numberFrom(form, 'dev.maxDevExposureSol', initial.devWalletRules.maxDevExposureSol),
          maxDevSupplyPct: numberFrom(form, 'dev.maxDevSupplyPct', initial.devWalletRules.maxDevSupplyPct),
          stopLossPct: numberFrom(form, 'dev.stopLossPct', initial.devWalletRules.stopLossPct),
          trailingStopPct: numberFrom(form, 'dev.trailingStopPct', initial.devWalletRules.trailingStopPct),
          trailingActivationPct: numberFrom(form, 'dev.trailingActivationPct', initial.devWalletRules.trailingActivationPct),
          takeProfitPercents: pctListFrom(form, 'dev.takeProfitPercents', initial.devWalletRules.takeProfitPercents),
          perTxSellCapPct: numberFrom(form, 'dev.perTxSellCapPct', initial.devWalletRules.perTxSellCapPct),
          cooldownSeconds: numberFrom(form, 'dev.cooldownSeconds', initial.devWalletRules.cooldownSeconds)
        }
      }
    };

    const response = await fetch(`/api/projects/${project.id}/launch-config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
    <form id="launch-config-form" className="launchConfigEditor cleanLaunchConfigEditor" onSubmit={save}>
      <section className="launchWizardWindow" aria-label="Launch setup window">
        <div className="launchWizardTopbar">
          <div className="launchWizardTitle">
            <span>Launch setup</span>
            <strong>{project.name} · {project.ticker}</strong>
          </div>
          <div className="launchWizardTabs" role="tablist" aria-label="Launch setup tabs">
            {LAUNCH_TABS.map((tab, index) => (
              <button
                aria-controls={`launch-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? 'active' : ''}
                id={`launch-tab-button-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{tab.label}</strong>
                <small>{tab.detail}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="launchWizardViewport">
      <section aria-labelledby="launch-tab-button-token" className="launchConfigPanel launchWizardPanel" hidden={activeTab !== 'token'} id="launch-tab-token" role="tabpanel">
        <div className="sectionIntro compactIntro">
          <span>Token Info</span>
          <h2>{project.name}</h2>
          <p>Configure metadata, launch path, funding assumptions, route preferences, and launch-wallet roles. This screen does not deploy tokens, fund wallets, sign, or broadcast.</p>
        </div>
        <div className="launchConfigEditorGrid compact">
          <label><span>Token name</span><input name="metadata.name" defaultValue={project.metadata.name || project.name} /></label>
          <label><span>Ticker</span><input name="metadata.symbol" defaultValue={project.metadata.symbol || project.ticker} /></label>
          <label><span>Launch path</span><select name="launchPath" defaultValue={project.launchPath}><option value="pump.fun">pump.fun</option><option value="raydium">raydium</option><option value="meteora">meteora</option><option value="bonk">bonk</option></select></label>
          <label><span>Token mint</span><input name="tokenMint" defaultValue={project.tokenMint ?? ''} placeholder="not launched" /></label>
          <label><span>Pool</span><input name="pool" defaultValue={project.pool ?? ''} placeholder="not created" /></label>
          <label><span>Image URL</span><input name="metadata.imageUrl" defaultValue={project.metadata.imageUrl} placeholder="/uploads or https://" /></label>
          <label className="wide"><span>Description</span><textarea name="metadata.description" defaultValue={project.metadata.description} placeholder="Two-second token description" rows={4} /></label>
          <label><span>Website</span><input name="metadata.website" defaultValue={project.metadata.website} placeholder="https://" /></label>
          <label><span>X / Twitter</span><input name="metadata.twitter" defaultValue={project.metadata.twitter} placeholder="@handle or URL" /></label>
          <label><span>Telegram</span><input name="metadata.telegram" defaultValue={project.metadata.telegram} placeholder="t.me/..." /></label>
          <label><span>Total budget SOL</span><input name="funding.budgetSol" type="number" step="0.001" defaultValue={project.fundingPlan.budgetSol} /></label>
          <label><span>Dev buy SOL</span><input name="funding.devBuySol" type="number" step="0.001" defaultValue={project.fundingPlan.devBuySol} /></label>
          <label><span>Liquidity SOL</span><input name="funding.liquiditySol" type="number" step="0.001" defaultValue={project.fundingPlan.liquiditySol} /></label>
          <label><span>Fee reserve SOL</span><input name="funding.feeReserveSol" type="number" step="0.001" defaultValue={project.fundingPlan.feeReserveSol} /></label>
          <label><span>Collection wallet id</span><input name="funding.collectionWalletId" defaultValue={project.fundingPlan.collectionWalletId} /></label>
          <label><span>Initial buy SOL cap</span><input name="route.initialBuySol" type="number" step="0.001" defaultValue={initial.route.initialBuySol} /></label>
          <label><span>Slippage bps cap</span><input name="route.slippageBps" type="number" step="1" defaultValue={initial.route.slippageBps} /></label>
          <label><span>Priority fee policy</span><input name="route.priorityFeeMode" defaultValue={initial.route.priorityFeeMode} /></label>
          <label><span>Graduation monitor</span><input name="route.graduationMonitor" defaultValue={initial.route.graduationMonitor} /></label>
          <label><span>Raydium liquidity SOL</span><input name="route.raydiumLiquiditySol" type="number" step="0.001" defaultValue={initial.route.raydiumLiquiditySol} /></label>
          <label><span>Withheld token %</span><input name="route.raydiumWithheldTokenPct" type="number" step="0.1" defaultValue={initial.route.raydiumWithheldTokenPct} /></label>
          <label><span>Withheld token amount</span><input name="route.raydiumWithheldTokenAmount" type="number" step="1" defaultValue={initial.route.raydiumWithheldTokenAmount} /></label>
          <label className="launchCheckbox"><span>Burn LP if a future LP adapter is approved</span><input name="route.burnLiquidity" type="checkbox" defaultChecked={initial.route.burnLiquidity} /></label>
        </div>
      </section>

      <section aria-labelledby="launch-tab-button-risk" className="launchConfigPanel launchWizardPanel" hidden={activeTab !== 'risk'} id="launch-tab-risk" role="tabpanel">
        <div className="sectionIntro compactIntro">
          <span>Risk policy</span>
          <h2>Deployer and wallet task automation limits</h2>
          <p>These are policy rails for launch, snipe/protection, timed buys/sells, smart sell, auto take-profit, stop-loss, and cooldown behavior. They are not fake-volume controls.</p>
        </div>
        <div className="launchConfigEditorGrid compact">
          <label><span>Max initial buy SOL</span><input name="dev.maxInitialBuySol" type="number" step="0.001" defaultValue={initial.devWalletRules.maxInitialBuySol} /></label>
          <label><span>Max slippage bps</span><input name="dev.maxSlippageBps" type="number" step="1" defaultValue={initial.devWalletRules.maxSlippageBps} /></label>
          <label><span>Max priority fee SOL</span><input name="dev.maxPriorityFeeSol" type="number" step="0.001" defaultValue={initial.devWalletRules.maxPriorityFeeSol} /></label>
          <label><span>Max dev exposure SOL</span><input name="dev.maxDevExposureSol" type="number" step="0.001" defaultValue={initial.devWalletRules.maxDevExposureSol} /></label>
          <label><span>Max dev supply %</span><input name="dev.maxDevSupplyPct" type="number" step="0.1" defaultValue={initial.devWalletRules.maxDevSupplyPct} /></label>
          <label><span>Stop loss %</span><input name="dev.stopLossPct" type="number" max="0" step="0.1" defaultValue={initial.devWalletRules.stopLossPct} /></label>
          <label><span>Trailing stop %</span><input name="dev.trailingStopPct" type="number" min="0" step="0.1" defaultValue={initial.devWalletRules.trailingStopPct} /></label>
          <label><span>Trailing activation %</span><input name="dev.trailingActivationPct" type="number" min="0" step="0.1" defaultValue={initial.devWalletRules.trailingActivationPct} /></label>
          <label><span>Take-profit levels %</span><input name="dev.takeProfitPercents" defaultValue={formatPctList(initial.devWalletRules.takeProfitPercents)} placeholder="35, 75, 150" /></label>
          <label><span>Per-tx sell cap %</span><input name="dev.perTxSellCapPct" type="number" min="0" max="100" step="0.1" defaultValue={initial.devWalletRules.perTxSellCapPct} /></label>
          <label><span>Cooldown seconds</span><input name="dev.cooldownSeconds" type="number" min="0" step="1" defaultValue={initial.devWalletRules.cooldownSeconds} /></label>
        </div>
      </section>

      <section aria-labelledby="launch-tab-button-wallets" className="launchWalletPanel deploymentWalletFlowPanel launchWizardPanel" hidden={activeTab !== 'wallets'} id="launch-tab-wallets" role="tabpanel">
        <div className="sectionIntro compactIntro">
          <span>Wallet rails</span>
          <h2>Dev wallet → bundle → sniper → task wallets</h2>
          <p>Wallet deployment follows the exact launch order: dev wallet, bundle wallets, sniper wallets, then Task Manager wallets. Signing still requires browser-wallet match and live execution stays gated.</p>
        </div>
        {wallets.length ? <div className="deploymentWalletFlow">
          <section className="deploymentWalletFlowStep">
            <div><span>01</span><h3>Dev Wallet / Buy Amount</h3><p>Select the deployer wallet and define initial buy limits.</p></div>
            <label className="deploymentDevWalletSelect">
              <span>Dev wallet</span>
              <select name="dev.walletId" defaultValue={defaultDevWalletId}>
                {wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.role || wallet.id} · {short(wallet.address)}</option>)}
              </select>
            </label>
            {wallets.map((wallet, index) => {
              const plan = initial.walletPlan.find((entry) => entry.walletId === wallet.id);
              return <div className="deploymentWalletFlowRow" key={`dev-${wallet.id}`}>
                <strong>{wallet.role || `Wallet ${index + 1}`}</strong>
                <code title={wallet.address}>{short(wallet.address)}</code>
                <span>{wallet.custodyMode === 'managed-local' ? 'managed-local' : 'browser/watch-only'}</span>
                <span className="launchWalletInputs">
                  <WalletPlanNumberField label="planned buy" name={`devPlan.${wallet.id}.plannedBuySol`} min="0" step="0.001" value={plan?.plannedBuySol ?? 0} placeholder="0.010" />
                  <WalletPlanNumberField label="max buy" name={`devPlan.${wallet.id}.maxBuySol`} min="0" step="0.001" value={plan?.maxBuySol ?? 0} placeholder="0.020" />
                  <WalletPlanNumberField label="slip bps" name={`devPlan.${wallet.id}.maxSlippageBps`} min="1" step="1" value={plan?.maxSlippageBps ?? initial.route.slippageBps} placeholder="100" />
                </span>
              </div>;
            })}
          </section>

          <section className="deploymentWalletFlowStep">
            <div><span>02</span><h3>Bundle Wallet Select</h3><p>Select wallets for launch bundle participation and cap spend per wallet.</p></div>
            {wallets.map((wallet) => {
              const plan = initial.walletPlan.find((entry) => entry.walletId === wallet.id);
              const enabled = plan?.executionPhase === 'bundle' || plan?.role.toLowerCase().includes('bundle') || walletUse(plan, 1) === 'launch-readiness';
              return <label className="deploymentWalletFlowRow selectable" key={`bundle-${wallet.id}`}>
                <input name={`bundle.${wallet.id}.enabled`} type="checkbox" defaultChecked={enabled} />
                <strong>{wallet.role}</strong>
                <code title={wallet.address}>{short(wallet.address)}</code>
                <span className="launchWalletInputs">
                  <WalletPlanNumberField label="planned SOL" name={`bundle.${wallet.id}.plannedBuySol`} min="0" step="0.001" value={plan?.plannedBuySol ?? 0} placeholder="0.010" />
                  <WalletPlanNumberField label="max SOL" name={`bundle.${wallet.id}.maxBuySol`} min="0" step="0.001" value={plan?.maxBuySol ?? 0} placeholder="0.020" />
                  <WalletPlanNumberField label="slip bps" name={`bundle.${wallet.id}.maxSlippageBps`} min="1" step="1" value={plan?.maxSlippageBps ?? initial.route.slippageBps} placeholder="100" />
                </span>
              </label>;
            })}
          </section>

          <section className="deploymentWalletFlowStep">
            <div><span>03</span><h3>Sniper Wallet Select</h3><p>Select wallets for snipe/protection rules after launch.</p></div>
            {wallets.map((wallet) => {
              const plan = initial.walletPlan.find((entry) => entry.walletId === wallet.id);
              const enabled = plan?.executionPhase === 'sniper' || plan?.role.toLowerCase().includes('sniper');
              return <label className="deploymentWalletFlowRow selectable" key={`sniper-${wallet.id}`}>
                <input name={`sniper.${wallet.id}.enabled`} type="checkbox" defaultChecked={enabled} />
                <strong>{wallet.role}</strong>
                <code title={wallet.address}>{short(wallet.address)}</code>
                <span className="launchWalletInputs riskInputs">
                  <WalletPlanNumberField label="buy cap SOL" name={`sniper.${wallet.id}.plannedBuySol`} min="0" step="0.001" value={plan?.plannedBuySol ?? 0} placeholder="0.010" />
                  <WalletPlanNumberField label="slip bps" name={`sniper.${wallet.id}.maxSlippageBps`} min="1" step="1" value={plan?.maxSlippageBps ?? initial.route.slippageBps} placeholder="100" />
                  <WalletPlanNumberField label="stop %" name={`sniper.${wallet.id}.stopLossPct`} max="0" step="0.1" value={plan?.stopLossPct || initial.devWalletRules.stopLossPct} placeholder="-18" />
                  <WalletPlanTextField label="take profit %" name={`sniper.${wallet.id}.takeProfitPercents`} value={formatPctList(plan?.takeProfitPercents?.length ? plan.takeProfitPercents : initial.devWalletRules.takeProfitPercents)} placeholder="35, 75, 150" />
                  <WalletPlanNumberField label="sell cap %" name={`sniper.${wallet.id}.perTxSellCapPct`} min="0" max="100" step="0.1" value={plan?.perTxSellCapPct || initial.devWalletRules.perTxSellCapPct} placeholder="25" />
                  <WalletPlanNumberField label="cooldown" name={`sniper.${wallet.id}.cooldownSeconds`} min="0" step="1" value={plan?.cooldownSeconds || initial.devWalletRules.cooldownSeconds} placeholder="60" />
                </span>
              </label>;
            })}
          </section>

          <section className="deploymentWalletFlowStep">
            <div><span>04</span><h3>Create Task</h3><p>Configure automated deployer wallet execution: timed buys/sells, smart sell, wallet rotation, take-profit, stop-loss, sell caps, and cooldowns.</p></div>
            <div className="deploymentTaskCommandPanel">
              <div className="deploymentTaskCommandHeader">
                <div>
                  <span>Task setup</span>
                  <strong>{selectedTaskCount} wallets selected</strong>
                  <small>{selectedTaskSol.toFixed(4)} SOL max task allocation</small>
                </div>
                <button type="submit">Save Preset</button>
              </div>
              <div className="deploymentTaskCommandGrid">
                <label className="wide"><span>Task name</span><input name="taskCommand.name" defaultValue={taskDefaults?.taskName ?? ''} placeholder="Optional task label" /></label>
                <label><span>Task type</span><select name="taskCommand.type" defaultValue={taskDefaults?.taskType ?? 'timed-buy'}>{TASK_TYPES.map((type) => <option value={type} key={type}>{taskTypeLabels[type]}</option>)}</select></label>
                <label><span>Task preset</span><select name="taskCommand.preset" defaultValue={taskDefaults?.taskPreset ?? 'fast-paced-balance'}>{TASK_PRESETS.map((preset) => <option value={preset} key={preset}>{presetLabels[preset]}</option>)}</select></label>
                <label><span>Wallet rotation</span><select name="taskCommand.rotation" defaultValue={taskDefaults?.taskWalletRotation ?? 'random'}>{TASK_ROTATION_MODES.map((mode) => <option value={mode} key={mode}>{mode}</option>)}</select></label>
                <label><span>Trade size mode</span><select name="taskCommand.sizeMode" defaultValue={taskDefaults?.taskTradeSizeMode ?? 'mixed'}>{TASK_SIZE_MODES.map((mode) => <option value={mode} key={mode}>{mode}</option>)}</select></label>
                <label><span>External response</span><select name="taskCommand.externalResponse" defaultValue={taskDefaults?.taskExternalResponse ?? 'off'}>{TASK_RESPONSE_MODES.map((mode) => <option value={mode} key={mode}>{mode}</option>)}</select></label>
                <label><span>Buy power %</span><input name="taskCommand.buyPowerPct" type="number" min="0" max="100" step="1" defaultValue={taskDefaults?.taskBuyPowerPct ?? 50} /></label>
                <label><span>Sell power %</span><input name="taskCommand.sellPowerPct" type="number" min="0" max="100" step="1" defaultValue={taskDefaults?.taskSellPowerPct ?? 50} /></label>
                <label><span>Sell min %</span><input name="taskCommand.sellMinPct" type="number" min="0" max="100" step="0.1" defaultValue={taskDefaults?.taskSellMinPct ?? 5} /></label>
                <label><span>Sell max %</span><input name="taskCommand.sellMaxPct" type="number" min="0" max="100" step="0.1" defaultValue={taskDefaults?.taskSellMaxPct ?? 35} /></label>
                <label><span>Buy min SOL</span><input name="taskCommand.buyMinSol" type="number" min="0" step="0.001" defaultValue={taskDefaults?.taskBuyMinSol ?? 0} /></label>
                <label><span>Buy max SOL</span><input name="taskCommand.buyMaxSol" type="number" min="0" step="0.001" defaultValue={taskDefaults?.taskBuyMaxSol ?? taskDefaults?.taskAmountSol ?? 0} /></label>
                <label><span>Delay min ms</span><input name="taskCommand.delayMinMs" type="number" min="0" step="50" defaultValue={taskDefaults?.taskDelayMinMs ?? 500} /></label>
                <label><span>Delay max ms</span><input name="taskCommand.delayMaxMs" type="number" min="0" step="50" defaultValue={taskDefaults?.taskDelayMaxMs ?? 4000} /></label>
                <label><span>Priority fee SOL</span><input name="taskCommand.priorityFeeSol" type="number" min="0" step="0.0001" defaultValue={taskDefaults?.taskPriorityFeeSol ?? 0} /></label>
              </div>
              <div className="deploymentTaskPresetRail">
                <span>fast paced balance</span>
                <span>smooth flow</span>
                <span>custom preset</span>
              </div>
            </div>
            {wallets.map((wallet) => {
              const plan = initial.walletPlan.find((entry) => entry.walletId === wallet.id);
              const enabled = plan?.executionPhase === 'task' || plan?.role.toLowerCase().includes('task');
              return <label className="deploymentWalletFlowRow selectable taskRow" key={`task-${wallet.id}`}>
                <input name={`task.${wallet.id}.enabled`} type="checkbox" defaultChecked={enabled} />
                <strong>{wallet.role}</strong>
                <code title={wallet.address}>{short(wallet.address)}</code>
                <span className="launchWalletInputs taskInputs">
                  <WalletPlanNumberField label="amount SOL" name={`task.${wallet.id}.taskAmountSol`} min="0" step="0.001" value={plan?.taskAmountSol ?? plan?.plannedBuySol ?? 0} placeholder="0.010" />
                  <WalletPlanNumberField label="sell %" name={`task.${wallet.id}.taskSellPercent`} min="0" max="100" step="0.1" value={plan?.taskSellPercent ?? 0} placeholder="25" />
                  <WalletPlanNumberField label="max total SOL" name={`task.${wallet.id}.taskMaxTotalSol`} min="0" step="0.001" value={plan?.taskMaxTotalSol ?? plan?.maxBuySol ?? 0} placeholder="0.050" />
                  <WalletPlanNumberField label="delay sec" name={`task.${wallet.id}.delaySeconds`} min="0" step="1" value={plan?.taskDelaySeconds ?? 0} placeholder="0" />
                  <WalletPlanNumberField label="interval sec" name={`task.${wallet.id}.intervalSeconds`} min="0" step="1" value={plan?.taskIntervalSeconds ?? 0} placeholder="60" />
                  <WalletPlanNumberField label="max runs" name={`task.${wallet.id}.maxExecutions`} min="1" step="1" value={plan?.taskMaxExecutions ?? 1} placeholder="1" />
                </span>
              </label>;
            })}
          </section>
        </div> : <div className="simpleEmptyBundle">No saved wallets. Add your connected browser signer as a watch-only wallet in Wallet Center.</div>}
        <p className="walletSecurityFootnote">Task rails are automated deployer wallet controls for timed execution, smart sell behavior, auto take-profit, stop-loss, sell caps, cooldowns, and responsive wallet management.</p>
      </section>

      <section aria-labelledby="launch-tab-button-review" className="deploymentDisabledPanel launchWizardPanel" hidden={activeTab !== 'review'} id="launch-tab-review" role="tabpanel">
        <div className="sectionIntro compactIntro"><span>Execution gate</span><h2>Deploy controls are disabled</h2><p>A-profile allows Terminal quote/build/simulate/sign testing only. Deployment execution needs a later explicit approval profile and separate broadcast gate.</p></div>
        <div className="deploymentAdapterGrid">
          <div><span>Unsigned deploy builder</span><strong>Disabled</strong><small>adapter not active</small></div>
          <div><span>Browser-wallet deploy signature</span><strong>Disabled</strong><small>deployment gate off</small></div>
          <div><span>Broadcast</span><strong>Disabled</strong><small>broadcast gate off</small></div>
        </div>
      </section>

        </div>

        <div className="launchWizardFooter">
          <button disabled={activeTabIndex === 0} onClick={() => setActiveTab(previousTab)} type="button">Previous</button>
          <button disabled={activeTabIndex === LAUNCH_TABS.length - 1} onClick={() => setActiveTab(nextTab)} type="button">Next</button>
          <button type="submit" disabled={saveState === 'saving'}>{saveState === 'saving' ? 'Saving…' : 'Save Configuration'}</button>
          <span>{message}</span>
        </div>
      </section>
    </form>
  );
}
