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
    await turnkey.handleLogin({ title: 'Log in to Meridian' });
  }

  async function refresh() {
    await Promise.allSettled([turnkey.refreshUser(), turnkey.refreshWallets()]);
  }

  return (
    <section className="profileGrid">
      <div className="documentCard profileCard">
        <div className="profileAvatar">{authenticated ? 'TK' : 'M'}</div>
        <div>
          <div className="eyebrow">Turnkey profile</div>
          <h1>{authenticated ? 'Read-only identity connected' : 'Connect read-only identity'}</h1>
          <p>
            Turnkey is installed only as a profile identity surface. It may show user/wallet/account metadata,
            but signing, swaps, private-key export, wallet mutation, and live trading remain disabled in Meridian.
          </p>
        </div>
        <div className="profileActions">
          <button className="button" type="button" onClick={() => void login()} disabled={!clientReady || authenticated}>
            {authenticated ? 'Identity connected' : clientReady ? 'Connect identity' : 'Loading Turnkey'}
          </button>
          <button className="button secondary" type="button" onClick={() => void refresh()} disabled={!clientReady || !authenticated}>
            Refresh profile
          </button>
        </div>
      </div>

      <div className="documentCard">
        <h2>Read-only account state</h2>
        <div className="infoGrid">
          <div className="sideRow"><span>Status</span><strong>{authenticated ? 'authenticated' : 'not authenticated'}</strong></div>
          <div className="sideRow"><span>Turnkey client</span><strong>{turnkey.clientState ?? 'initializing'}</strong></div>
          <div className="sideRow"><span>User</span><strong>{user?.userName ?? shortValue(user?.userId)}</strong></div>
          <div className="sideRow"><span>Embedded wallets</span><strong>{turnkey.wallets.length}</strong></div>
          <div className="sideRow"><span>First wallet</span><strong>{shortValue(firstWallet?.walletId)}</strong></div>
          <div className="sideRow"><span>First account</span><strong>{shortValue(firstAccount?.address)}</strong></div>
          <div className="sideRow"><span>Browser wallet</span><strong>{browserWallet}</strong></div>
          <div className="sideRow"><span>Signing</span><strong>disabled in app</strong></div>
          <div className="sideRow"><span>Live trading</span><strong>disabled</strong></div>
        </div>
      </div>

      <div className="documentCard">
        <h2>Profile obligation</h2>
        <ol className="roadmapList">
          <li>Represent operator identity through Turnkey Auth Proxy.</li>
          <li>Expose only read-only user/wallet/account metadata inside Meridian.</li>
          <li>Do not treat embedded wallet visibility as execution permission.</li>
          <li>Map identity to projects later as metadata only until a separate permission model exists.</li>
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
            <h1>Turnkey identity surface installed</h1>
            <p>Add the public Turnkey organization ID and Auth Proxy config ID when we are ready to test read-only profile identity.</p>
          </div>
          <div className="profileActions">
            <button className="button" type="button" disabled>Identity unavailable</button>
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
          <h2>Current obligation</h2>
          <ol className="roadmapList">
            <li>Only public Turnkey IDs belong in NEXT_PUBLIC vars.</li>
            <li>No private keys, API keys, or Turnkey secret material should be committed.</li>
            <li>This section represents identity only; signing, swaps, wallet export/import, and live trading remain disabled.</li>
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
