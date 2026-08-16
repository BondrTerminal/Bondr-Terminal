'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthState, ClientState, TurnkeyProvider, type TurnkeyProviderConfig, useTurnkey } from '@turnkey/react-wallet-kit';

const organizationId = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID ?? process.env.NEXT_PUBLIC_ORGANIZATION_ID ?? '';
const authProxyConfigId = process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID ?? process.env.NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID ?? '';
const configured = Boolean(organizationId && authProxyConfigId);
const VERIFIED_AUTH_KEY = 'bondr_verified_auth';
const VERIFIED_AUTH_SESSION_KEY = 'bondr_verified_auth_session';
const VERIFIED_AUTH_METHOD_KEY = 'bondr_verified_auth_method';
const PENDING_LOGIN_KEY = 'bondr_pending_login';
const AUTH_SUCCESS_EVENT = 'bondr-turnkey-auth-success';

export type BondrTurnkeyAccount = {
  configured: boolean;
  clientReady: boolean;
  authenticated: boolean;
  authResolved: boolean;
  authHydrating: boolean;
  clientState: string;
  authState: string;
  userId: string | null;
  userName: string | null;
  email: string | null;
  organizationId: string | null;
  walletCount: number;
  walletProvidersCount: number;
  walletProviderNames: string[];
  walletProviderNamespaces: string[];
  firstWalletId: string | null;
  firstAccountAddress: string | null;
  authMethod: string | null;
  externalWalletAddress: string | null;
  externalWalletProvider: string | null;
  externalWalletChain: string | null;
  sessionExpiresAt: string | null;
  sessionJwt: string | null;
  debug: {
    lastEvent: string;
    callbackFired: boolean;
    callbackMethod: string | null;
    callbackAction: string | null;
    callbackHadSession: boolean;
    callbackHadUserOrg: boolean;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    hasTurnkeySession: boolean;
    hasSessionUserOrg: boolean;
    timeline: string[];
  };
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const noop = async () => undefined;

const defaultAccount: BondrTurnkeyAccount = {
  configured,
  clientReady: false,
  authenticated: false,
  authResolved: !configured,
  authHydrating: configured,
  clientState: configured ? 'loading' : 'not-configured',
  authState: 'unauthenticated',
  userId: null,
  userName: null,
  email: null,
  organizationId: null,
  walletCount: 0,
  walletProvidersCount: 0,
  walletProviderNames: [],
  walletProviderNamespaces: [],
  firstWalletId: null,
  firstAccountAddress: null,
  authMethod: null,
  externalWalletAddress: null,
  externalWalletProvider: null,
  externalWalletChain: null,
  sessionExpiresAt: null,
  sessionJwt: null,
  debug: {
    lastEvent: 'not-started',
    callbackFired: false,
    callbackMethod: null,
    callbackAction: null,
    callbackHadSession: false,
    callbackHadUserOrg: false,
    lastErrorCode: null,
    lastErrorMessage: null,
    hasTurnkeySession: false,
    hasSessionUserOrg: false,
    timeline: []
  },
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

type AuthDebugState = BondrTurnkeyAccount['debug'];

type VerifiedAuthMethod = {
  method: string | null;
  identifier: string | null;
  provider: string | null;
  chain: string | null;
};

const defaultDebugState: AuthDebugState = {
  lastEvent: 'not-started',
  callbackFired: false,
  callbackMethod: null,
  callbackAction: null,
  callbackHadSession: false,
  callbackHadUserOrg: false,
  lastErrorCode: null,
  lastErrorMessage: null,
  hasTurnkeySession: false,
  hasSessionUserOrg: false,
  timeline: []
};

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

function readStoredVerifiedSession(): VerifiedTurnkeySession | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(VERIFIED_AUTH_SESSION_KEY) ?? 'null') as TurnkeyAuthSessionLike | null;
    return normalizeVerifiedSession(parsed ?? undefined);
  } catch {
    sessionStorage.removeItem(VERIFIED_AUTH_SESSION_KEY);
    return null;
  }
}

