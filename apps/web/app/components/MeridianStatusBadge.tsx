import type { PreLiveChecklistState } from '../../lib/pre-live-checklist';
import type { RpcHealthStatus } from '../../lib/rpc-health';

function stateLabel(state: PreLiveChecklistState) {
  if (state === 'ready-for-explicit-live-activation') return 'Pre-live ready';
  if (state === 'partial') return 'Needs attention';
  return 'Blocked';
}

function rpcLabel(status: RpcHealthStatus, quotaLimited?: boolean) {
  if (status === 'live') return 'RPC live';
  if (quotaLimited) return 'Known RPC capacity item';
  if (status === 'modeled') return 'RPC not configured';
  return 'RPC capacity check';
}

function issueLabel(issue: string) {
  if (issue === 'session-authenticated') return 'operator login required in this browser';
  if (issue === 'rpc-health') return 'RPC capacity upgrade before real go-live';
  return issue;
}

function issueSummary(failed: string[] = [], warnings: string[] = []) {
  if (failed.length) return `Blocked: ${failed.map(issueLabel).join(', ')}`;
  if (warnings.length) return `Attention: ${warnings.map(issueLabel).join(', ')}`;
  return 'All pre-live checks clear';
}

export function MeridianStatusBadge(props: {
  projectName?: string | null;
  checklistState: PreLiveChecklistState;
  checklistWarnings?: string[];
  checklistFailed?: string[];
  rpcStatus: RpcHealthStatus;
  rpcProviderLabel: string;
  rpcQuotaLimited?: boolean;
  dryRunStatus?: string | null;
}) {
  const tone = props.checklistState === 'ready-for-explicit-live-activation' ? 'pass' : props.checklistState === 'partial' ? 'warn' : 'fail';
  const dryRun = props.dryRunStatus === 'pass' ? 'Dry-run pass' : props.dryRunStatus ? `Dry-run ${props.dryRunStatus}` : 'Dry-run needed';
  const issues = issueSummary(props.checklistFailed, props.checklistWarnings);
  return <section className={`meridianGlobalStatus ${tone}`} aria-label="Bond.Terminal global status">
    <div>
      <span>Bond.Terminal board status</span>
      <strong>{stateLabel(props.checklistState)}</strong>
      <small>{props.projectName ?? 'No project selected'} · live execution disabled</small>
    </div>
    <div><span>RPC</span><strong>{rpcLabel(props.rpcStatus, props.rpcQuotaLimited)}</strong><small>{props.rpcProviderLabel}</small></div>
    <div><span>Dry-run</span><strong>{dryRun}</strong><small>{issues}</small></div>
    <div><span>Safety</span><strong>Live off</strong><small>No signing · no swaps · no broadcasts</small></div>
  </section>;
}
