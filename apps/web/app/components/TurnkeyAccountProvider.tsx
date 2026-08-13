'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { AuthState, ClientState, TurnkeyProvider, type TurnkeyProviderConfig, useTurnkey } from '@turnkey/react-wallet-kit';

const organizationId = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID ?? process.env.NEXT_PUBLIC_ORGANIZATION_ID ?? '';
const authProxyConfigId = process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID ?? process.env.NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID ?? '';
const configured = Boolean(organizationId && authProxyConfigId);

export type BondrTurnkeyAccount = {
  configured: boolean;
  clientReady: boolean;
  authenticated: boolean;
  clientState: string;
  authState: string;
  userId: string | null;
  userName: string | null;
  email: string | null;
  organizationId: string | null;
  walletCount: number;
  firstWalletId: string | null;
  firstAccountAddress: string | null;
  sessionExpiresAt: string | null;
  sessionJwt: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const noop = async () => undefined;

const defaultAccount: BondrTurnkeyAccount = {
  configured,
  clientReady: false,
  authenticated: false,
  clientState: configured ? 'loading' : 'not-configured',
  authState: 'unauthenticated',
  userId: null,
  userName: null,
  email: null,
  organizationId: null,
  walletCount: 0,
  firstWalletId: null,
  firstAccountAddress: null,
  sessionExpiresAt: null,
  sessionJwt: null,
  login: noop,
  logout: noop,
  refresh: noop
};

const TurnkeyAccountContext = createContext<BondrTurnkeyAccount>(defaultAccount);

type TurnkeyAuthSessionLike = {
  userId?: string;
  organizationId?: string;
  expiry?: number;
  token?: string;
  publicKey?: string;
};

type VerifiedTurnkeySession = Required<Pick<TurnkeyAuthSessionLike, 'userId' | 'organizationId'>> & Pick<TurnkeyAuthSessionLike, 'expiry' | 'token' | 'publicKey'>;

function normalizeVerifiedSession(session: TurnkeyAuthSessionLike | undefined): VerifiedTurnkeySession | null {
  if (!session?.userId || !session.organizationId) return null;
  if (typeof session.expiry === 'number' && session.expiry > 0 && session.expiry * 1000 <= Date.now()) return null;
  return {
    userId: session.userId,
    organizationId: session.organizationId,
    expiry: session.expiry,
    token: session.token,
    publicKey: session.publicKey
  };
}

function sessionExpiryIso(expiry: unknown) {
  if (typeof expiry === 'number' && Number.isFinite(expiry)) return new Date(expiry * 1000).toISOString();
  return maybeString(expiry);
}


function maybeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function configuredTurnkeyConfig(): TurnkeyProviderConfig {
  return {
    organizationId,
    authProxyConfigId,
    autoRefreshManagedState: true,
    ui: {
      darkMode: true,
      preferLargeActionButtons: true,
      borderRadius: 18,
      authModal: {
        methods: {
          emailOtpAuthEnabled: true,
          passkeyAuthEnabled: true,
          walletAuthEnabled: true,
          smsOtpAuthEnabled: false
        },
        methodOrder: ['email', 'passkey', 'wallet']
      }
    }
  };
}

function TurnkeyAccountBridge({ children, verifiedSession, clearVerifiedSession }: { children: ReactNode; verifiedSession: VerifiedTurnkeySession | null; clearVerifiedSession: () => void }) {
  const turnkey = useTurnkey();
  const clientReady = turnkey.clientState === ClientState.Ready;
  const session = turnkey.session as Record<string, unknown> | undefined;
  const sessionUserId = maybeString(session?.userId);
  const sessionOrganizationId = maybeString(session?.organizationId);
  const authenticated = turnkey.authState === AuthState.Authenticated || Boolean(sessionUserId && sessionOrganizationId) || Boolean(verifiedSession);
  const user = turnkey.user as Record<string, unknown> | undefined;
  const firstWallet = turnkey.wallets[0] as (typeof turnkey.wallets)[number] | undefined;
  const firstAccount = firstWallet?.accounts?.[0];

  const value = useMemo<BondrTurnkeyAccount>(() => ({
    configured: true,
    clientReady,
    authenticated,
    clientState: turnkey.clientState ?? 'loading',
    authState: turnkey.authState ?? 'unauthenticated',
    userId: maybeString(user?.userId) ?? maybeString(user?.id) ?? sessionUserId ?? verifiedSession?.userId ?? null,
    userName: maybeString(user?.userName) ?? maybeString(user?.name),
    email: maybeString(user?.email),
    organizationId: sessionOrganizationId ?? verifiedSession?.organizationId ?? organizationId,
    walletCount: turnkey.wallets.length,
    firstWalletId: firstWallet?.walletId ?? null,
    firstAccountAddress: firstAccount?.address ?? null,
    sessionExpiresAt: sessionExpiryIso(session?.expiry) ?? maybeString(session?.expiresAt) ?? sessionExpiryIso(verifiedSession?.expiry),
    sessionJwt: maybeString(session?.token) ?? maybeString(session?.jwt) ?? maybeString(session?.sessionJwt) ?? verifiedSession?.token ?? null,
    login: async () => {
      await turnkey.handleLogin({ title: 'Log in to Bond.Terminal' });
      await Promise.allSettled([turnkey.refreshUser(), turnkey.refreshWallets()]);
    },
    logout: async () => {
      clearVerifiedSession();
      sessionStorage.removeItem('bondr_verified_auth');
      await turnkey.logout();
    },
    refresh: async () => {
      await Promise.allSettled([turnkey.refreshUser(), turnkey.refreshWallets()]);
    }
  }), [authenticated, clearVerifiedSession, clientReady, firstAccount?.address, firstWallet?.walletId, session, sessionOrganizationId, sessionUserId, turnkey, user, verifiedSession]);

  return <TurnkeyAccountContext.Provider value={value}>{children}</TurnkeyAccountContext.Provider>;
}

export function TurnkeyAccountProvider({ children }: { children: ReactNode }) {
  const [verifiedSession, setVerifiedSession] = useState<VerifiedTurnkeySession | null>(null);

  if (!configured) {
    return <TurnkeyAccountContext.Provider value={defaultAccount}>{children}</TurnkeyAccountContext.Provider>;
  }

  return (
    <TurnkeyProvider
      config={configuredTurnkeyConfig()}
      callbacks={{
        onAuthenticationSuccess: ({ session }) => {
          const verified = normalizeVerifiedSession(session);
          if (!verified) return;
          setVerifiedSession(verified);
          sessionStorage.setItem('bondr_verified_auth', 'true');
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('bondr-turnkey-auth-success'));
          }, 0);
        },
        onError: (error) => console.error('Turnkey account error:', error)
      }}
    >
      <TurnkeyAccountBridge verifiedSession={verifiedSession} clearVerifiedSession={() => setVerifiedSession(null)}>{children}</TurnkeyAccountBridge>
    </TurnkeyProvider>
  );
}

export function useBondrTurnkeyAccount() {
  return useContext(TurnkeyAccountContext);
}
