import type { MeridianStore } from './meridian-store';
import type { meridianRequestAuthenticated } from './meridian-auth';

export type AuthenticatedQaChecklist = {
  contract: 'bondr-authenticated-manual-qa-checklist-v1';
  status: 'ready' | 'blocked';
  authenticated: boolean;
  projectId: string | null;
  tabCount: number;
  tabs: Array<{
    id: string;
    label: string;
    href: string;
    requiresProject: boolean;
    status: 'ready' | 'blocked';
    blockers: string[];
  }>;
  blockers: string[];
  safety: {
    readOnly: true;
    noSigning: true;
    noBroadcast: true;
    noMutation: true;
  };
};

const QA_TABS = [
  ['hub', 'Hub', '/'],
  ['profile', 'Profile Audit', '/profile'],
  ['portfolio', 'Portfolio', '/portfolio'],
  ['wallets', 'Wallet Center', '/wallets'],
  ['deployment', 'Deployment', '/deployment'],
  ['sniper', 'Sniper', '/sniper'],
  ['liquidity', 'Liquidity', '/liquidity'],
  ['token-analyzer', 'Token Analyzer', '/token-analyzer'],
  ['projects', 'Projects', '/projects'],
  ['project-dashboard', 'Project Dashboard', '/project-dashboard']
] as const;

export function buildAuthenticatedQaChecklist(input: {
  auth: Awaited<ReturnType<typeof meridianRequestAuthenticated>>;
  store: MeridianStore;
  projectId?: string | null;
}): AuthenticatedQaChecklist {
  const project = input.projectId
    ? input.store.projects.find((item) => item.id === input.projectId) ?? null
    : input.store.projects[0] ?? null;
  const tabs = QA_TABS.map(([id, label, href]) => {
    const requiresProject = id === 'deployment' || id === 'project-dashboard';
    const blockers = [
      input.auth.authenticated ? null : 'operator-session-required',
      requiresProject && !project ? 'project-required-for-tab-qa' : null
    ].filter((item): item is string => Boolean(item));
    const suffix = project && (id === 'deployment' || id === 'sniper' || id === 'liquidity')
      ? `?project=${encodeURIComponent(project.id)}`
      : '';
    return {
      id,
      label,
      href: `${href}${suffix}`,
      requiresProject,
      status: blockers.length ? 'blocked' as const : 'ready' as const,
      blockers
    };
  });
  const blockers = Array.from(new Set(tabs.flatMap((tab) => tab.blockers)));

  return {
    contract: 'bondr-authenticated-manual-qa-checklist-v1',
    status: blockers.length ? 'blocked' : 'ready',
    authenticated: input.auth.authenticated,
    projectId: project?.id ?? null,
    tabCount: tabs.length,
    tabs,
    blockers,
    safety: {
      readOnly: true,
      noSigning: true,
      noBroadcast: true,
      noMutation: true
    }
  };
}
