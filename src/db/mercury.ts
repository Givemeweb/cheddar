import { getStore, isDatabaseReady, saveStore } from './tinybase';

/**
 * Local persistence for the Mercury bank connection: one connection row, the
 * linked accounts, the transaction links (the dedupe map), the per-account
 * sync cursors, and the sync debounce timestamp.
 *
 * Every write goes through the helpers below, which build rows from a fixed
 * cell list. That whitelist is what keeps the API token out of the local
 * database (it lives only in secure storage, ticket 03) and therefore out of
 * every backup.
 *
 * Flags are stored as 'true'/'false' strings, not real booleans: the SQLite
 * persister and the SQL backup round-trip are proven for strings, numbers and
 * nulls (no existing table stores booleans), so the helpers convert at the
 * boundary.
 */

export const MERCURY_CONNECTION_TABLE = 'mercuryConnection';
export const MERCURY_ACCOUNTS_TABLE = 'mercuryAccounts';
export const MERCURY_TRANSACTION_LINKS_TABLE = 'mercuryTransactionLinks';
export const MERCURY_CURSORS_TABLE = 'mercuryCursors';
export const MERCURY_SYNC_STATE_TABLE = 'mercurySyncState';

/** One connection per install; the row id is fixed. */
export const MERCURY_CONNECTION_ROW_ID = 'default';
export const MERCURY_DEBOUNCE_ROW_ID = 'debounce';

/** Linked accounts are always USD: Mercury reports no currency field. */
export const MERCURY_ACCOUNT_CURRENCY = 'USD';

export type MercuryTokenStatus = 'active' | 'needs_reauth';

export interface MercuryConnection {
  id: string;
  tokenStatus: MercuryTokenStatus;
  createdAt: number | null;
  lastSyncedAt: number | null;
}

export interface MercuryLinkedAccount {
  id: string; // Mercury account id
  localAccountId: string;
  enabled: boolean;
  currency: string;
  /** Account-level FX/anomaly flag: true when any imported row was flagged. */
  mixedCurrency: boolean;
  /** Backfill window in days (30/90/365); null means all history. */
  cursorWindowDays: number | null;
  lastSyncedAt: number | null;
  stale: boolean;
  lastError: string | null;
}

export interface MercuryTransactionLink {
  id: string; // Mercury transaction id
  localTransactionId: string;
  mercuryAccountId: string;
  /** Per-row FX/anomaly flag (reconnaissance rule 4). */
  anomaly: boolean;
  /**
   * Mercury's createdAt in epoch ms, the field the transactions endpoint's
   * `start` filter compares (the local row date is postedAt ?? createdAt and
   * can differ). Null when the payload had no usable createdAt (absent,
   * unparseable, or the Go zero-time sentinel); null links are spared by the
   * sync's deletion pass.
   */
  mercuryCreatedAtMs: number | null;
}

export interface MercuryCursor {
  id: string; // Mercury account id
  cursor: string | null;
}

type StoredCell = string | number | null;

const boolCell = (value: boolean): StoredCell => (value ? 'true' : 'false');
const cellBool = (value: unknown): boolean => value === 'true';
const cellNumber = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;
const cellString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

export async function upsertMercuryConnection(cells: {
  tokenStatus?: MercuryTokenStatus;
  createdAt?: number;
  lastSyncedAt?: number | null;
}): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  const current = store.getRow(MERCURY_CONNECTION_TABLE, MERCURY_CONNECTION_ROW_ID);
  store.setRow(MERCURY_CONNECTION_TABLE, MERCURY_CONNECTION_ROW_ID, {
    tokenStatus: cells.tokenStatus
      ?? ((current?.tokenStatus as MercuryTokenStatus) ?? 'active'),
    createdAt: cells.createdAt ?? cellNumber(current?.createdAt),
    lastSyncedAt: cells.lastSyncedAt !== undefined
      ? cells.lastSyncedAt
      : cellNumber(current?.lastSyncedAt),
  });
  await saveStore();
}

export function getMercuryConnection(): MercuryConnection | null {
  if (!isDatabaseReady()) return null;
  const row = getStore().getRow(MERCURY_CONNECTION_TABLE, MERCURY_CONNECTION_ROW_ID);
  // TinyBase getRow() returns a truthy {} for a missing row, so a row only
  // counts as present when it carries a tokenStatus cell: the one cell every
  // real write sets and every restore path overwrites.
  if (!row || row.tokenStatus === undefined) return null;
  return {
    id: MERCURY_CONNECTION_ROW_ID,
    tokenStatus: (row.tokenStatus as MercuryTokenStatus) ?? 'active',
    createdAt: cellNumber(row.createdAt),
    lastSyncedAt: cellNumber(row.lastSyncedAt),
  };
}

export async function markConnectionNeedsReauthentication(): Promise<void> {
  await upsertMercuryConnection({ tokenStatus: 'needs_reauth' });
}

export async function putMercuryLinkedAccount(account: MercuryLinkedAccount): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().setRow(MERCURY_ACCOUNTS_TABLE, account.id, {
    localAccountId: account.localAccountId,
    enabled: boolCell(account.enabled),
    currency: account.currency,
    mixedCurrency: boolCell(account.mixedCurrency),
    cursorWindowDays: account.cursorWindowDays,
    lastSyncedAt: account.lastSyncedAt,
    stale: boolCell(account.stale),
    lastError: account.lastError,
  });
  await saveStore();
}

