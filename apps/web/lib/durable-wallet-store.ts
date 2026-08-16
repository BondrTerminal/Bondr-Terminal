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

function emptyMeridianStore(): MeridianStore {
  return {
    projects: [],
    wallets: [],
    walletGroups: [],
    flowEvents: [],
    eventLog: [],
    walletActivity: []
  };
}

function baseMeridianStoreForMode(mode: 'postgres' | 'local'): MeridianStore {
  try {
    return getMeridianStore();
  } catch (error) {
    if (mode === 'postgres') return emptyMeridianStore();
    throw error;
  }
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

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeWalletRecord(wallet: Wallet, index = 0): Wallet {
  const raw = wallet as Partial<Wallet>;
  const id = stringValue(raw.id, `wallet-${index + 1}`);
  return {
    ...raw,
    id,
    role: stringValue(raw.role, index === 0 ? 'dev wallet' : 'watch-only wallet'),
    address: stringValue(raw.address),
    scope: raw.scope === 'project' ? 'project' : 'global',
    groupId: stringValue(raw.groupId),
    status: stringValue(raw.status, 'active'),
    balanceSol: numberValue(raw.balanceSol),
    purpose: stringValue(raw.purpose, 'operator wallet'),
    archived: raw.archived === true,
    custodyMode: raw.custodyMode === 'managed-local' ? 'managed-local' : 'watch-only'
  } as Wallet;
}

function defaultModuleLinks(projectId: string): Project['moduleLinks'] {
  const encoded = encodeURIComponent(projectId);
  return {
    deployment: `/deployment?project=${encoded}`,
    wallets: `/portfolio?view=wallets&project=${encoded}`,
    sniper: `/sniper?project=${encoded}`,
    dashboard: `/project-dashboard?project=${encoded}`,
    liquidity: `/liquidity?project=${encoded}`
  };
}

function defaultMonitor(): Project['monitor'] {
  return { holders: [], orders: [], positions: [], topTraders: [], devTokens: [] };
}

function normalizeMonitor(value: unknown): Project['monitor'] {
  const raw = recordValue(value);
  const fallback = defaultMonitor();
  return {
    holders: Array.isArray(raw.holders) ? raw.holders as Project['monitor']['holders'] : fallback.holders,
    orders: Array.isArray(raw.orders) ? raw.orders as Project['monitor']['orders'] : fallback.orders,
    positions: Array.isArray(raw.positions) ? raw.positions as Project['monitor']['positions'] : fallback.positions,
    topTraders: Array.isArray(raw.topTraders) ? raw.topTraders as Project['monitor']['topTraders'] : fallback.topTraders,
    devTokens: Array.isArray(raw.devTokens) ? raw.devTokens as Project['monitor']['devTokens'] : fallback.devTokens
  };
}

function normalizeProjectRecord(project: Project, index = 0): Project {
  const raw = project as Partial<Project>;
  const id = stringValue(raw.id, `project-${index + 1}`);
  const metadata = recordValue(raw.metadata);
  const ticker = stringValue(raw.ticker, stringValue(metadata.symbol, 'TKN'));
  const name = stringValue(raw.name, stringValue(metadata.name, ticker));
  const fundingPlan = recordValue(raw.fundingPlan);
  const deploymentState = recordValue(raw.deploymentState);
  const launchConfig = recordValue(raw.launchConfig);
  const launchReceipt = recordValue(raw.launchReceipt);
  const preLiveDryRun = recordValue(raw.preLiveDryRun);
  return {
    ...raw,
    id,
    name,
    ticker,
    status: raw.status ?? 'draft',
    launchPath: stringValue(raw.launchPath, 'unselected'),
    tokenMint: typeof raw.tokenMint === 'string' ? raw.tokenMint : null,
    pool: typeof raw.pool === 'string' ? raw.pool : null,
    metadata: {
      name: stringValue(metadata.name, name),
      symbol: stringValue(metadata.symbol, ticker),
      description: stringValue(metadata.description),
      imageUrl: stringValue(metadata.imageUrl),
      metadataUri: typeof metadata.metadataUri === 'string' ? metadata.metadataUri : undefined,
      imageDataUrl: typeof metadata.imageDataUrl === 'string' ? metadata.imageDataUrl : undefined,
      imageContentType: typeof metadata.imageContentType === 'string' ? metadata.imageContentType : undefined,
      imageUpdatedAt: typeof metadata.imageUpdatedAt === 'string' ? metadata.imageUpdatedAt : undefined,
      website: stringValue(metadata.website),
      twitter: stringValue(metadata.twitter),
      telegram: stringValue(metadata.telegram)
    },
    walletGroupId: stringValue(raw.walletGroupId, 'operator-wallets'),
    fundingPlan: {
      budgetSol: numberValue(fundingPlan.budgetSol),
      feeReserveSol: numberValue(fundingPlan.feeReserveSol),
      liquiditySol: numberValue(fundingPlan.liquiditySol),
      devBuySol: numberValue(fundingPlan.devBuySol),
      collectionWalletId: stringValue(fundingPlan.collectionWalletId)
    },
    launchConfig: Object.keys(launchConfig).length ? launchConfig as Project['launchConfig'] : undefined,
    launchReceipt: typeof launchReceipt.status === 'string' && typeof launchReceipt.signature === 'string' ? launchReceipt as Project['launchReceipt'] : undefined,
    preLiveDryRun: typeof preLiveDryRun.status === 'string' ? preLiveDryRun as Project['preLiveDryRun'] : undefined,
    deploymentState: {
      stage: stringValue(deploymentState.stage, 'configuration'),
      ready: deploymentState.ready === true,
      disabledReason: stringValue(deploymentState.disabledReason, 'Deployment remains gated until project setup is complete and explicitly approved.')
    },
    monitor: normalizeMonitor(raw.monitor),
    moduleLinks: { ...defaultModuleLinks(id), ...recordValue(raw.moduleLinks) }
  } as Project;
}

function normalizeWalletGroupRecord(group: WalletGroup, index = 0): WalletGroup {
  const raw = group as Partial<WalletGroup>;
  const id = stringValue(raw.id, `group-${index + 1}`);
  return {
    id,
    name: stringValue(raw.name, id),
    scope: raw.scope === 'project' ? 'project' : 'global',
    walletIds: Array.isArray(raw.walletIds) ? raw.walletIds.filter((item): item is string => typeof item === 'string') : []
  };
}

export async function getMeridianWalletStore(): Promise<MeridianStore> {
  const db = pool();
  const base = baseMeridianStoreForMode(db ? 'postgres' : 'local');
  if (!db) return {
    ...base,
    projects: base.projects.map(normalizeProjectRecord),
    wallets: base.wallets.map(normalizeWalletRecord),
    walletGroups: base.walletGroups.map(normalizeWalletGroupRecord)
  };
  await ensureSchema();
  await seedGroups(base);
  const [groupRows, walletRows, activityRows, projectRows, projectEventRows] = await Promise.all([
    db.query<JsonRow<WalletGroup>>(`select payload from meridian_wallet_groups order by id asc`),
    db.query<JsonRow<Wallet>>(`select payload from meridian_wallet_records order by updated_at desc, id asc`),
    db.query<JsonRow<WalletActivity>>(`select payload from meridian_wallet_activity order by observed_at desc limit 100`),
    db.query<JsonRow<Project>>(`select payload from meridian_project_records order by updated_at desc, id asc`),
    db.query<JsonRow<MeridianStore['eventLog'][number]>>(`select payload from meridian_project_events order by observed_at desc limit 100`)
  ]);
  const wallets = walletRows.rows.map((row, index) => normalizeWalletRecord(row.payload, index));
  const projectMap = new Map(base.projects.map((project, index) => [project.id, normalizeProjectRecord(project, index)]));
  for (const [index, row] of projectRows.rows.entries()) {
    const project = normalizeProjectRecord(row.payload, index);
    projectMap.set(project.id, project);
  }
  const projects = Array.from(projectMap.values()).map(normalizeProjectRecord);
  const walletGroups = groupRows.rows.map((row) => {
    const group = normalizeWalletGroupRecord(row.payload);
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
