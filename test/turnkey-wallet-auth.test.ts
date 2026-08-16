import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const providerSource = readFileSync(new URL('../apps/web/app/components/TurnkeyAccountProvider.tsx', import.meta.url), 'utf8');
const profileRouteSource = readFileSync(new URL('../apps/web/app/api/account/profile/route.ts', import.meta.url), 'utf8');
const profileStoreSource = readFileSync(new URL('../apps/web/lib/bondr-profile-store.ts', import.meta.url), 'utf8');
const profileUiSource = readFileSync(new URL('../apps/web/app/profile/components/TurnkeyProfileLogin.tsx', import.meta.url), 'utf8');
const landingSource = readFileSync(new URL('../apps/web/app/components/BondrLandingPage.tsx', import.meta.url), 'utf8');
const readinessSource = readFileSync(new URL('../apps/web/app/api/account/readiness/route.ts', import.meta.url), 'utf8');
const envExampleSource = readFileSync(new URL('../apps/web/.env.example', import.meta.url), 'utf8');

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
  assert.match(providerSource, /loginOrSignupWithWallet\(\{\s*walletProvider: selectedProvider as never,\s*createSubOrgParams: walletAuthCreateSubOrgParams\(selectedProvider, preferredChain\) as never/s);
  assert.match(providerSource, /function isTurnkeyCredentialConflict/);
  assert.match(providerSource, /wallet-login-credential-conflict-retry/);
  assert.match(providerSource, /loginWithWallet\(\{ walletProvider: selectedProvider as never \}\)/);
  assert.match(providerSource, /Clean up the duplicate wallet-auth suborgs in the Turnkey dashboard/);
  assert.match(providerSource, /function walletAuthCreateSubOrgParams/);
  assert.match(providerSource, /function walletAuthConfigError/);
  assert.match(providerSource, /64-character API public key where the parent organization ID is required/);
  assert.match(providerSource, /sessionFromJwt\(result\.sessionToken\)/);
  assert.match(providerSource, /wallet-login-session-stored/);
  assert.match(providerSource, /wallet-login-missing-session-token/);
  assert.match(providerSource, /token:\s*session\.token/);
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

test('profile UI and readiness describe wallet auth as identity-only', () => {
  assert.match(profileUiSource, /Log in with Turnkey/);
  assert.match(profileUiSource, /Log in with Solana wallet/);
  assert.match(profileUiSource, /Looking for a Solana wallet through Turnkey/);
  assert.match(landingSource, /continueWithWallet\(chain: 'solana' \| 'ethereum'\)/);
  assert.match(landingSource, /Solana wallet/);
  assert.match(landingSource, /EVM wallet/);
  assert.match(landingSource, /account\.debug\.lastErrorMessage/);
  assert.doesNotMatch(landingSource, /async function continueWithWallet[\s\S]*await waitForModalUnmount\(\);/);
  assert.match(profileUiSource, /Choose wallet to authenticate with Phantom\/Solflare/);
  assert.match(profileUiSource, /Turnkey debug:/);
  assert.match(profileUiSource, /External wallet/);
  assert.match(readinessSource, /externalWalletAuth:\s*'enabled-in-client-config'/);
  assert.match(readinessSource, /wallet-auth-proves-identity-only/);
  assert.match(readinessSource, /walletAuthChains:\s*\['solana', 'ethereum'\]/);
  assert.match(envExampleSource, /Wallet auth is enabled client-side for Solana and injected EVM wallets/);
  assert.match(envExampleSource, /Transaction signing still requires explicit browser review/);
});
