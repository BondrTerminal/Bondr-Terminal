'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
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

function TurnkeyAccountBridge({ children }: { children: ReactNode }) {
  const turnkey = useTurnkey();
  const clientReady = turnkey.clientState === ClientState.Ready;
  const authenticated = turnkey.authState === AuthState.Authenticated;
  const session = turnkey.session as Record<string, unknown> | undefined;
  const user = turnkey.user as Record<string, unknown> | undefined;
  const firstWallet = turnkey.wallets[0] as (typeof turnkey.wallets)[number] | undefined;
  const firstAccount = firstWallet?.accounts?.[0];

  const value = useMemo<BondrTurnkeyAccount>(() => ({
    configured: true,
    clientReady,
    authenticated,
    clientState: turnkey.clientState ?? 'loading',
    authState: turnkey.authState ?? 'unauthenticated',
    userId: maybeString(user?.userId),
    userName: maybeString(user?.userName),
    email: maybeString(user?.email),
    organizationId: maybeString(session?.organizationId) ?? organizationId,
    walletCount: turnkey.wallets.length,
    firstWalletId: firstWallet?.walletId ?? null,
    firstAccountAddress: firstAccount?.address ?? null,
    sessionExpiresAt: maybeString(session?.expiry) ?? maybeString(session?.expiresAt),
    sessionJwt: maybeString(session?.token) ?? maybeString(session?.jwt) ?? maybeString(session?.sessionJwt),
    login: async () => {
      await turnkey.handleLogin({ title: 'Log in to Bond.Terminal' });
      await Promise.allSettled([turnkey.refreshUser(), turnkey.refreshWallets()]);
    },
    logout: async () => {
      await turnkey.logout();
    },
    refresh: async () => {
      await Promise.allSettled([turnkey.refreshUser(), turnkey.refreshWallets()]);
    }
  }), [authenticated, clientReady, firstAccount?.address, firstWallet?.walletId, session, turnkey, user]);

  return <TurnkeyAccountContext.Provider value={value}>{children}</TurnkeyAccountContext.Provider>;
}

export function TurnkeyAccountProvider({ children }: { children: ReactNode }) {
  if (!configured) {
    return <TurnkeyAccountContext.Provider value={defaultAccount}>{children}</TurnkeyAccountContext.Provider>;
  }

  return (
    <TurnkeyProvider
      config={configuredTurnkeyConfig()}
      callbacks={{
        onError: (error) => console.error('Turnkey account error:', error)
      }}
    >
      <TurnkeyAccountBridge>{children}</TurnkeyAccountBridge>
    </TurnkeyProvider>
  );
}

export function useBondrTurnkeyAccount() {
  return useContext(TurnkeyAccountContext);
}
