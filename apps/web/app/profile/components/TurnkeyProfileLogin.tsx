'use client';

import { AuthState, ClientState, TurnkeyProvider, type TurnkeyProviderConfig, useTurnkey } from '@turnkey/react-wallet-kit';

const organizationId = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID ?? process.env.NEXT_PUBLIC_ORGANIZATION_ID ?? '';
const authProxyConfigId = process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID ?? process.env.NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID ?? '';
const turnkeyConfigured = Boolean(organizationId && authProxyConfigId);

function shortValue(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
}

function detectBrowserWallet(): string {
  if (typeof window === 'undefined') return 'checking';
  const solana = (window as Window & { solana?: { isPhantom?: boolean } }).solana;
  if (!solana) return 'not detected';
  return solana.isPhantom ? 'Phantom detected' : 'Solana wallet detected';
}

function configuredTurnkeyConfig(): TurnkeyProviderConfig {
  return {
    organizationId,
    authProxyConfigId,
    ui: {
      darkMode: true,
      preferLargeActionButtons: true,
      authModal: {
        methods: {
          emailOtpAuthEnabled: true,
          passkeyAuthEnabled: true,
          walletAuthEnabled: true,
          smsOtpAuthEnabled: false
        }
      }
    }
  };
}

function TurnkeyConfiguredPanel() {
  const turnkey = useTurnkey();
  const clientReady = turnkey.clientState === ClientState.Ready;
  const authenticated = turnkey.authState === AuthState.Authenticated;
  const user = turnkey.user as { userId?: string; userName?: string; email?: string } | undefined;
  const firstWallet = turnkey.wallets[0];
  const firstAccount = firstWallet?.accounts?.[0];
  const browserWallet = detectBrowserWallet();

  async function login() {
    await turnkey.handleLogin({ title: 'Log in to Bond.Terminal' });
  }

  async function refresh() {
    await Promise.allSettled([turnkey.refreshUser(), turnkey.refreshWallets()]);
  }

  return (
    <section className="profileGrid">
      <div className="documentCard profileCard">
        <div className="profileAvatar">{authenticated ? 'TK' : 'B'}</div>
        <div>
          <div className="eyebrow">Turnkey profile</div>
          <h1>{authenticated ? 'Turnkey identity connected' : 'Log in with Turnkey'}</h1>
          <p>
            Turnkey provides the operator identity layer for Bond.Terminal. Use it with the protected operator session before any gated transaction-building workflow.
          </p>
        </div>
        <div className="profileActions">
          <button className="button" type="button" onClick={() => void login()} disabled={!clientReady || authenticated}>
            {authenticated ? 'Logged in' : clientReady ? 'Log in with Turnkey' : 'Loading Turnkey'}
          </button>
          <button className="button secondary" type="button" onClick={() => void refresh()} disabled={!clientReady || !authenticated}>
            Refresh profile
          </button>
        </div>
      </div>

      <div className="documentCard">
        <h2>Account state</h2>
        <div className="infoGrid">
          <div className="sideRow"><span>Status</span><strong>{authenticated ? 'authenticated' : 'not authenticated'}</strong></div>
          <div className="sideRow"><span>Turnkey client</span><strong>{turnkey.clientState ?? 'initializing'}</strong></div>
          <div className="sideRow"><span>User</span><strong>{user?.userName ?? shortValue(user?.userId)}</strong></div>
          <div className="sideRow"><span>Embedded wallets</span><strong>{turnkey.wallets.length}</strong></div>
          <div className="sideRow"><span>First wallet</span><strong>{shortValue(firstWallet?.walletId)}</strong></div>
          <div className="sideRow"><span>First account</span><strong>{shortValue(firstAccount?.address)}</strong></div>
          <div className="sideRow"><span>Browser wallet</span><strong>{browserWallet}</strong></div>
          <div className="sideRow"><span>Signing</span><strong>browser-wallet gated</strong></div>
          <div className="sideRow"><span>Execution</span><strong>policy gated</strong></div>
        </div>
      </div>

      <div className="documentCard">
        <h2>Access model</h2>
        <ol className="roadmapList">
          <li>Turnkey authenticates the operator profile through Auth Proxy.</li>
          <li>The operator session protects server-side gated workflows.</li>
          <li>Browser wallets remain the signing authority for transactions.</li>
          <li>Execution policies still enforce simulation, signer matching, and route limits.</li>
        </ol>
      </div>
    </section>
  );
}

export function TurnkeyProfileLogin() {
  if (!turnkeyConfigured) {
    return (
      <section className="profileGrid">
        <div className="documentCard profileCard">
          <div className="profileAvatar">TK</div>
          <div>
            <div className="eyebrow">Turnkey profile</div>
            <h1>Turnkey login needs configuration</h1>
            <p>Add the public Turnkey organization ID and Auth Proxy config ID in production to enable operator login.</p>
          </div>
          <div className="profileActions">
            <button className="button" type="button" disabled>Turnkey unavailable</button>
          </div>
        </div>

        <div className="documentCard">
          <h2>Required public env</h2>
          <div className="infoGrid">
            <div className="sideRow"><span>NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID</span><strong>missing</strong></div>
            <div className="sideRow"><span>NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID</span><strong>missing</strong></div>
            <div className="sideRow"><span>Secrets required here</span><strong>none</strong></div>
          </div>
        </div>

        <div className="documentCard">
          <h2>Configuration rules</h2>
          <ol className="roadmapList">
            <li>Only public Turnkey IDs belong in NEXT_PUBLIC vars.</li>
            <li>No sensitive credentials, provider credentials, or Turnkey secret material should be committed.</li>
            <li>Wallet signing and execution remain gated outside this identity panel.</li>
          </ol>
        </div>
      </section>
    );
  }

  return (
    <TurnkeyProvider
      config={configuredTurnkeyConfig()}
      callbacks={{
        onError: (error) => console.error('Turnkey profile error:', error)
      }}
    >
      <TurnkeyConfiguredPanel />
    </TurnkeyProvider>
  );
}
