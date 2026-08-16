import { Pool } from 'pg';
import { defaultBondrProfile, type BondrStoredProfile } from './bondr-profile';

const globalForBondrProfiles = globalThis as typeof globalThis & {
  __bondrProfilePool?: Pool;
  __bondrProfileSchemaReady?: Promise<void>;
  __bondrProfileMemoryStore?: Map<string, BondrStoredProfile>;
};

type DbProfileRow = {
  user_id: string;
  organization_id: string;
  username: string;
  display_name: string;
  email: string | null;
  avatar_seed: string;
  avatar_gradient: string;
  bio: string | null;
  preferred_wallet_label: string | null;
  first_account_address: string | null;
  auth_method: string | null;
  external_wallet_address: string | null;
  external_wallet_provider: string | null;
  external_wallet_chain: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  last_seen_at: string | Date;
};

export function bondrProfileDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function profileKey(userId: string, organizationId: string) {
  return `${organizationId}:${userId}`;
}

function profilePool() {
  if (!bondrProfileDatabaseConfigured()) return null;
  if (!globalForBondrProfiles.__bondrProfilePool) {
    globalForBondrProfiles.__bondrProfilePool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false }
    });
  }
  return globalForBondrProfiles.__bondrProfilePool;
}

async function ensureProfileSchema() {
  const pool = profilePool();
  if (!pool) return;
  if (!globalForBondrProfiles.__bondrProfileSchemaReady) {
    globalForBondrProfiles.__bondrProfileSchemaReady = pool.query(`
      create table if not exists bondr_profiles (
        user_id text not null,
        organization_id text not null,
        username text not null,
        display_name text not null,
        email text,
        avatar_seed text not null,
        avatar_gradient text not null,
        bio text,
        preferred_wallet_label text,
        first_account_address text,
        auth_method text,
        external_wallet_address text,
        external_wallet_provider text,
        external_wallet_chain text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_seen_at timestamptz not null default now(),
        primary key (user_id, organization_id)
      );
      alter table bondr_profiles add column if not exists auth_method text;
      alter table bondr_profiles add column if not exists external_wallet_address text;
      alter table bondr_profiles add column if not exists external_wallet_provider text;
      alter table bondr_profiles add column if not exists external_wallet_chain text;
      create index if not exists bondr_profiles_updated_idx on bondr_profiles (updated_at desc);
      create index if not exists bondr_profiles_username_idx on bondr_profiles (lower(username));
    `).then(() => undefined);
  }
  await globalForBondrProfiles.__bondrProfileSchemaReady;
}

function fromDbRow(row: DbProfileRow): BondrStoredProfile {
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    userName: row.username,
    displayName: row.display_name,
    ...(row.email ? { email: row.email } : {}),
    avatarSeed: row.avatar_seed,
    avatarGradient: row.avatar_gradient,
    ...(row.bio ? { bio: row.bio } : {}),
    ...(row.preferred_wallet_label ? { preferredWalletLabel: row.preferred_wallet_label } : {}),
    ...(row.first_account_address ? { firstAccountAddress: row.first_account_address } : {}),
    ...(row.auth_method ? { authMethod: row.auth_method } : {}),
    ...(row.external_wallet_address ? { externalWalletAddress: row.external_wallet_address } : {}),
    ...(row.external_wallet_provider ? { externalWalletProvider: row.external_wallet_provider } : {}),
    ...(row.external_wallet_chain ? { externalWalletChain: row.external_wallet_chain } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString()
  };
}

function memoryStore() {
  globalForBondrProfiles.__bondrProfileMemoryStore ??= new Map<string, BondrStoredProfile>();
  return globalForBondrProfiles.__bondrProfileMemoryStore;
}

export function bondrProfileStorageMetadata() {
  return bondrProfileDatabaseConfigured()
    ? {
        storage: 'neon-postgres',
        storageDurability: 'durable',
        durableProfileDatabase: true,
        requiredEnv: ['DATABASE_URL'],
        requiredTable: 'bondr_profiles',
        note: 'BONDR profiles use server-side Postgres/Neon via DATABASE_URL.'
      }
    : {
        storage: 'memory',
        storageDurability: 'ephemeral-server-instance',
        durableProfileDatabase: false,
        requiredEnv: ['DATABASE_URL'],
        requiredTable: 'bondr_profiles',
        note: 'DATABASE_URL is not configured; profile persistence is process memory only.'
      };
}

