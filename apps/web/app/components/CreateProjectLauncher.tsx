'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AccountGatePrompt, useRequireTurnkeyAccount } from './RequireAccountAction';

type Step = 'basics' | 'launch' | 'wallet' | 'budget' | 'review';
type LauncherMode = 'modal' | 'inline' | 'compact';

type WalletRailPayload = {
  selectedWallet: string | null;
  selectedInventoryMatch: boolean;
  selectedInventoryWallet: { id: string; role: string; address: string; groupId: string; groupName?: string | null; custodyMode: string } | null;
  defaultWatchOnlyGroup?: { id: string; name: string; scope: string } | null;
  solBalance: number | null;
  selectedSolBalance: number | null;
  balanceStatus: string;
  provider: string;
};

type ProjectsPayload = {
  data?: { walletGroups?: Array<{ id: string; name: string; scope: string; walletIds?: string[] }>; wallets?: Array<{ id: string; role: string; address: string; groupId: string; custodyMode?: string; archived?: boolean }> };
  mutationMode?: string;
  persisted?: boolean;
};

const steps: Array<[Step, string, string]> = [
  ['basics', 'Basics', 'Project Basics'],
  ['launch', 'Launch', 'Launch Setup'],
  ['wallet', 'Wallet', 'Wallet Routing'],
  ['budget', 'Budget', 'Risk & Budget'],
  ['review', 'Review', 'Review & Create']
];

const launchPaths = [
  ['pump.fun', 'Pump.fun', 'Fair-launch configuration. Deployment remains disabled.'],
  ['raydium', 'Raydium', 'Post-launch liquidity configuration. LP action remains disabled.'],
  ['meteora', 'Meteora', 'DLMM/bin-liquidity planning. Execution remains disabled.'],
  ['bonk', 'Bonk', 'Bonk launchpad planning. Launch adapter remains disabled.'],
  ['custom', 'Custom', 'Manual launch checklist and notes. No chain action.']
] as const;

const styles = ['Fair launch meme', 'Mechanics / fee flywheel', 'Community takeover', 'Liquidity support', 'Custom'] as const;

type Props = { mode?: LauncherMode; label?: string; title?: string; copy?: string; defaultOpen?: boolean; className?: string };