export function getMercuryLinkedAccounts(): MercuryLinkedAccount[] {
  if (!isDatabaseReady()) return [];
  const table = getStore().getTable(MERCURY_ACCOUNTS_TABLE);
  if (!table) return [];
  return Object.entries(table).map(([id, row]) => ({
    id,
    localAccountId: (row.localAccountId as string) ?? '',
    enabled: cellBool(row.enabled),
    currency: (row.currency as string) ?? '',
    mixedCurrency: cellBool(row.mixedCurrency),
    cursorWindowDays: cellNumber(row.cursorWindowDays),
    lastSyncedAt: cellNumber(row.lastSyncedAt),
    stale: cellBool(row.stale),
    lastError: cellString(row.lastError),
  }));
}

export async function putMercuryTransactionLink(link: MercuryTransactionLink): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().setRow(MERCURY_TRANSACTION_LINKS_TABLE, link.id, {
    localTransactionId: link.localTransactionId,
    mercuryAccountId: link.mercuryAccountId,
    anomaly: boolCell(link.anomaly),
    mercuryCreatedAtMs: link.mercuryCreatedAtMs,
  });
  await saveStore();
}

/** Removes one link row; used to roll back a partially written import. */
export async function deleteMercuryTransactionLink(mercuryTransactionId: string): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().delRow(MERCURY_TRANSACTION_LINKS_TABLE, mercuryTransactionId);
  await saveStore();
}

export function getMercuryTransactionLinks(): MercuryTransactionLink[] {
  if (!isDatabaseReady()) return [];
  const table = getStore().getTable(MERCURY_TRANSACTION_LINKS_TABLE);
  if (!table) return [];
  return Object.entries(table).map(([id, row]) => ({
    id,
    localTransactionId: (row.localTransactionId as string) ?? '',
    mercuryAccountId: (row.mercuryAccountId as string) ?? '',
    anomaly: cellBool(row.anomaly),
    // A missing cell (pre-existing links from tickets 04/05, restored
    // backups) reads as null: the sync's deletion pass spares those links.
    mercuryCreatedAtMs: cellNumber(row.mercuryCreatedAtMs),
  }));
}

/**
 * Whether a local transaction was imported from Mercury, i.e. whether a
 * transaction-link row maps it (keyed by the local transaction id: link
 * rows carry the Mercury transaction id as their id, so this scans the
 * table). Used by the balance-isolation guards in src/db/storage.ts.
 */
export function hasMercuryImportedTransaction(localTransactionId: string): boolean {
  if (!isDatabaseReady() || !localTransactionId) return false;
  const links = getStore().getTable(MERCURY_TRANSACTION_LINKS_TABLE);
  if (!links) return false;
  return Object.values(links).some(
    (link) => (link.localTransactionId as string | undefined) === localTransactionId,
  );
}

/**
 * Local transaction ids whose Mercury link row carries the anomaly flag
 * (record rule 4: FX/anomaly rows stay out of balance totals and
 * reconciliation math until OQ-1 resolves). Read-model consumers call this
 * once and filter rows, rather than scanning the link table per row.
 */
export function getMercuryAnomalyTransactionIds(): Set<string> {
  if (!isDatabaseReady()) return new Set();
  const links = getStore().getTable(MERCURY_TRANSACTION_LINKS_TABLE);
  if (!links) return new Set();
  return new Set(
    Object.values(links)
      .filter((link) => link.anomaly === 'true')
      .map((link) => link.localTransactionId as string)
      .filter((id): id is string => !!id),
  );
}

export async function setMercuryCursor(mercuryAccountId: string, cursor: string | null): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().setRow(MERCURY_CURSORS_TABLE, mercuryAccountId, { cursor });
  await saveStore();
}

export function getMercuryCursor(mercuryAccountId: string): string | null {
  if (!isDatabaseReady()) return null;
  return cellString(getStore().getCell(MERCURY_CURSORS_TABLE, mercuryAccountId, 'cursor'));
}

/** Debounce for the sync trigger; the timestamp of the last recorded attempt. */
export async function setSyncDebounceTimestamp(at: number): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().setRow(MERCURY_SYNC_STATE_TABLE, MERCURY_DEBOUNCE_ROW_ID, { lastAttemptAt: at });
  await saveStore();
}

export function getSyncDebounceTimestamp(): number | null {
  if (!isDatabaseReady()) return null;
  return cellNumber(
    getStore().getCell(MERCURY_SYNC_STATE_TABLE, MERCURY_DEBOUNCE_ROW_ID, 'lastAttemptAt'),
  );
}

/** Rate-limit backoff state for automatic syncs; persisted so restarts respect it. */
export const MERCURY_BACKOFF_ROW_ID = 'backoff';

export interface MercuryBackoff {
  nextEligibleAt: number | null;
  consecutiveFailures: number;
}

export async function setMercuryBackoff(
  nextEligibleAt: number | null,
  consecutiveFailures: number,
): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().setRow(MERCURY_SYNC_STATE_TABLE, MERCURY_BACKOFF_ROW_ID, {
    nextEligibleAt,
    consecutiveFailures,
  });
  await saveStore();
}

export function getMercuryBackoff(): MercuryBackoff {
  if (!isDatabaseReady()) return { nextEligibleAt: null, consecutiveFailures: 0 };
  const row = getStore().getRow(MERCURY_SYNC_STATE_TABLE, MERCURY_BACKOFF_ROW_ID);
  return {
    nextEligibleAt: cellNumber(row.nextEligibleAt),
    consecutiveFailures: cellNumber(row.consecutiveFailures) ?? 0,
  };
}

export async function clearMercuryBackoff(): Promise<void> {
  await setMercuryBackoff(null, 0);
}