export async function loadOrCreateBondrProfile(input: {
  userId: string;
  organizationId: string;
  email?: string;
  firstAccountAddress?: string;
  authMethod?: string;
  externalWalletAddress?: string;
  externalWalletProvider?: string;
  externalWalletChain?: string;
}) {
  const pool = profilePool();
  const now = new Date().toISOString();

  if (!pool) {
    const store = memoryStore();
    const key = profileKey(input.userId, input.organizationId);
    const existing = store.get(key);
    if (existing) {
      const profile = { ...existing, lastSeenAt: now, ...(input.email ? { email: input.email } : {}), ...(input.firstAccountAddress ? { firstAccountAddress: input.firstAccountAddress } : {}), ...(input.authMethod ? { authMethod: input.authMethod } : {}), ...(input.externalWalletAddress ? { externalWalletAddress: input.externalWalletAddress } : {}), ...(input.externalWalletProvider ? { externalWalletProvider: input.externalWalletProvider } : {}), ...(input.externalWalletChain ? { externalWalletChain: input.externalWalletChain } : {}) };
      store.set(key, profile);
      return { profile, created: false, ...bondrProfileStorageMetadata() };
    }
    const profile = defaultBondrProfile({ ...input, now });
    store.set(key, profile);
    return { profile, created: true, ...bondrProfileStorageMetadata() };
  }

  await ensureProfileSchema();
  const generated = defaultBondrProfile({ ...input, now });
  const result = await pool.query<DbProfileRow>(`
    insert into bondr_profiles (
      user_id, organization_id, username, display_name, email, avatar_seed, avatar_gradient,
      first_account_address, auth_method, external_wallet_address, external_wallet_provider,
      external_wallet_chain, created_at, updated_at, last_seen_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$13)
    on conflict (user_id, organization_id) do update set
      email = coalesce(excluded.email, bondr_profiles.email),
      first_account_address = coalesce(excluded.first_account_address, bondr_profiles.first_account_address),
      auth_method = coalesce(excluded.auth_method, bondr_profiles.auth_method),
      external_wallet_address = coalesce(excluded.external_wallet_address, bondr_profiles.external_wallet_address),
      external_wallet_provider = coalesce(excluded.external_wallet_provider, bondr_profiles.external_wallet_provider),
      external_wallet_chain = coalesce(excluded.external_wallet_chain, bondr_profiles.external_wallet_chain),
      last_seen_at = now()
    returning *;
  `, [generated.userId, generated.organizationId, generated.userName, generated.displayName, generated.email ?? null, generated.avatarSeed, generated.avatarGradient, generated.firstAccountAddress ?? null, generated.authMethod ?? null, generated.externalWalletAddress ?? null, generated.externalWalletProvider ?? null, generated.externalWalletChain ?? null, now]);

  return { profile: fromDbRow(result.rows[0]), created: result.rowCount === 1, ...bondrProfileStorageMetadata() };
}

export async function saveBondrProfile(profile: BondrStoredProfile) {
  const pool = profilePool();
  const now = new Date().toISOString();
  const next: BondrStoredProfile = { ...profile, updatedAt: now, lastSeenAt: now };

  if (!pool) {
    memoryStore().set(profileKey(next.userId, next.organizationId), next);
    return { profile: next, ...bondrProfileStorageMetadata() };
  }

  await ensureProfileSchema();
  const result = await pool.query<DbProfileRow>(`
    insert into bondr_profiles (
      user_id, organization_id, username, display_name, email, avatar_seed, avatar_gradient,
      bio, preferred_wallet_label, first_account_address, auth_method, external_wallet_address,
      external_wallet_provider, external_wallet_chain, created_at, updated_at, last_seen_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
    on conflict (user_id, organization_id) do update set
      username = excluded.username,
      display_name = excluded.display_name,
      email = excluded.email,
      avatar_seed = excluded.avatar_seed,
      avatar_gradient = excluded.avatar_gradient,
      bio = excluded.bio,
      preferred_wallet_label = excluded.preferred_wallet_label,
      first_account_address = coalesce(excluded.first_account_address, bondr_profiles.first_account_address),
      auth_method = coalesce(excluded.auth_method, bondr_profiles.auth_method),
      external_wallet_address = coalesce(excluded.external_wallet_address, bondr_profiles.external_wallet_address),
      external_wallet_provider = coalesce(excluded.external_wallet_provider, bondr_profiles.external_wallet_provider),
      external_wallet_chain = coalesce(excluded.external_wallet_chain, bondr_profiles.external_wallet_chain),
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at
    returning *;
  `, [next.userId, next.organizationId, next.userName, next.displayName, next.email ?? null, next.avatarSeed, next.avatarGradient, next.bio ?? null, next.preferredWalletLabel ?? null, next.firstAccountAddress ?? null, next.authMethod ?? null, next.externalWalletAddress ?? null, next.externalWalletProvider ?? null, next.externalWalletChain ?? null, next.createdAt, now]);

  return { profile: fromDbRow(result.rows[0]), ...bondrProfileStorageMetadata() };
}
