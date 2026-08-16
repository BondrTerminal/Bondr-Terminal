'use client';

const ACTIVE_SUBJECT_KEY = 'bondr.activeSubject';
const LEGACY_ACTIVE_WALLET_KEY = 'bondr.activeWallet';
const ACTIVE_WALLET_BASE_KEY = 'bondr.activeWallet';
const CLIENT_MINT_BASE_KEY = 'bondr.clientMintPublicKey';
const WALLET_RAIL_DRAFT_BASE_KEY = 'bondr.walletRailDraft';

export function profileSubjectKey(input: { userId?: string | null; organizationId?: string | null }) {
  const userId = input.userId?.trim();
  const organizationId = input.organizationId?.trim();
  return userId && organizationId ? `${organizationId}:${userId}` : null;
}

export function getActiveProfileSubject() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(ACTIVE_SUBJECT_KEY) || null;
}

export function setActiveProfileSubject(subject: string | null) {
  if (typeof window === 'undefined') return;
  const previous = getActiveProfileSubject();
  if (previous === subject) return;
  if (subject) window.sessionStorage.setItem(ACTIVE_SUBJECT_KEY, subject);
  else window.sessionStorage.removeItem(ACTIVE_SUBJECT_KEY);
  clearLegacyProfileState();
  window.dispatchEvent(new CustomEvent('bondr-profile-subject-changed', { detail: { previous, subject } }));
  window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address: '', subject } }));
}

export function clearLegacyProfileState() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LEGACY_ACTIVE_WALLET_KEY);
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key) continue;
      if ((key.startsWith(`${CLIENT_MINT_BASE_KEY}.`) || key.startsWith(`${WALLET_RAIL_DRAFT_BASE_KEY}.`)) && !key.includes(':')) {
        storage.removeItem(key);
      }
    }
  }
}

function scopedKeyForSubject(base: string, subject: string | null, suffix?: string | null) {
  if (!subject) return null;
  return suffix ? `${base}.${subject}.${suffix}` : `${base}.${subject}`;
}

function scopedKey(base: string, suffix?: string | null) {
  return scopedKeyForSubject(base, getActiveProfileSubject(), suffix);
}

export function getProfileScopedActiveWallet() {
  if (typeof window === 'undefined') return '';
  const key = scopedKey(ACTIVE_WALLET_BASE_KEY);
  return key ? window.localStorage.getItem(key) ?? '' : '';
}

export function setProfileScopedActiveWallet(address: string, subjectOverride?: string | null) {
  if (typeof window === 'undefined') return;
  const subject = subjectOverride ?? getActiveProfileSubject();
  const key = scopedKeyForSubject(ACTIVE_WALLET_BASE_KEY, subject);
  if (!key) return;
  const next = address.trim();
  if (next) window.localStorage.setItem(key, next);
  else window.localStorage.removeItem(key);
  window.localStorage.removeItem(LEGACY_ACTIVE_WALLET_KEY);
  window.dispatchEvent(new CustomEvent('bondr-active-wallet-changed', { detail: { address: next, subject } }));
}

export function getProfileScopedClientMint(projectId: string) {
  if (typeof window === 'undefined') return '';
  const key = scopedKey(CLIENT_MINT_BASE_KEY, projectId);
  return key ? window.sessionStorage.getItem(key) ?? '' : '';
}

export function setProfileScopedClientMint(projectId: string, publicKey: string) {
  if (typeof window === 'undefined') return;
  const key = scopedKey(CLIENT_MINT_BASE_KEY, projectId);
  if (!key) return;
  const next = publicKey.trim();
  if (next) window.sessionStorage.setItem(key, next);
  else window.sessionStorage.removeItem(key);
}

export function getProfileScopedWalletRailDraft(projectId: string) {
  if (typeof window === 'undefined') return null;
  const key = scopedKey(WALLET_RAIL_DRAFT_BASE_KEY, projectId || 'global');
  return key ? window.localStorage.getItem(key) : null;
}

export function setProfileScopedWalletRailDraft(projectId: string, value: string) {
  if (typeof window === 'undefined') return;
  const key = scopedKey(WALLET_RAIL_DRAFT_BASE_KEY, projectId || 'global');
  if (!key) return;
  window.localStorage.setItem(key, value);
}