function normalizeVerifiedAuthMethod(value: unknown): VerifiedAuthMethod | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    method: maybeString(record.method),
    identifier: maybeString(record.identifier),
    provider: maybeString(record.provider),
    chain: maybeString(record.chain)
  };
}

function readStoredVerifiedAuthMethod(): VerifiedAuthMethod | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeVerifiedAuthMethod(JSON.parse(sessionStorage.getItem(VERIFIED_AUTH_METHOD_KEY) ?? 'null'));
  } catch {
    sessionStorage.removeItem(VERIFIED_AUTH_METHOD_KEY);
    return null;
  }
}

function storeVerifiedAuthMethod(method: VerifiedAuthMethod) {
  sessionStorage.setItem(VERIFIED_AUTH_METHOD_KEY, JSON.stringify(method));
}

function storeVerifiedSession(session: VerifiedTurnkeySession) {
  sessionStorage.setItem(VERIFIED_AUTH_KEY, 'true');
  sessionStorage.setItem(VERIFIED_AUTH_SESSION_KEY, JSON.stringify({
    userId: session.userId,
    organizationId: session.organizationId,
    expiry: session.expiry,
    publicKey: session.publicKey
  }));
}

function clearStoredVerifiedSession() {
  sessionStorage.removeItem(VERIFIED_AUTH_KEY);
  sessionStorage.removeItem(VERIFIED_AUTH_SESSION_KEY);
  sessionStorage.removeItem(VERIFIED_AUTH_METHOD_KEY);
  sessionStorage.removeItem(PENDING_LOGIN_KEY);
}

function sessionExpiryIso(expiry: unknown) {
  if (typeof expiry === 'number' && Number.isFinite(expiry)) return new Date(expiry * 1000).toISOString();
  return maybeString(expiry);
}

function safeErrorMessage(value: unknown) {
  return value instanceof Error ? value.message.slice(0, 240) : 'Turnkey auth error';
}

function safeErrorCode(value: unknown) {
  if (typeof value === 'object' && value && 'code' in value) {
    const code = (value as { code?: unknown }).code;
    return typeof code === 'string' ? code.slice(0, 80) : null;
  }
  return null;
}

function addTimeline(current: AuthDebugState, event: string) {
  const stamp = new Date().toISOString().slice(11, 19);
  return [`${stamp} ${event}`, ...current.timeline].slice(0, 8);
}


function maybeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function inferExternalWalletChain(namespaces: string[]) {
  if (namespaces.includes('solana')) return 'solana';
  if (namespaces.includes('eip155') || namespaces.includes('ethereum')) return 'ethereum';
  return namespaces[0] ?? null;
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
          smsOtpAuthEnabled: false,
          walletAuthEnabled: true
        },
        methodOrder: ['email', 'passkey', 'wallet']
      }
    },
    walletConfig: {
      features: {
        auth: true,
        connecting: true
      },
      chains: {
        solana: {
          native: true
        },
        ethereum: {
          native: false
        }
      }
    }
  };
}

