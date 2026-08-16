import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeSessionJwt } from '../apps/web/lib/turnkey-session-auth';

const providerSource = readFileSync(new URL('../apps/web/app/components/TurnkeyAccountProvider.tsx', import.meta.url), 'utf8');
const profileRouteSource = readFileSync(new URL('../apps/web/app/api/account/profile/route.ts', import.meta.url), 'utf8');
const profileStoreSource = readFileSync(new URL('../apps/web/lib/bondr-profile-store.ts', import.meta.url), 'utf8');
const profileUiSource = readFileSync(new URL('../apps/web/app/profile/components/TurnkeyProfileLogin.tsx', import.meta.url), 'utf8');
const appErrorSource = readFileSync(new URL('../apps/web/app/error.tsx', import.meta.url), 'utf8');
const clientErrorReportSource = readFileSync(new URL('../apps/web/app/api/client-error-report/route.ts', import.meta.url), 'utf8');
const landingSource = readFileSync(new URL('../apps/web/app/components/BondrLandingPage.tsx', import.meta.url), 'utf8');
const readinessSource = readFileSync(new URL('../apps/web/app/api/account/readiness/route.ts', import.meta.url), 'utf8');
const envExampleSource = readFileSync(new URL('../apps/web/.env.example', import.meta.url), 'utf8');
const profileScopedStateSource = readFileSync(new URL('../apps/web/lib/profile-scoped-browser-state.ts', import.meta.url), 'utf8');
const headerWalletChipSource = readFileSync(new URL('../apps/web/app/components/HeaderWalletChip.tsx', import.meta.url), 'utf8');
const platformShellSource = readFileSync(new URL('../apps/web/app/components/BondrPlatformShell.tsx', import.meta.url), 'utf8');
const accountNavButtonSource = readFileSync(new URL('../apps/web/app/components/AccountNavButton.tsx', import.meta.url), 'utf8');
const walletRailStatusSource = readFileSync(new URL('../apps/web/app/components/WalletRailStatus.tsx', import.meta.url), 'utf8');
const walletBoardSource = readFileSync(new URL('../apps/web/app/wallets/components/WalletBoardActions.tsx', import.meta.url), 'utf8');
const executionDockSource = readFileSync(new URL('../apps/web/app/sniper/components/ExecutionDock.tsx', import.meta.url), 'utf8');
const walletSelectionDeskSource = readFileSync(new URL('../apps/web/app/sniper/components/WalletSelectionDesk.tsx', import.meta.url), 'utf8');
const createProjectLauncherSource = readFileSync(new URL('../apps/web/app/components/CreateProjectLauncher.tsx', import.meta.url), 'utf8');
const launchConfigEditorSource = readFileSync(new URL('../apps/web/app/deployment/components/LaunchConfigEditor.tsx', import.meta.url), 'utf8');
const deploymentBuilderSource = readFileSync(new URL('../apps/web/app/deployment/components/DeploymentLaunchBuilderPanel.tsx', import.meta.url), 'utf8');

function fakeJwt(payload: Record<string, unknown>) {
  const encode = (value: Record<string, unknown> | string) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256', typ: 'JWT' })}.${encode(payload)}.${encode('signature')}`;
}

