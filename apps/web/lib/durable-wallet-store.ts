import { Pool } from 'pg';
import { getMeridianStore, type MeridianStore, type Wallet, type WalletActivity, type WalletGroup, type Project } from './meridian-store';
import { mutationMode } from './mutation-safety';

type JsonRow<T> = { payload: T };

const globalForWalletStore = globalThis as typeof globalThis & {
  __bondrWalletPool?: Pool;
  __bondrWalletSchemaReady?: Promise<void>;
};

function dbUrl() {
  return process.env.WALLET_STORE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
}

export function durableWalletStoreConfigured() {
  return Boolean(dbUrl());
}

export function walletStoreMode() {
  if (process.env.MUTATIONS_DISABLED === 'true') return 'disabled';
  if (durableWalletStoreConfigured()) return 'postgres';
  return mutationMode();
}

function pool() {
  const url = dbUrl();
  if (!url) return null;
  if (!globalForWalletStore.__bondrWalletPool) {
    globalForWalletStore.__bondrWalletPool = new Pool({ connectionString: url, max: 1, idleTimeoutMillis: 10_000 });
  }
  return globalForWalletStore.__bondrWalletPool;
}

async function ensureSchema() {
  const db = pool();
  if (!db) return;
  if (!globalForWalletStore.__bondrWalletSchemaReady) {
    globalForWalletStore.__bondrWalletSchemaReady = (async () => {
      await db.query(`create table if not exists meridian_wallet_groups (id text primary key, payload jsonb not null, updated_at timestamptz not null default now())`);
      await db.query(`create table if not exists meridian_wallet_records (id text primary key, address text not null unique, group_id text not null, payload jsonb not null, updated_at timestamptz not null default now())`);
      await db.query(`create index if not exists meridian_wallet_records_group_idx on meridian_wallet_records (group_id)`);
      await db.query(`create table if not exists meridian_wallet_activity (id text primary key, wallet_id text not null, payload jsonb not null, observed_at timestamptz not null default now())`);
      await db.query(`create index if not exists meridian_wallet_activity_observed_idx on meridian_wallet_activity (observed_at desc)`);
      await db.query(`create table if not exists meridian_project_records (id text primary key, payload jsonb not null, updated_at timestamptz not null default now())`);
      await db.query(`create table if not exists meridian_project_events (id text primary key, project_id text not null, payload jsonb not null, observed_at timestamptz not null default now())`);
      await db.query(`create index if not exists meridian_project_events_observed_idx on meridian_project_events (observed_at desc)`);
    })();
  }
  await globalForWalletStore.__bondrWalletSchemaReady;
}

async function seedGroups(base: MeridianStore) {
  const db = pool();
  if (!db) return;
  for (const group of base.walletGroups) {
    await db.query(
      `insert into meridian_wallet_groups (id, payload, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do nothing`,
      [group.id, JSON.stringify(group)]
    );
  }
}

export async function getMeridianWalletStore(): Promise<MeridianStore> {
  const base = getMeridianStore();
  const db = pool();
  if (!db) return base;
  await ensureSchema();
  await seedGroups(base);
  const [groupRows, walletRows, activityRows, projectRows, projectEventRows] = await Promise.all([
    db.query<JsonRow<WalletGroup>>(`select payload from meridian_wallet_groups order by id asc`),
    db.query<JsonRow<Wallet>>(`select payload from meridian_wallet_records order by updated_at desc, id asc`),
    db.query<JsonRow<WalletActivity>>(`select payload from meridian_wallet_activity order by observed_at desc limit 100`),
    db.query<JsonRow<Project>>(`select payload from meridian_project_records order by updated_at desc, id asc`),
    db.query<JsonRow<MeridianStore['eventLog'][number]>>(`select payload from meridian_project_events order by observed_at desc limit 100`)
  ]);
  const wallets = walletRows.rows.map((row) => row.payload);
  const projectMap = new Map(base.projects.map((project) => [project.id, project]));
  for (const row of projectRows.rows) projectMap.set(row.payload.id, row.payload);
  const projects = Array.from(projectMap.values());
  const walletGroups = groupRows.rows.map((row) => {
    const group = row.payload;
    const ids = new Set([...(group.walletIds ?? []), ...wallets.filter((wallet) => wallet.groupId === group.id).map((wallet) => wallet.id)]);
    return { ...group, walletIds: [...ids] };
  });
  return { ...base, projects, wallets, walletGroups, walletActivity: activityRows.rows.map((row) => row.payload), eventLog: [...projectEventRows.rows.map((row) => row.payload), ...base.eventLog.filter((event) => !projectEventRows.rows.some((row) => row.payload.id === event.id))] };
}

export async function insertDurableWallet(wallet: Wallet, group: WalletGroup, activity: WalletActivity) {
  const db = pool();
  if (!db) return false;
  await ensureSchema();
  const updatedGroup = { ...group, walletIds: [...new Set([...(group.walletIds ?? []), wallet.id])] };
  await db.query('begin');
  try {
    await db.query(
      `insert into meridian_wallet_groups (id, payload, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
      [updatedGroup.id, JSON.stringify(updatedGroup)]
    );
    await db.query(
      `insert into meridian_wallet_records (id, address, group_id, payload, updated_at) values ($1, $2, $3, $4::jsonb, now())`,
      [wallet.id, wallet.address, wallet.groupId, JSON.stringify(wallet)]
    );
    await db.query(
      `insert into meridian_wallet_activity (id, wallet_id, payload, observed_at) values ($1, $2, $3::jsonb, now())`,
      [activity.id, activity.walletId, JSON.stringify(activity)]
    );
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
  return true;
}

export async function updateDurableWallet(wallet: Wallet, groups: WalletGroup[], activities: WalletActivity[]) {
  const db = pool();
  if (!db) return false;
  await ensureSchema();
  await db.query('begin');
  try {
    for (const group of groups) {
      await db.query(
        `insert into meridian_wallet_groups (id, payload, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
        [group.id, JSON.stringify(group)]
      );
    }
    await db.query(
      `update meridian_wallet_records set group_id = $2, payload = $3::jsonb, updated_at = now() where id = $1`,
      [wallet.id, wallet.groupId, JSON.stringify(wallet)]
    );
    for (const item of activities) {
      await db.query(
        `insert into meridian_wallet_activity (id, wallet_id, payload, observed_at) values ($1, $2, $3::jsonb, now())`,
        [item.id, item.walletId, JSON.stringify(item)]
      );
    }
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
  return true;
}


export async function insertDurableProject(project: Project, event?: MeridianStore['eventLog'][number]) {
  const db = pool();
  if (!db) return false;
  await ensureSchema();
  await db.query('begin');
  try {
    await db.query(
      `insert into meridian_project_records (id, payload, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
      [project.id, JSON.stringify(project)]
    );
    if (event) {
      await db.query(
        `insert into meridian_project_events (id, project_id, payload, observed_at) values ($1, $2, $3::jsonb, now()) on conflict (id) do nothing`,
        [event.id, event.projectId, JSON.stringify(event)]
      );
    }
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
  return true;
}

export async function updateDurableProject(project: Project, event?: MeridianStore['eventLog'][number]) {
  return insertDurableProject(project, event);
}