function TurnkeyAccountBridge({ children, verifiedSession, setVerifiedSession, verifiedAuthMethod, clearVerifiedSession, debug, setDebug }: { children: ReactNode; verifiedSession: VerifiedTurnkeySession | null; setVerifiedSession: (session: VerifiedTurnkeySession) => void; verifiedAuthMethod: VerifiedAuthMethod | null; clearVerifiedSession: () => void; debug: AuthDebugState; setDebug: (updater: (current: AuthDebugState) => AuthDebugState) => void }) {
  const turnkey = useTurnkey();
  const clientReady = turnkey.clientState === ClientState.Ready;
  const session = turnkey.session as Record<string, unknown> | undefined;
  const sessionUserId = maybeString(session?.userId);
  const sessionOrganizationId = maybeString(session?.organizationId);
  const authenticated = turnkey.authState === AuthState.Authenticated || Boolean(sessionUserId && sessionOrganizationId) || Boolean(verifiedSession);
  const authResolved = clientReady || authenticated || turnkey.authState === AuthState.Unauthenticated;
  const authHydrating = configured && !authenticated && !authResolved;
  const user = turnkey.user as Record<string, unknown> | undefined;
  const firstWallet = turnkey.wallets[0] as (typeof turnkey.wallets)[number] | undefined;
  const firstAccount = firstWallet?.accounts?.[0];
  const walletProviderNames = turnkey.walletProviders.map((provider) => provider.info.name).filter(Boolean).slice(0, 8);
  const walletProviderNamespaces = Array.from(new Set(turnkey.walletProviders.map((provider) => provider.chainInfo.namespace).filter(Boolean))).slice(0, 8);
  const authMethod = verifiedAuthMethod?.method ?? debug.callbackMethod ?? null;
  const externalWalletAddress = authMethod === 'wallet' ? verifiedAuthMethod?.identifier ?? null : null;
  const externalWalletProvider = authMethod === 'wallet' ? verifiedAuthMethod?.provider ?? walletProviderNames[0] ?? null : null;
  const externalWalletChain = authMethod === 'wallet' ? verifiedAuthMethod?.chain ?? inferExternalWalletChain(walletProviderNamespaces) : null;

  useEffect(() => {
    const verified = normalizeVerifiedSession(turnkey.session as TurnkeyAuthSessionLike | undefined);
    if (!verified) return;
    if (verifiedSession?.userId === verified.userId && verifiedSession.organizationId === verified.organizationId) return;
    setVerifiedSession(verified);
    setDebug((current) => ({ ...current, lastEvent: 'turnkey-session-observed', hasTurnkeySession: true, hasSessionUserOrg: true, timeline: addTimeline(current, 'session observed') }));
    storeVerifiedSession(verified);
    if (sessionStorage.getItem(PENDING_LOGIN_KEY) === 'true') {
      sessionStorage.removeItem(PENDING_LOGIN_KEY);
      window.dispatchEvent(new CustomEvent(AUTH_SUCCESS_EVENT));
    }
  }, [setDebug, setVerifiedSession, turnkey.session, verifiedSession?.organizationId, verifiedSession?.userId]);

  const value = useMemo<BondrTurnkeyAccount>(() => ({
    configured: true,
    clientReady,
    authenticated,
    authResolved,
    authHydrating,
    clientState: turnkey.clientState ?? 'loading',
    authState: turnkey.authState ?? 'unauthenticated',
    userId: maybeString(user?.userId) ?? maybeString(user?.id) ?? sessionUserId ?? verifiedSession?.userId ?? null,
    userName: maybeString(user?.userName) ?? maybeString(user?.name),
    email: maybeString(user?.email),
    organizationId: sessionOrganizationId ?? verifiedSession?.organizationId ?? organizationId,
    walletCount: turnkey.wallets.length,
    walletProvidersCount: turnkey.walletProviders.length,
    walletProviderNames,
    walletProviderNamespaces,
    firstWalletId: firstWallet?.walletId ?? null,
    firstAccountAddress: firstAccount?.address ?? null,
    authMethod,
    externalWalletAddress,
    externalWalletProvider,
    externalWalletChain,
    sessionExpiresAt: sessionExpiryIso(session?.expiry) ?? maybeString(session?.expiresAt) ?? sessionExpiryIso(verifiedSession?.expiry),
    sessionJwt: maybeString(session?.token) ?? maybeString(session?.jwt) ?? maybeString(session?.sessionJwt) ?? verifiedSession?.token ?? null,
    debug: {
      ...debug,
      hasTurnkeySession: Boolean(turnkey.session),
      hasSessionUserOrg: Boolean(sessionUserId && sessionOrganizationId)
    },
    login: async () => {
      sessionStorage.setItem(PENDING_LOGIN_KEY, 'true');
      setDebug((current) => ({ ...current, lastEvent: 'login-modal-opened', lastErrorCode: null, lastErrorMessage: null, timeline: addTimeline(current, 'login modal opened') }));
      await turnkey.handleLogin({ title: 'Log in to Bondr.terminal' });
      await Promise.allSettled([turnkey.refreshUser(), turnkey.refreshWallets()]);
    },
    logout: async () => {
      clearVerifiedSession();
      setDebug(() => ({ ...defaultDebugState, lastEvent: 'logout' }));
      clearStoredVerifiedSession();
      await turnkey.logout();
    },
    refresh: async () => {
      await Promise.allSettled([turnkey.refreshUser(), turnkey.refreshWallets()]);
    }
  }), [authMethod, authenticated, authHydrating, authResolved, clearVerifiedSession, clientReady, debug, externalWalletAddress, externalWalletChain, externalWalletProvider, firstAccount?.address, firstWallet?.walletId, session, sessionOrganizationId, sessionUserId, setDebug, turnkey, user, verifiedAuthMethod, verifiedSession, walletProviderNames, walletProviderNamespaces]);

  return <TurnkeyAccountContext.Provider value={value}>{children}</TurnkeyAccountContext.Provider>;
}

