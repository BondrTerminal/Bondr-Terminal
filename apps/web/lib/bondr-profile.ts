export type BondrStoredProfile = {
  userId: string;
  organizationId: string;
  userName: string;
  displayName: string;
  email?: string;
  avatarSeed: string;
  avatarGradient: string;
  bio?: string;
  preferredWalletLabel?: string;
  firstAccountAddress?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

const adjectives = ['scope', 'blue', 'vault', 'signal', 'ocean', 'royal', 'terminal', 'vector', 'cipher', 'orbit'];
const nouns = ['runner', 'operator', 'signer', 'maker', 'scalper', 'launcher', 'router', 'sentinel', 'pilot', 'builder'];
const gradients = [
  'linear-gradient(135deg, #00a9d6, #1947d2 58%, #ff7f11)',
  'linear-gradient(135deg, #1947d2, #02050b 55%, #00a9d6)',
  'linear-gradient(135deg, #ff7f11, #1947d2 64%, #02050b)',
  'linear-gradient(135deg, #23ce6b, #00a9d6 56%, #1947d2)',
  'linear-gradient(135deg, #f9ebe0, #00a9d6 42%, #1947d2)'
];

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fourDigits(hash: number): string {
  return String(hash % 10000).padStart(4, '0');
}

export function sanitizeProfileText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().replace(/\s+/g, ' ').slice(0, 160) || fallback;
}

export function defaultBondrProfile(input: {
  userId: string;
  organizationId: string;
  email?: string;
  firstAccountAddress?: string;
  now?: string;
}): BondrStoredProfile {
  const hash = hashString(`${input.organizationId}:${input.userId}`);
  const userName = `${adjectives[hash % adjectives.length]}-${nouns[(hash >>> 4) % nouns.length]}-${fourDigits(hash)}`;
  const now = input.now ?? new Date().toISOString();
  return {
    userId: input.userId,
    organizationId: input.organizationId,
    userName,
    displayName: userName,
    ...(input.email ? { email: input.email } : {}),
    avatarSeed: fourDigits(hash),
    avatarGradient: gradients[hash % gradients.length],
    ...(input.firstAccountAddress ? { firstAccountAddress: input.firstAccountAddress } : {}),
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now
  };
}

export function avatarInitials(profile: Pick<BondrStoredProfile, 'displayName' | 'userName'>): string {
  const source = profile.displayName || profile.userName || 'BONDR';
  const parts = source.split(/[-_\s]+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'B').slice(0, 2);
}