function short(address?: string | null) { return address ? `${address.slice(0, 5)}…${address.slice(-5)}` : '—'; }
function numeric(value: string) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export function CreateProjectLauncher({
  mode = 'compact',
  label = '+ Create Project',
  title = 'Create project',
  copy = 'Create a real BONDR project record. No token, wallet, signing, funding, deployment, or chain action occurs here.',
  defaultOpen = false,
  className = ''
}: Props) {
  const [open, setOpen] = useState(defaultOpen || mode === 'inline');
  const accountGate = useRequireTurnkeyAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [step, setStep] = useState<Step>('basics');
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [twitter, setTwitter] = useState('');
  const [telegram, setTelegram] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [launchPath, setLaunchPath] = useState<(typeof launchPaths)[number][0]>('pump.fun');
  const [quoteToken, setQuoteToken] = useState<'SOL' | 'USDC'>('SOL');
  const [launchStyle, setLaunchStyle] = useState<(typeof styles)[number]>('Fair launch meme');
  const [launchNotes, setLaunchNotes] = useState('');
  const [walletGroupId, setWalletGroupId] = useState('');
  const [devBuy, setDevBuy] = useState('0');
  const [liquidity, setLiquidity] = useState('0');
  const [feeReserve, setFeeReserve] = useState('0');
  const [maxSlippage, setMaxSlippage] = useState('100');
  const [rail, setRail] = useState<WalletRailPayload | null>(null);
  const [projects, setProjects] = useState<ProjectsPayload | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const currentIndex = steps.findIndex(([id]) => id === step);
  const activeWallet = rail?.selectedInventoryWallet;
  const groups = projects?.data?.walletGroups ?? [];
  const selectedGroup = groups.find((group) => group.id === walletGroupId) ?? groups.find((group) => group.id === activeWallet?.groupId) ?? groups[0] ?? null;
  const canCreate = Boolean(name.trim() && ticker.trim());
  const budgetTotal = numeric(devBuy) + numeric(liquidity) + numeric(feeReserve);

  useEffect(() => {
    if (!open) return;
    const selected = typeof window !== 'undefined' ? window.localStorage.getItem('bondr.activeWallet') ?? '' : '';
    const params = new URLSearchParams();
    if (selected) params.set('selectedWallet', selected);
    void Promise.all([
      fetch(`/api/wallet-rail?${params.toString()}`, { cache: 'no-store' }).then((r) => r.json()).then((payload: WalletRailPayload) => {
        setRail(payload);
        const groupId = payload.selectedInventoryWallet?.groupId ?? payload.defaultWatchOnlyGroup?.id ?? '';
        if (groupId) setWalletGroupId((current) => current || groupId);
      }).catch(() => undefined),
      fetch('/api/projects', { cache: 'no-store' }).then((r) => r.json()).then((payload: ProjectsPayload) => {
        setProjects(payload);
        const groupId = payload.data?.walletGroups?.find((group) => group.id === 'operator-wallets')?.id ?? payload.data?.walletGroups?.[0]?.id ?? '';
        if (groupId) setWalletGroupId((current) => current || groupId);
      }).catch(() => undefined)
    ]);
  }, [open]);

  async function openLauncher() { await accountGate.requireAccount(() => setOpen(true)); }
  function next() { setStep(steps[Math.min(currentIndex + 1, steps.length - 1)][0]); }
  function back() { setStep(steps[Math.max(currentIndex - 1, 0)][0]); }

  async function createProject() {
    if (!accountGate.account.authenticated) { await accountGate.requireAccount(); return; }
    if (!canCreate) { setError('Project name and ticker are required.'); return; }
    setSubmitting(true);
    setStatus('Creating durable project record. No chain action will run.');
    setError('');
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          ticker,
          launchPath,
          quoteToken,
          walletGroupId: selectedGroup?.id ?? walletGroupId,
          launchNotes: `${launchStyle}${launchNotes ? ` — ${launchNotes}` : ''}`,
          maxSlippageBps: numeric(maxSlippage),
          metadata: { description, website, twitter, telegram, imageUrl },
          fundingPlan: { devBuySol: numeric(devBuy), liquiditySol: numeric(liquidity), feeReserveSol: numeric(feeReserve), budgetSol: budgetTotal, collectionWalletId: activeWallet?.id ?? 'browser-signer-watch-only' }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `Project creation failed. HTTP ${response.status}`);
      if (!data.persisted) throw new Error('Project record was not persisted. Creation blocked to avoid disappearing drafts.');
      const projectId = data.project?.id;
      setStatus(`Created ${data.project?.name ?? name}. Opening configuration page…`);
      setTimeout(() => { window.location.href = projectId ? `/deployment?project=${projectId}` : '/deployment'; }, 500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Project creation failed.');
      setStatus('');
    } finally {
      setSubmitting(false);
    }
  }

  const launcherCard = (
    <section className={`documentCard createProjectPanel guidedCreateProjectPanel ${mode === 'inline' ? 'inlineCreateProjectPanel' : ''} ${className}`}>
      <div className="sectionIntro compactIntro createProjectHeaderRow">
        <div><span>Create Project</span><h2>{title}</h2><p>{copy}</p></div>
        <div className="createProjectHeaderActions"><button className="button" type="button" onClick={() => void openLauncher()}>{label}</button>{mode === 'inline' && <><a href="/projects">Projects</a><a href="/deployment">Deployment</a></>}</div>
      </div>
      {status && <p className="profitText">{status}</p>}{error && <p className="dangerText">{error}</p>}
      {mode === 'inline' && open && wizard(false)}
    </section>
  );

  const modalWizard = mounted && open && mode !== 'inline' ? createPortal(wizard(true), document.body) : null;
  if (mode === 'modal') return <><button className="bondrHeaderAction createProjectHeaderButton" type="button" onClick={() => void openLauncher()}>{label}</button>{modalWizard}<AccountGatePrompt open={accountGate.promptOpen} onClose={() => accountGate.setPromptOpen(false)} intent="create a project" /></>;
  return <>{launcherCard}{modalWizard}<AccountGatePrompt open={accountGate.promptOpen} onClose={() => accountGate.setPromptOpen(false)} intent="create a project" /></>;

  function wizard(isModal: boolean) {
    const shell = <div className="createProjectModalShell professionalCreateProjectShell">
      <header><div><span>New BONDR Project</span><h2>{steps[currentIndex][2]}</h2><p>Guided project record setup. Configuration/planning opens after creation; no transaction is signed or broadcast here.</p></div>{isModal && <button type="button" onClick={() => setOpen(false)}>Close</button>}</header>
      <nav className="createProjectStepRail" aria-label="Create project steps">{steps.map(([id, shortLabel], index) => <button key={id} className={step === id ? 'active' : ''} type="button" onClick={() => setStep(id)}><span>{index + 1}</span>{shortLabel}</button>)}</nav>
      <section className="createProjectStepBody professionalCreateProjectBody">
        {step === 'basics' && <div className="guidedFormGrid metadataStepGrid"><label><span>Project / token name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: BONDR Launch" /></label><label><span>Ticker</span><input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="BONDR" /></label><label className="wide"><span>One-line description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should a buyer understand in two seconds?" rows={4} /></label><label><span>Website</span><input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" /></label><label><span>X / Twitter</span><input value={twitter} onChange={(event) => setTwitter(event.target.value)} placeholder="@handle or URL" /></label><label><span>Telegram</span><input value={telegram} onChange={(event) => setTelegram(event.target.value)} placeholder="t.me/..." /></label><label className="wide"><span>Image URL</span><input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="Optional logo/asset URL" /></label></div>}
        {step === 'launch' && <div className="guidedChoiceGrid launchPathChoiceGrid">{launchPaths.map(([id, cardTitle, body]) => <button key={id} className={launchPath === id ? 'active' : ''} type="button" onClick={() => setLaunchPath(id)}><strong>{cardTitle}</strong><span>{body}</span><em>config-only</em></button>)}<div className="quoteTokenPanel strongQuotePanel"><h3>Launch style</h3><label><span>Intent</span><select value={launchStyle} onChange={(event) => setLaunchStyle(event.target.value as typeof launchStyle)}>{styles.map((item) => <option key={item}>{item}</option>)}</select></label><div className="quoteTokenChoices"><button className={quoteToken === 'SOL' ? 'active' : ''} type="button" onClick={() => setQuoteToken('SOL')}>SOL quote</button><button className={quoteToken === 'USDC' ? 'active' : ''} type="button" onClick={() => setQuoteToken('USDC')}>USDC quote</button></div><label><span>Launch notes</span><textarea value={launchNotes} onChange={(event) => setLaunchNotes(event.target.value)} rows={3} placeholder="Positioning, meme angle, mechanics, or constraints." /></label></div></div>}
        {step === 'wallet' && <div className="overviewDeployPanel launchReviewPanel"><h3>Wallet routing</h3><div className="overviewDeployGrid"><div><span>Active wallet</span><strong>{activeWallet ? `${activeWallet.role} · ${short(activeWallet.address)}` : 'No active wallet selected'}</strong></div><div><span>Wallet state</span><strong>{rail?.selectedInventoryMatch ? 'Saved in Portfolio' : 'Needs Portfolio wallet record'}</strong></div><div><span>Balance read</span><strong>{typeof rail?.selectedSolBalance === 'number' ? `${rail.selectedSolBalance.toFixed(5)} SOL` : rail?.balanceStatus ?? 'checking'}</strong></div><div><span>Provider</span><strong>{rail?.provider ?? 'checking'}</strong></div></div><label><span>Project wallet group</span><select value={walletGroupId} onChange={(event) => setWalletGroupId(event.target.value)}>{groups.map((group) => <option value={group.id} key={group.id}>{group.name} · {group.scope} · {group.walletIds?.length ?? 0} wallets</option>)}{!groups.length && <option value="">No groups loaded</option>}</select></label><p className="qaMuted">This links a public Portfolio wallet record to the project. Your browser wallet signs later only when the connected signer matches the selected wallet. No key material is stored.</p>{!activeWallet && <a className="button secondary" href="/portfolio?view=wallets">Open Portfolio Wallets</a>}</div>}
        {step === 'budget' && <div className="guidedFormGrid metadataStepGrid"><label><span>Dev buy cap SOL</span><input type="number" step="0.001" value={devBuy} onChange={(event) => setDevBuy(event.target.value)} /></label><label><span>Liquidity budget SOL</span><input type="number" step="0.001" value={liquidity} onChange={(event) => setLiquidity(event.target.value)} /></label><label><span>Fee reserve SOL</span><input type="number" step="0.001" value={feeReserve} onChange={(event) => setFeeReserve(event.target.value)} /></label><label><span>Max slippage bps</span><input type="number" step="1" value={maxSlippage} onChange={(event) => setMaxSlippage(event.target.value)} /></label><div className="overviewDeployPanel launchReviewPanel wide"><h3>Planning total</h3><div className="overviewDeployGrid"><div><span>Total planned SOL</span><strong>{budgetTotal.toFixed(4)} SOL</strong></div><div><span>Execution</span><strong>Planning only</strong></div><div><span>Funding</span><strong>Disabled</strong></div><div><span>Broadcast</span><strong>Disabled</strong></div></div></div></div>}
        {step === 'review' && <div className="overviewDeployPanel launchReviewPanel"><h3>Review</h3><div className="overviewDeployGrid"><div><span>Project</span><strong className={canCreate ? 'profitText' : 'dangerText'}>{canCreate ? `${name} / ${ticker}` : 'Missing name/ticker'}</strong></div><div><span>Launch path</span><strong>{launchPath}</strong></div><div><span>Quote asset</span><strong>{quoteToken}</strong></div><div><span>Wallet group</span><strong>{selectedGroup?.name ?? 'No group selected'}</strong></div><div><span>Budget</span><strong>{budgetTotal.toFixed(4)} SOL planning only</strong></div><div><span>After create</span><strong>Open config/planning page</strong></div><div><span>Token created?</span><strong>No</strong></div><div><span>SOL moved?</span><strong>No</strong></div><div><span>Transaction signed?</span><strong>No</strong></div><div><span>Broadcast?</span><strong>Disabled</strong></div></div><p className="qaMuted">Creates a durable project record only. Deployment, funding, claims, payouts, server custody, private keys, and broadcast remain disabled.</p><button className="button" type="button" onClick={createProject} disabled={!canCreate || submitting}>{submitting ? 'Creating…' : 'Create Project Record'}</button></div>}
      </section>
      <footer><button type="button" onClick={back} disabled={currentIndex === 0}>Back</button><span>{error || status || `${steps[currentIndex][1]} · No deployment, funding, signing, broadcast, or swaps.`}</span>{currentIndex < steps.length - 1 ? <button type="button" onClick={next}>Next</button> : <button type="button" onClick={createProject} disabled={!canCreate || submitting}>{submitting ? 'Creating…' : 'Create Project Record'}</button>}</footer>
    </div>;
    return isModal ? <div className="createProjectModal" role="dialog" aria-modal="true" aria-label="Create project guided setup">{shell}</div> : shell;
  }
}