test('Turnkey provider exposes Solana wallet auth as an identity login method', () => {
  assert.match(providerSource, /walletAuthEnabled:\s*true/);
  assert.match(providerSource, /methodOrder:\s*\['email', 'passkey', 'wallet'\]/);
  assert.match(providerSource, /walletConfig:\s*\{/);
  assert.match(providerSource, /auth:\s*true/);
  assert.match(providerSource, /function selectTurnkeyOrganizationId/);
  assert.match(providerSource, /solana:\s*\{\s*native:\s*true/s);
  assert.match(providerSource, /ethereum:\s*\{\s*native:\s*true/s);
  assert.match(providerSource, /walletConnectNamespaces:\s*\[\]/);
  assert.match(providerSource, /loginWithExternalWallet/);
  assert.match(providerSource, /loginWithExternalWallet:\s*async\s*\(preferredChain = 'solana'\)/);
  assert.match(providerSource, /const loadedProviders = turnkey\.walletProviders as TurnkeyWalletProviderLike\[\]/);
  assert.match(providerSource, /fetchWalletProviders\(preferredChain as never\)/);
  assert.doesNotMatch(providerSource, /loginOrSignupWithWallet\(/);
  assert.match(providerSource, /function isTurnkeyCredentialConflict/);
  assert.match(providerSource, /loginWithWallet\(\{ walletProvider: selectedProvider as never \}\)/);
  assert.match(providerSource, /Clean up the duplicate wallet-auth suborgs in the Turnkey dashboard/);
  assert.match(providerSource, /Wallet login is restricted to an existing BONDR Turnkey account/);
  assert.match(providerSource, /Unknown wallets cannot create a new operator profile/);
  assert.match(providerSource, /function walletAuthConfigError/);
  assert.match(providerSource, /64-character API public key where the parent organization ID is required/);
  assert.match(providerSource, /sessionFromJwt\(result\.sessionToken\)/);
  assert.match(providerSource, /wallet-login-session-stored/);
  assert.match(providerSource, /wallet-login-missing-session-token/);
  assert.match(providerSource, /token:\s*session\.token/);
  assert.match(providerSource, /activateVerifiedSubject\(verified,\s*result\.address \?\? nextAuthMethod\.identifier\)/);
  assert.match(providerSource, /externalWalletAddress/);
  assert.match(providerSource, /onAuthenticationSuccess:\s*\(\{ session, method, action, identifier \}\)/);
});

test('verified BONDR profiles persist external wallet auth metadata separately from execution signing', () => {
  assert.match(profileRouteSource, /authMethod:\s*z\.string\(\)\.min\(1\)\.max\(40\)\.optional\(\)/);
  assert.match(profileRouteSource, /externalWalletAddress:\s*z\.string\(\)\.min\(20\)\.max\(160\)\.optional\(\)/);
  assert.match(profileRouteSource, /externalWalletProvider/);
  assert.match(profileRouteSource, /externalWalletChain/);
  assert.match(profileStoreSource, /external_wallet_address text/);
  assert.match(profileStoreSource, /alter table bondr_profiles add column if not exists external_wallet_address text/);
  assert.match(profileStoreSource, /auth_method = coalesce\(excluded\.auth_method, bondr_profiles\.auth_method\)/);
});

test('Turnkey session JWT decoding accepts signed-in user claim naming variants', () => {
  const expiry = Math.floor(Date.now() / 1000) + 600;
  assert.deepEqual(decodeSessionJwt(fakeJwt({
    exp: expiry,
    public_key: 'pub-snake',
    session_type: 'SESSION_TYPE_READ_ONLY',
    user_id: 'user-snake',
    organization_id: 'org-snake'
  })), {
    expiry,
    publicKey: 'pub-snake',
    sessionType: 'SESSION_TYPE_READ_ONLY',
    userId: 'user-snake',
    organizationId: 'org-snake'
  });

  assert.deepEqual(decodeSessionJwt(fakeJwt({
    exp: expiry,
    publicKey: 'pub-camel',
    sessionType: 'SESSION_TYPE_READ_WRITE',
    userId: 'user-camel',
    organizationId: 'org-camel'
  })), {
    expiry,
    publicKey: 'pub-camel',
    sessionType: 'SESSION_TYPE_READ_WRITE',
    userId: 'user-camel',
    organizationId: 'org-camel'
  });
});

test('profile UI and readiness describe wallet auth as identity-only', () => {
  assert.match(profileUiSource, /Log in with Turnkey/);
  assert.match(profileUiSource, /Log in with Solana wallet/);
  assert.match(profileUiSource, /Looking for a Solana wallet through Turnkey/);
  assert.match(landingSource, /continueWithWallet\(chain: 'solana' \| 'ethereum'\)/);
  assert.match(landingSource, /Solana wallet/);
  assert.match(landingSource, /EVM wallet/);
  assert.match(landingSource, /account\.debug\.lastErrorMessage/);
  assert.doesNotMatch(landingSource, /async function continueWithWallet[\s\S]*await waitForModalUnmount\(\);/);
  assert.match(profileUiSource, /wallet login is restricted to wallets already bound to this operator account/);
  assert.match(profileUiSource, /Unknown wallets fail closed and cannot create a new BONDR operator profile/);
  assert.match(profileUiSource, /Turnkey debug:/);
  assert.match(profileUiSource, /External wallet/);
  assert.match(profileUiSource, /Turnkey auth audit/);
  assert.match(profileUiSource, /Audit verdict/);
  assert.match(profileUiSource, /Expected subject/);
  assert.match(profileUiSource, /Active subject/);
  assert.match(profileUiSource, /Scoped active wallet/);
  assert.match(profileUiSource, /Browser signer/);
  assert.match(profileUiSource, /subject mismatch/);
  assert.match(profileUiSource, /active wallet mismatch/);
  assert.match(profileUiSource, /browser signer mismatch/);
  assert.match(profileUiSource, /getActiveProfileSubject/);
  assert.match(profileUiSource, /getProfileScopedActiveWallet/);
  assert.match(readinessSource, /externalWalletAuth:\s*'enabled-in-client-config'/);
  assert.match(readinessSource, /wallet-auth-proves-identity-only/);
  assert.match(readinessSource, /walletAuthChains:\s*\['solana', 'ethereum'\]/);
  assert.match(envExampleSource, /Wallet auth is enabled client-side for Solana and injected EVM wallets/);
  assert.match(envExampleSource, /Transaction signing still requires explicit browser review/);
});

test('route error boundary fails closed with profile audit recovery', () => {
  assert.match(appErrorSource, /'use client'/);
  assert.match(appErrorSource, /BONDR route error/);
  assert.match(appErrorSource, /This view failed closed/);
  assert.match(appErrorSource, /Your identity and wallet state were not changed by this screen/);
  assert.match(appErrorSource, /Error digest/);
  assert.match(appErrorSource, /Route/);
  assert.match(appErrorSource, /Error type/);
  assert.match(appErrorSource, /\/api\/client-error-report/);
  assert.match(appErrorSource, /collectDiagnostics/);
  assert.match(appErrorSource, /storageSnapshot/);
  assert.match(appErrorSource, /bondr_verified_auth_session/);
  assert.match(appErrorSource, /cookieNames/);
  assert.match(appErrorSource, /Open Profile Audit/);
  assert.match(appErrorSource, /href="\/profile"/);
  assert.match(clientErrorReportSource, /BONDR client route error report/);
  assert.match(clientErrorReportSource, /diagnostics:\s*z\.record/);
  assert.match(clientErrorReportSource, /cleanDiagnosticValue/);
  assert.match(clientErrorReportSource, /Bearer \[redacted\]/);
  assert.match(clientErrorReportSource, /token\|jwt\|secret\|private\|seed\|password\|authorization\|bearer/i);
  assert.match(clientErrorReportSource, /invalid-error-report/);
});

test('authenticated shell navigation uses document loads after Turnkey subject changes', () => {
  assert.doesNotMatch(platformShellSource, /from 'next\/link'/);
  assert.doesNotMatch(platformShellSource, /useRouter/);
  assert.doesNotMatch(accountNavButtonSource, /from 'next\/link'/);
  assert.doesNotMatch(headerWalletChipSource, /from 'next\/link'/);
  assert.doesNotMatch(platformShellSource, /router\.replace/);
  assert.doesNotMatch(platformShellSource, /router\.push/);
  assert.doesNotMatch(platformShellSource, /sessionStorage\.setItem\(NEXT_KEY, '\/'\)/);
  assert.match(platformShellSource, /window\.location\.replace\(next\)/);
  assert.match(platformShellSource, /resolveStoredNextPath\('\/'\) \?\? '\/'/);
  assert.match(platformShellSource, /<a className="bondrWordmark" href="\/"/);
  assert.match(platformShellSource, /<a key=\{item\.href\} href=\{item\.href\}>/);
  assert.match(accountNavButtonSource, /<a href="\/profile">Profile<\/a>/);
  assert.match(headerWalletChipSource, /href="\/portfolio\?view=wallets"/);
});

test('profile-scoped browser wallet state prevents cross-profile active wallet leakage', () => {
  assert.match(profileScopedStateSource, /const ACTIVE_SUBJECT_KEY = 'bondr\.activeSubject'/);
  assert.match(profileScopedStateSource, /profileSubjectKey/);
  assert.match(profileScopedStateSource, /setActiveProfileSubject/);
  assert.match(profileScopedStateSource, /clearLegacyProfileState/);
  assert.match(profileScopedStateSource, /window\.localStorage\.removeItem\(LEGACY_ACTIVE_WALLET_KEY\)/);
  assert.match(profileScopedStateSource, /bondr-profile-subject-changed/);
  assert.match(profileScopedStateSource, /bondr-active-wallet-changed/);
  assert.match(profileScopedStateSource, /function scopedKeyForSubject/);
  assert.match(profileScopedStateSource, /\$\{base\}\.\$\{subject\}/);
  assert.match(profileScopedStateSource, /setProfileScopedActiveWallet\(address: string, subjectOverride\?: string \| null\)/);

  for (const [label, source] of [
    ['HeaderWalletChip', headerWalletChipSource],
    ['WalletRailStatus', walletRailStatusSource],
    ['WalletBoardActions', walletBoardSource],
    ['ExecutionDock', executionDockSource],
    ['WalletSelectionDesk', walletSelectionDeskSource],
    ['CreateProjectLauncher', createProjectLauncherSource],
    ['LaunchConfigEditor', launchConfigEditorSource]
  ] as const) {
    assert.match(source, /getProfileScopedActiveWallet/, `${label} must read active wallet through profile scope`);
    assert.doesNotMatch(source, /localStorage\.getItem\('bondr\.activeWallet'\)/, `${label} must not read the legacy global active wallet`);
  }

  for (const [label, source] of [
    ['WalletRailStatus', walletRailStatusSource],
    ['WalletBoardActions', walletBoardSource],
    ['ExecutionDock', executionDockSource],
    ['WalletSelectionDesk', walletSelectionDeskSource],
    ['LaunchConfigEditor', launchConfigEditorSource],
    ['DeploymentLaunchBuilderPanel', deploymentBuilderSource]
  ] as const) {
    assert.match(source, /bondr-profile-subject-changed/, `${label} must react to Turnkey subject changes`);
  }

  assert.match(deploymentBuilderSource, /providerSigner !== connectedSigner/);
  assert.match(deploymentBuilderSource, /const expectedSigner = pumpPortalBuild\.result\.intent\?\.expectedSigner/);
  assert.match(deploymentBuilderSource, /!expectedSigner/);
  assert.match(deploymentBuilderSource, /providerSigner !== expectedSigner/);
  assert.match(deploymentBuilderSource, /Browser signer proof is stale or mismatched/);
});
