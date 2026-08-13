import { getLiveActivationStatus } from '../../lib/live-activation';
import { meridianAuthConfig, meridianSessionStatus } from '../../lib/meridian-auth';
import { getSolanaRpcHealth } from '../../lib/rpc-health';

type FoundationStatusPanelProps = {
  surface?: 'profile' | 'wallets' | 'terminal' | 'portfolio' | 'deployment' | 'liquidity' | 'projects';
  compact?: boolean;
};

function stateLabel(value: boolean, yes = 'ready', no = 'blocked') { return value ? yes : no; }

export async function FoundationStatusPanel({ surface = 'profile', compact = false }: FoundationStatusPanelProps) {
  const [rpcHealth, session] = await Promise.all([getSolanaRpcHealth(), meridianSessionStatus()]);
  const auth = meridianAuthConfig();
  const live = getLiveActivationStatus({ rpcHealth, auth, authenticated: session.authenticated, authReason: session.authenticated ? null : session.reason });
  const providerLimited = rpcHealth.status !== 'live' || rpcHealth.quotaLimited;
  const title = surface === 'terminal' ? 'Terminal foundation status' : surface === 'deployment' ? 'Deployment foundation status' : surface === 'portfolio' ? 'Portfolio data foundation' : surface === 'wallets' ? 'Wallet Ops foundation status' : 'Foundation status';
  const rows = [
    ['wallet identity', 'canonical /api/wallet-rail', 'Connected signer + selected wallet + Wallet Ops inventory are the wallet truth.'],
    ['SOL balance', providerLimited ? 'provider-limited' : 'live/provider checked', providerLimited ? 'Balance provider-limited; wallet may still have funds.' : 'Live RPC/provider status available.'],
    ['token balance', 'active mint via wallet rail', 'Token balance is read only when a mint is supplied.'],
    ['auth', auth.configured ? session.authenticated ? 'authenticated' : 'required' : 'not-configured', auth.configured ? session.authenticated ? 'Operator session active.' : 'Operator login required.' : 'Operator auth not configured in this environment.'],
    ['execution capability', live.readinessLevel, `Signing ${stateLabel(live.signingEnabled, 'enabled', 'disabled')} · broadcast ${stateLabel(live.broadcastEnabled, 'enabled', 'disabled')}.`],
    ['browser-wallet signing path', live.signingEnabled ? 'available after simulation' : 'blocked', 'Browser wallet signs; server custody and private keys are not used.'],
    ['broadcast', live.broadcastEnabled ? 'enabled' : 'disabled', 'Broadcast is controlled by execution policy.'],
    ['deployment', live.deploymentEnabled ? 'enabled' : 'disabled', 'Deployment disabled until separate approval.']
  ];

  return (
    <section className={`foundationStatusPanel ${compact ? 'compactFoundationStatus' : ''}`} aria-label={`${title} foundation`}>
      <div className="foundationStatusHead">
        <div><span>Foundation truth</span><strong>{title}</strong><small>Wallet identity, balances, auth, and execution capability in one place.</small></div>
        <em>{live.readinessLevel}</em>
      </div>
      <div className="foundationStatusGrid">
        {rows.map(([label, value, detail]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}
      </div>
      <p>Foundation truth table: wallet identity uses `/api/wallet-rail`; modeled/store balances must be labeled; provider-limited is not empty; broadcast/deployment remain disabled.</p>
    </section>
  );
}