export function TurnkeyAccountProvider({ children }: { children: ReactNode }) {
  const turnkeyConfig = useMemo(() => configured ? configuredTurnkeyConfig() : null, []);
  const [verifiedSession, setVerifiedSession] = useState<VerifiedTurnkeySession | null>(() => readStoredVerifiedSession());
  const [verifiedAuthMethod, setVerifiedAuthMethod] = useState<VerifiedAuthMethod | null>(() => readStoredVerifiedAuthMethod());
  const [debug, setDebug] = useState<AuthDebugState>(defaultDebugState);

  if (!configured) {
    return <TurnkeyAccountContext.Provider value={defaultAccount}>{children}</TurnkeyAccountContext.Provider>;
  }

  return (
    <TurnkeyProvider
      config={turnkeyConfig!}
      callbacks={{
        onAuthenticationSuccess: ({ session, method, action, identifier }) => {
          const verified = normalizeVerifiedSession(session);
          const nextAuthMethod = {
            method: String(method),
            identifier: maybeString(identifier),
            provider: String(method) === 'wallet' ? 'external-wallet' : null,
            chain: String(method) === 'wallet' ? 'solana' : null
          };
          setVerifiedAuthMethod(nextAuthMethod);
          storeVerifiedAuthMethod(nextAuthMethod);
          setDebug((current) => ({
            ...current,
            lastEvent: verified ? 'authentication-success' : 'authentication-success-without-session',
            callbackFired: true,
            callbackMethod: String(method),
            callbackAction: String(action),
            callbackHadSession: Boolean(session),
            callbackHadUserOrg: Boolean(verified),
            lastErrorCode: null,
            lastErrorMessage: null,
            timeline: addTimeline(current, `auth success method=${String(method)} action=${String(action)} session=${String(Boolean(session))}`)
          }));
          if (!verified) return;
          setVerifiedSession(verified);
          storeVerifiedSession(verified);
          if (sessionStorage.getItem(PENDING_LOGIN_KEY) === 'true') {
            sessionStorage.removeItem(PENDING_LOGIN_KEY);
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent(AUTH_SUCCESS_EVENT));
            }, 0);
          }
        },
        onError: (error) => {
          setDebug((current) => ({
            ...current,
            lastEvent: 'turnkey-error',
            lastErrorCode: safeErrorCode(error),
            lastErrorMessage: safeErrorMessage(error),
            timeline: addTimeline(current, `error code=${safeErrorCode(error) ?? 'none'}`)
          }));
          console.error('Turnkey account error:', error);
        }
      }}
    >
      <TurnkeyAccountBridge verifiedSession={verifiedSession} setVerifiedSession={setVerifiedSession} verifiedAuthMethod={verifiedAuthMethod} clearVerifiedSession={() => { setVerifiedSession(null); setVerifiedAuthMethod(null); }} debug={debug} setDebug={setDebug}>{children}</TurnkeyAccountBridge>
    </TurnkeyProvider>
  );
}

export function useBondrTurnkeyAccount() {
  return useContext(TurnkeyAccountContext);
}
