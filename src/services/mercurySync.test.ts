/**
 * Tests for the incremental sync (ticket 06). Same harness as
 * mercuryImport.test.ts: a FakeStore double for TinyBase (ESM-only in Jest)
 * and a mocked mercuryApi module kept reachable through requireActual.
 */
import {
  syncMercuryAccounts,
  MERCURY_SYNC_DEBOUNCE_MS,
} from './mercurySync';
import {
  fetchMercuryAccounts,
  fetchMercuryTransactions,
  MercuryApiError,
  MercuryIncompleteWindowError,
  type MercuryApiTransaction,
} from './mercuryApi';
import { getStoredMercuryToken } from './mercuryConnect';
import {
  getMercuryBackoff,
  getMercuryConnection,
  getMercuryLinkedAccounts,
  getMercuryTransactionLinks,
  getSyncDebounceTimestamp,
  putMercuryLinkedAccount,
  putMercuryTransactionLink,
  setSyncDebounceTimestamp,
  upsertMercuryConnection,
  type MercuryLinkedAccount,
} from '../db/mercury';
import { getAccounts } from '../db/storage';
import { generateId, generateTransactionId, getStore, saveStore } from '../db/tinybase';
import * as mercuryDb from '../db/mercury';

jest.mock('../db/tinybase', () => ({
  isDatabaseReady: jest.fn(() => true),
  getStore: jest.fn(),
  saveStore: jest.fn(async () => {}),
  generateId: jest.fn(),
  generateTransactionId: jest.fn(),
}));

jest.mock('./mercuryApi', () => ({
  ...jest.requireActual('./mercuryApi'),
  fetchMercuryTransactions: jest.fn(),
  fetchMercuryAccounts: jest.fn(),
}));

jest.mock('./mercuryConnect', () => ({
  getStoredMercuryToken: jest.fn(),
}));

const fetchMock = fetchMercuryTransactions as jest.Mock;
const fetchAccountsMock = fetchMercuryAccounts as jest.Mock;
const tokenMock = getStoredMercuryToken as jest.Mock;
const saveStoreMock = saveStore as jest.Mock;
const getStoreMock = getStore as jest.Mock;

type Row = Record<string, unknown>;

class FakeStore {
  private tables: Record<string, Record<string, Row>> = {};
  private values: Record<string, unknown> = {};

  getTable(table: string) {
    return this.tables[table] ?? {};
  }

  getRow(table: string, id: string) {
    return this.tables[table]?.[id] ?? {};
  }

  setRow(table: string, id: string, row: Row) {
    (this.tables[table] ??= {})[id] = { ...row };
  }

  setCell(table: string, id: string, cell: string, value: unknown) {
    this.setRow(table, id, { ...(this.tables[table]?.[id] ?? {}), [cell]: value });
  }

  getCell(table: string, id: string, cell: string) {
    return this.tables[table]?.[id]?.[cell];
  }

  delRow(table: string, id: string) {
    delete this.tables[table]?.[id];
  }

  getValue(key: string) {
    return this.values[key];
  }

  setValue(key: string, value: unknown) {
    this.values[key] = value;
  }
}

let store: FakeStore;

// Frozen clock for the debounce, the cursor math, and the backoff asserts.
const NOW = Date.parse('2026-11-21T12:00:00Z');

beforeEach(() => {
  store = new FakeStore();
  getStoreMock.mockReturnValue(store);
  jest.clearAllMocks();
  tokenMock.mockResolvedValue('secret-token:abc');
  fetchAccountsMock.mockResolvedValue([
    { id: 'acct-1', name: 'Checking', currentBalance: 100 },
  ]);
  let accountId = 0;
  let txId = 0;
  (generateId as jest.Mock).mockImplementation(() => `generated-${++accountId}`);
  (generateTransactionId as jest.Mock).mockImplementation(() => `local-${++txId}`);
});

function mercuryRow(
  overrides: Partial<MercuryApiTransaction> & { id?: string },
): MercuryApiTransaction {
  return {
    id: 'mtx-1',
    accountId: 'acct-1',
    amount: 10,
    status: 'sent',
    kind: 'outgoingPayment',
    createdAt: '2026-11-01T10:00:00Z',
    postedAt: '2026-11-02T10:00:00Z',
    note: null,
    bankDescription: null,
    counterpartyName: 'Coffee Shop',
    currencyExchangeInfo: null,
    merchant: null,
    categoryData: null,
    mercuryCategory: null,
    ...overrides,
  } as MercuryApiTransaction;
}

async function seedLinkedAccount(
  overrides: Partial<MercuryLinkedAccount> = {},
): Promise<void> {
  store.setRow('accounts', 'acc-managed', {
    name: 'Mercury Checking',
    icon: 'landmark',
    description: null,
    balance: 999990,
    order: 0,
    currency: 'USD',
    source: 'mercury',
  });
  await upsertMercuryConnection({ tokenStatus: 'active', createdAt: 1 });
  store.setValue('isPremium', 'true');
  await putMercuryLinkedAccount({
    id: 'acct-1',
    localAccountId: 'acc-managed',
    enabled: true,
    currency: 'USD',
    mixedCurrency: false,
    cursorWindowDays: 90,
    lastSyncedAt: null,
    stale: false,
    lastError: null,
    ...overrides,
  });
}

async function seedImportedRow(
  localId: string,
  mercuryId: string,
  isoDate: string,
  localAccountId = 'acc-managed',
  mercuryAccountId = 'acct-1',
  // Defaults to the row's local date so plain tests behave as if createdAt
  // and postedAt agree; the createdAt-mismatch tests pass their own value.
  mercuryCreatedAtMs: number | null = Date.parse(isoDate),
): Promise<void> {
  store.setRow('transactions', localId, {
    type: 'expense',
    categoryId: null,
    subcategoryId: null,
    subcategoryName: null,
    categoryName: null,
    categoryIcon: null,
    categoryType: null,
    accountId: localAccountId,
    accountName: 'Mercury Checking',
    toAccountId: null,
    toAccountName: null,
    note: null,
    description: null,
    amount: -9.01,
    currency: 'USD',
    toCurrency: null,
    toAmount: null,
    date: Date.parse(isoDate),
    imagePath: null,
  });
  await putMercuryTransactionLink({
    id: mercuryId,
    localTransactionId: localId,
    mercuryAccountId,
    anomaly: false,
    mercuryCreatedAtMs,
  });
}

function localRow(localTransactionId: string) {
  return store.getRow('transactions', localTransactionId);
}

describe('trigger gates are silent no-ops', () => {
  it('does nothing when the user is not premium', async () => {
    await seedLinkedAccount();
    store.setValue('isPremium', 'false');
    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome).toEqual({ ran: false, busy: false, succeeded: [], failed: [] });
    expect(fetchAccountsMock).not.toHaveBeenCalled();
  });

  it('does nothing without a connection or with a needs_reauth one', async () => {
    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.ran).toBe(false);

    await seedLinkedAccount();
    await upsertMercuryConnection({ tokenStatus: 'needs_reauth' });
    const reauth = await syncMercuryAccounts({ force: true });
    expect(reauth.ran).toBe(false);
    expect(fetchAccountsMock).not.toHaveBeenCalled();
  });

  it('does nothing with no enabled linked accounts', async () => {
    await seedLinkedAccount({ enabled: false });
    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.ran).toBe(false);
    expect(fetchAccountsMock).not.toHaveBeenCalled();
  });

  it('does nothing without a stored token', async () => {
    await seedLinkedAccount();
    tokenMock.mockResolvedValue(null);
    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.ran).toBe(false);
  });
});

describe('five-minute debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips an automatic sync while the persisted debounce is young', async () => {
    await seedLinkedAccount();
    // Written through the persisted row: this is the state a restart loads.
    await setSyncDebounceTimestamp(NOW - 60_000);

    const outcome = await syncMercuryAccounts();
    expect(outcome.ran).toBe(false);
    expect(fetchAccountsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a forced sync bypasses the debounce', async () => {
    await seedLinkedAccount();
    await setSyncDebounceTimestamp(NOW - 60_000);
    fetchMock.mockResolvedValue([]);

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.ran).toBe(true);
    expect(outcome.succeeded).toEqual(['acct-1']);
  });

  it('persists the debounce on success, so a restart inside it no-ops', async () => {
    await seedLinkedAccount();
    fetchMock.mockResolvedValue([]);

    await syncMercuryAccounts();
    expect(getSyncDebounceTimestamp()).toBe(NOW);

    // "Restart": the same row read back through the getter, a fresh trigger.
    const afterRestart = await syncMercuryAccounts();
    expect(afterRestart.ran).toBe(false);
  });

  it('consumes the debounce only after at least one account succeeds', async () => {
    await seedLinkedAccount();
    fetchMock.mockRejectedValue(new MercuryApiError('network', null, 'Could not reach Mercury.'));

    const failed = await syncMercuryAccounts();
    expect(failed.succeeded).toEqual([]);
    expect(getSyncDebounceTimestamp()).toBeNull();

    // The failed attempt is immediately retryable: the next automatic
    // trigger inside the would-be debounce window still runs.
    fetchMock.mockResolvedValue([mercuryRow({ id: 'mtx-1' })]);
    const retried = await syncMercuryAccounts();
    expect(retried.succeeded).toEqual(['acct-1']);
    expect(getSyncDebounceTimestamp()).toBe(NOW);
  });
});

describe('backoff on 429 and 5xx', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('records a persisted backoff honoring Retry-After, without consuming the debounce', async () => {
    await seedLinkedAccount();
    fetchAccountsMock.mockRejectedValue(
      new MercuryApiError('unexpected', 429, 'Slow down.', { retryAfter: 30 }),
    );

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.ran).toBe(true);
    expect(outcome.succeeded).toEqual([]);
    expect(getSyncDebounceTimestamp()).toBeNull();
    expect(getMercuryBackoff()).toEqual({
      nextEligibleAt: NOW + 30_000,
      consecutiveFailures: 1,
    });

    // The automatic trigger respects the backoff; user intent does not.
    const automatic = await syncMercuryAccounts();
    expect(automatic.ran).toBe(false);
    const forced = await syncMercuryAccounts({ force: true });
    expect(forced.ran).toBe(true);
  });

  it('grows the backoff exponentially with jitter on repeated 5xx, capped', async () => {
    await seedLinkedAccount();
    fetchAccountsMock.mockRejectedValue(
      new MercuryApiError('unexpected', 503, 'Unavailable.'),
    );

    await syncMercuryAccounts({ force: true });
    const first = getMercuryBackoff();
    expect(first.consecutiveFailures).toBe(1);
    expect(first.nextEligibleAt! - NOW).toBeLessThanOrEqual(1_000);

    await syncMercuryAccounts({ force: true });
    const second = getMercuryBackoff();
    expect(second.consecutiveFailures).toBe(2);
    expect(second.nextEligibleAt! - NOW).toBeLessThanOrEqual(2_000);
    expect(second.nextEligibleAt!).toBeGreaterThanOrEqual(NOW);
  });

  it('a network error is reported per account, not turned into a backoff', async () => {
    await seedLinkedAccount();
    await putMercuryLinkedAccount({
      id: 'acct-2',
      localAccountId: 'acc-managed-2',
      enabled: true,
      currency: 'USD',
      mixedCurrency: false,
      cursorWindowDays: 90,
      lastSyncedAt: null,
      stale: false,
      lastError: null,
    });
    store.setRow('accounts', 'acc-managed-2', {
      name: 'Mercury Savings',
      icon: 'landmark',
      description: null,
      balance: 0,
      order: 1,
      currency: 'USD',
      source: 'mercury',
    });
    fetchAccountsMock.mockResolvedValue([
      { id: 'acct-1', name: 'Checking', currentBalance: 100 },
      { id: 'acct-2', name: 'Savings', currentBalance: 200 },
    ]);
    fetchMock.mockImplementation(async (_token: string, accountId: string) => {
      if (accountId === 'acct-1') {
        throw new MercuryApiError('network', null, 'Could not reach Mercury.');
      }
      return [mercuryRow({ id: 'mtx-2', accountId: 'acct-2' })];
    });

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.failed.map((failure) => failure.mercuryAccountId)).toEqual(['acct-1']);
    expect(outcome.failed[0]!.error).toBeInstanceOf(MercuryApiError);
    expect(outcome.succeeded).toEqual(['acct-2']);
    // A success in the run consumed the debounce and left no backoff.
    expect(getSyncDebounceTimestamp()).toBe(NOW);
    expect(getMercuryBackoff().nextEligibleAt).toBeNull();
  });
});

describe('re-authentication classification', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks the connection needs_reauth on a 401 and stops automatic sync', async () => {
    await seedLinkedAccount();
    fetchAccountsMock.mockRejectedValue(
      new MercuryApiError('invalidCredentials', 401, 'Mercury rejected the API token.'),
    );

    const outcome = await syncMercuryAccounts();
    expect(outcome.ran).toBe(true);
    expect(outcome.failed).toHaveLength(1);
    expect(getMercuryConnection()?.tokenStatus).toBe('needs_reauth');

    // Every later automatic trigger no-ops on the connection gate.
    fetchAccountsMock.mockResolvedValue([]);
    const next = await syncMercuryAccounts();
    expect(next.ran).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a 403 the same way', async () => {
    await seedLinkedAccount();
    fetchAccountsMock.mockRejectedValue(
      new MercuryApiError('invalidCredentials', 403, 'Mercury rejected the API token.'),
    );
    await syncMercuryAccounts();
    expect(getMercuryConnection()?.tokenStatus).toBe('needs_reauth');
  });

  it('stops the remaining accounts once the token is rejected mid-run', async () => {
    await seedLinkedAccount();
    await putMercuryLinkedAccount({
      id: 'acct-2',
      localAccountId: 'acc-managed-2',
      enabled: true,
      currency: 'USD',
      mixedCurrency: false,
      cursorWindowDays: 90,
      lastSyncedAt: null,
      stale: false,
      lastError: null,
    });
    fetchAccountsMock.mockResolvedValue([
      { id: 'acct-1', name: 'Checking', currentBalance: 100 },
      { id: 'acct-2', name: 'Savings', currentBalance: 200 },
    ]);
    fetchMock.mockRejectedValue(
      new MercuryApiError('invalidCredentials', 401, 'Mercury rejected the API token.'),
    );

    const outcome = await syncMercuryAccounts({ force: true });
    // The run stops at the first rejection; the second account is untouched.
    expect(outcome.failed.map((failure) => failure.mercuryAccountId)).toEqual(['acct-1']);
    expect(getMercuryLinkedAccounts().find((a) => a.id === 'acct-2')).toMatchObject({
      stale: false,
      lastError: null,
    });
  });
});

describe('windowed deletion pass', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    fetchAccountsMock.mockResolvedValue([
      { id: 'acct-1', name: 'Checking', currentBalance: 999990 },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Cursor lastSyncedAt = 2026-11-20T12:00Z -> the fetched window is the
  // exact [cursor, now]; rows whose LINK createdAt is at or after the cursor
  // are deletable (the seeded helper sets the link's createdAt to the row's
  // date, so the two agree in these tests).
  const CURSOR = Date.parse('2026-11-20T12:00:00Z');

  it('deletes an inside-window imported row whose Mercury transaction vanished', async () => {
    await seedLinkedAccount({ lastSyncedAt: CURSOR });
    await seedImportedRow('tx-inside', 'mtx-inside', '2026-11-21T10:00:00Z');
    fetchMock.mockResolvedValue([mercuryRow({ id: 'mtx-fresh', postedAt: '2026-11-21T11:00:00Z' })]);

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.succeeded).toEqual(['acct-1']);

    expect(localRow('tx-inside')).toEqual({});
    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual(['mtx-fresh']);
    // Deleting the imported row must not move the mirrored balance.
    expect((await getAccounts())[0].balance).toBe(999990);
    // The cursor advanced past the run.
    expect(getMercuryLinkedAccounts()[0].lastSyncedAt).toBe(NOW);
  });

  it('leaves rows imported before the window untouched', async () => {
    await seedLinkedAccount({ lastSyncedAt: CURSOR });
    await seedImportedRow('tx-outside', 'mtx-outside', '2026-11-10T10:00:00Z');
    fetchMock.mockResolvedValue([]);

    await syncMercuryAccounts({ force: true });

    expect(localRow('tx-outside')).toMatchObject({ amount: -9.01 });
    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual(['mtx-outside']);
  });

  it('deletion boundary is the exact cursor: inclusive at it, not the whole day', async () => {
    await seedLinkedAccount({ lastSyncedAt: CURSOR });
    // Same UTC day as the cursor: one row exactly at the cursor timestamp,
    // one three hours earlier. The fetch window is [cursor, now] inclusive.
    await seedImportedRow('tx-at-cursor', 'mtx-at-cursor', '2026-11-20T12:00:00.000Z');
    await seedImportedRow('tx-earlier-same-day', 'mtx-earlier-same-day', '2026-11-20T09:00:00Z');
    // Mercury no longer has either row.
    fetchMock.mockResolvedValue([]);

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.succeeded).toEqual(['acct-1']);

    // The row exactly at the cursor is inside the window: deleted.
    expect(localRow('tx-at-cursor')).toEqual({});
    // The earlier same-day row is outside: untouched.
    expect(localRow('tx-earlier-same-day')).toMatchObject({ amount: -9.01 });
    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual(['mtx-earlier-same-day']);
    // The deletion still never moves the mirrored balance.
    expect((await getAccounts())[0].balance).toBe(999990);
    // The request used the exact cursor, not its UTC day.
    expect(fetchMock).toHaveBeenCalledWith('secret-token:abc', 'acct-1', {
      start: '2026-11-20T12:00:00Z',
    });
  });

  it('spares a manual-delete tombstone: the link survives without its local row', async () => {
    await seedLinkedAccount({ lastSyncedAt: CURSOR });
    await seedImportedRow('tx-manual-deleted', 'mtx-tombstone', '2026-11-21T10:00:00Z');
    // The user deleted the local row; ticket 04 keeps the link.
    store.delRow('transactions', 'tx-manual-deleted');
    fetchMock.mockResolvedValue([]);

    await syncMercuryAccounts({ force: true });

    // The link stays so the row is never re-imported behind the user's back.
    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual(['mtx-tombstone']);
  });

  it('aborts the deletion pass when a page fails: no deletions, cursor unchanged', async () => {
    await seedLinkedAccount({ lastSyncedAt: CURSOR });
    await seedImportedRow('tx-inside', 'mtx-inside', '2026-11-21T10:00:00Z');
    fetchMock.mockRejectedValue(new MercuryApiError('network', null, 'Could not reach Mercury.'));

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.failed).toHaveLength(1);

    // Nothing was deleted and the cursor did not move.
    expect(localRow('tx-inside')).toMatchObject({ amount: -9.01 });
    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual(['mtx-inside']);
    expect(getMercuryLinkedAccounts()[0].lastSyncedAt).toBe(CURSOR);
    expect(getMercuryLinkedAccounts()[0]).toMatchObject({
      stale: true,
      lastError: 'Could not reach Mercury.',
    });
  });
});

describe('cursor and rows on failure', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('advances the cursor only after the whole window succeeded', async () => {
    await seedLinkedAccount({ lastSyncedAt: null });
    fetchMock.mockResolvedValue([mercuryRow({ id: 'mtx-1' })]);
    await syncMercuryAccounts({ force: true });
    const afterFirst = getMercuryLinkedAccounts()[0];
    expect(afterFirst.lastSyncedAt).toBe(NOW);
    expect(afterFirst.stale).toBe(false);

    // A later failed run keeps the cursor and every imported row.
    fetchMock.mockRejectedValue(new Error('offline'));
    await syncMercuryAccounts({ force: true });
    const afterFailure = getMercuryLinkedAccounts()[0];
    expect(afterFailure.lastSyncedAt).toBe(NOW);
    expect(afterFailure).toMatchObject({ stale: true, lastError: 'offline' });
    expect(getMercuryTransactionLinks()).toHaveLength(1);
  });

  it('keeps every row already imported when a later link write fails', async () => {
    await seedLinkedAccount({ lastSyncedAt: null });
    fetchMock.mockResolvedValue([
      mercuryRow({ id: 'mtx-1', amount: -5 }),
      mercuryRow({ id: 'mtx-2', amount: -7 }),
    ]);
    const originalPutLink = mercuryDb.putMercuryTransactionLink;
    let linkWrites = 0;
    const putLinkSpy = jest
      .spyOn(mercuryDb, 'putMercuryTransactionLink')
      .mockImplementation(async (link) => {
        linkWrites += 1;
        if (linkWrites === 2) throw new Error('link write failed');
        return originalPutLink(link);
      });

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.failed).toHaveLength(1);

    // The first row and its link survived; the cursor did not advance.
    expect(localRow('local-1')).toMatchObject({ amount: -5 });
    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual(['mtx-1']);
    expect(getMercuryLinkedAccounts()[0].lastSyncedAt).toBeNull();
    putLinkSpy.mockRestore();
  });

  it('still excludes transfer kinds during a sync', async () => {
    await seedLinkedAccount({ lastSyncedAt: null });
    fetchMock.mockResolvedValue([
      mercuryRow({ id: 'mtx-transfer', kind: 'internalTransfer', amount: -50 }),
      mercuryRow({ id: 'mtx-kept', amount: -5 }),
    ]);

    await syncMercuryAccounts({ force: true });
    expect(Object.keys(store.getTable('transactions'))).toEqual(['local-1']);
    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual(['mtx-kept']);
  });
});

describe('deletion boundary follows Mercury createdAt (R3)', () => {
  const T0 = Date.parse('2026-11-21T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
    fetchAccountsMock.mockResolvedValue([
      { id: 'acct-1', name: 'Checking', currentBalance: 999990 },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('spares a row whose createdAt predates the cursor while its postedAt is inside the window', async () => {
    await seedLinkedAccount({ lastSyncedAt: T0 - 60_000 });
    // Row A: createdAt before the (future) cursor, postedAt after it — the
    // exact trap shape, since the server filters on createdAt while the local
    // row date is postedAt ?? createdAt. Row B: both fields after the cursor.
    const rowA = mercuryRow({
      id: 'mtx-a',
      createdAt: '2026-11-21T11:59:55.000Z',
      postedAt: '2026-11-21T12:00:03.000Z',
      amount: -5,
    });
    const rowB = mercuryRow({
      id: 'mtx-b',
      createdAt: '2026-11-21T12:00:05.000Z',
      postedAt: '2026-11-21T12:00:05.000Z',
      amount: -7,
    });
    // The double models the server: it filters by createdAt >= start, and the
    // pool is Mercury's current state (rows can disappear from it).
    let pool: MercuryApiTransaction[] = [rowA, rowB];
    fetchMock.mockImplementation(
      async (_token: string, _accountId: string, opts: { start: string }) =>
        pool.filter((row) => Date.parse(row.createdAt!) >= Date.parse(opts.start)),
    );

    // Run 1: the seeded cursor (T0-60s) fetches both rows; both import (A
    // with the local date of its postedAt, T0+3s) and the cursor advances
    // to T0.
    await syncMercuryAccounts({ force: true });
    expect(localRow('local-1')).toMatchObject({ amount: -5 });
    expect(localRow('local-2')).toMatchObject({ amount: -7 });
    expect(getMercuryLinkedAccounts()[0].lastSyncedAt).toBe(T0);

    // Mercury deletes A. Run 2's server filter (createdAt >= T0) omits A: the
    // fetch returns only B.
    pool = [rowB];
    await syncMercuryAccounts({ force: true });

    // A must survive: its link's Mercury createdAt (T0-5s) is before the
    // window start, so its absence from the fetch proves nothing. (Judging by
    // the local date — postedAt T0+3s >= cursor — would falsely delete it
    // along with its link.)
    expect(localRow('local-1')).toMatchObject({ amount: -5 });
    expect(getMercuryTransactionLinks().map((link) => link.id).sort()).toEqual([
      'mtx-a',
      'mtx-b',
    ]);
    // B is present in the fetch, so it stays too.
    expect(localRow('local-2')).toMatchObject({ amount: -7 });

    // Positive case: B's link carries createdAt T0+5s >= the window start and
    // Mercury genuinely no longer has it — the pass deletes row and link.
    pool = [];
    await syncMercuryAccounts({ force: true });
    expect(localRow('local-1')).toMatchObject({ amount: -5 });
    expect(localRow('local-2')).toEqual({});
    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual(['mtx-a']);
    // Deletions never move the mirrored balance.
    expect((await getAccounts())[0].balance).toBe(999990);
  });

  it('spares links without a stored createdAt (legacy links and restored backups)', async () => {
    const CURSOR = Date.parse('2026-11-20T12:00:00Z');
    await seedLinkedAccount({ lastSyncedAt: CURSOR });
    await seedImportedRow('tx-legacy', 'mtx-legacy', '2026-11-21T10:00:00Z', 'acc-managed', 'acct-1', null);
    fetchMock.mockResolvedValue([]);

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.succeeded).toEqual(['acct-1']);

    // No createdAt on the link: absence from the window proves nothing, so
    // the row and its link are spared.
    expect(localRow('tx-legacy')).toMatchObject({ amount: -9.01 });
    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual(['mtx-legacy']);
  });
});

describe('mirrored balance in a finally block', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes the captured balance even when the sync fails', async () => {
    await seedLinkedAccount();
    fetchAccountsMock.mockResolvedValue([
      { id: 'acct-1', name: 'Checking', currentBalance: 1234.5 },
    ]);
    fetchMock.mockRejectedValue(new Error('offline'));

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.failed).toHaveLength(1);
    expect((await getAccounts())[0].balance).toBe(1234.5);
  });

  it('writes the captured balance on success too', async () => {
    await seedLinkedAccount();
    fetchAccountsMock.mockResolvedValue([
      { id: 'acct-1', name: 'Checking', currentBalance: 555 },
    ]);
    fetchMock.mockResolvedValue([mercuryRow({ id: 'mtx-1' })]);

    await syncMercuryAccounts({ force: true });
    expect((await getAccounts())[0].balance).toBe(555);
  });

  it('writes nothing when Mercury reported no balance', async () => {
    await seedLinkedAccount();
    fetchAccountsMock.mockResolvedValue([
      { id: 'acct-1', name: 'Checking', currentBalance: null },
    ]);
    fetchMock.mockResolvedValue([]);

    await syncMercuryAccounts({ force: true });
    expect((await getAccounts())[0].balance).toBe(999990);
  });
});

describe('single flight', () => {
  it('refuses a second sync while one is running', async () => {
    await seedLinkedAccount();
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fetchMock.mockImplementation(async () => {
      entered();
      await gate;
      return [];
    });

    const first = syncMercuryAccounts({ force: true });
    await enteredPromise;
    const second = await syncMercuryAccounts({ force: true });
    expect(second).toEqual({ ran: false, busy: true, succeeded: [], failed: [] });

    release();
    const firstOutcome = await first;
    expect(firstOutcome.succeeded).toEqual(['acct-1']);
  });
});

describe('incomplete window guard (F1)', () => {
  // The real paginator runs (the module mock delegates to requireActual) and
  // the guarded scenario is produced by the fetch double: page two repeats
  // page one, so the offset was ignored. The rows fetched before the guard
  // are a prefix — mtx-inside is inside it, mtx-late would only be covered by
  // the rest of the window — and a prefix must delete nothing.
  const realMercuryApi = jest.requireActual('./mercuryApi') as typeof import('./mercuryApi');
  const originalFetch = global.fetch;

  function pageRows(offset: number, count: number): Record<string, unknown>[] {
    return Array.from({ length: count }, (_unused, i) => ({
      id: i === 0 && offset === 0 ? 'mtx-inside' : `mtx-page-${offset + i}`,
      accountId: 'acct-1',
      amount: 1,
      status: 'sent',
      kind: 'other',
      createdAt: '2026-11-21T10:00:00Z',
      postedAt: '2026-11-21T10:00:00Z',
    }));
  }

  function jsonResponse(payload: unknown): Response {
    return {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(payload),
    } as unknown as Response;
  }

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('a repeated page deletes nothing, keeps every row, and leaves the cursor', async () => {
    jest.useFakeTimers({ now: NOW });
    const CURSOR = Date.parse('2026-11-20T12:00:00Z');
    await seedLinkedAccount({ lastSyncedAt: CURSOR });
    await seedImportedRow('tx-inside', 'mtx-inside', '2026-11-21T10:00:00Z');
    await seedImportedRow('tx-late', 'mtx-late', '2026-11-21T11:00:00Z');
    fetchAccountsMock.mockResolvedValue([
      { id: 'acct-1', name: 'Checking', currentBalance: 999990 },
    ]);
    // The server ignores the offset: both pages carry the same rows.
    const identical = pageRows(0, 500);
    global.fetch = jest.fn(async () => jsonResponse({ transactions: identical })) as unknown as typeof fetch;
    fetchMock.mockImplementation(
      (token: string, accountId: string, opts: { start: string }) =>
        realMercuryApi.fetchMercuryTransactions(token, accountId, opts),
    );

    const outcome = await syncMercuryAccounts({ force: true });

    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]!.error).toBeInstanceOf(MercuryIncompleteWindowError);
    // Nothing was deleted: both linked rows and their links survive.
    expect(localRow('tx-inside')).toMatchObject({ amount: -9.01 });
    expect(localRow('tx-late')).toMatchObject({ amount: -9.01 });
    expect(getMercuryTransactionLinks().map((link) => link.id).sort()).toEqual([
      'mtx-inside',
      'mtx-late',
    ]);
    // The cursor did not advance, so the window is retried in full next time.
    expect(getMercuryLinkedAccounts()[0].lastSyncedAt).toBe(CURSOR);
    expect(getMercuryLinkedAccounts()[0].lastError).toContain('repeated');
  });
});

describe('deletion persist rollback (F4/R1)', () => {
  it('restores the pair on save failure, link before row, and fails the account', async () => {
    const CURSOR = Date.parse('2026-11-20T12:00:00Z');
    await seedLinkedAccount({ lastSyncedAt: CURSOR });
    await seedImportedRow('tx-inside', 'mtx-inside', '2026-11-21T10:00:00Z');
    fetchAccountsMock.mockResolvedValue([
      { id: 'acct-1', name: 'Checking', currentBalance: 999990 },
    ]);
    // No new rows to import (the fetched window holds nothing), so the only
    // saveStore calls during the sync are the deletion save and its rollback.
    fetchMock.mockResolvedValue([]);
    // Both the deletion save and the rollback save fail, so every mutation
    // must come from the in-memory restore path.
    saveStoreMock.mockRejectedValueOnce(new Error('disk full'))
      .mockRejectedValueOnce(new Error('disk full'));

    // Record the store mutation order to pin the safe sequence.
    const setRowCalls: string[] = [];
    const delRowCalls: string[] = [];
    const originalSetRow = store.setRow.bind(store);
    const originalDelRow = store.delRow.bind(store);
    store.setRow = (table: string, id: string, row: Row) => {
      setRowCalls.push(`${table}:${id}`);
      return originalSetRow(table, id, row);
    };
    store.delRow = (table: string, id: string) => {
      delRowCalls.push(`${table}:${id}`);
      originalDelRow(table, id);
    };

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.failed).toHaveLength(1);

    // Delete order: the local row goes first, so an interrupted save leaves
    // at worst the tombstone (link without row) — never an unlinked live row,
    // which the next sync would re-import as a duplicate.
    expect(delRowCalls.slice(0, 2)).toEqual([
      'transactions:tx-inside',
      'mercuryTransactionLinks:mtx-inside',
    ]);
    // Rollback order: the link comes back first, so an interrupted rollback
    // save also leaves at worst the tombstone.
    const linkAt = setRowCalls.indexOf('mercuryTransactionLinks:mtx-inside');
    const rowAt = setRowCalls.indexOf('transactions:tx-inside');
    expect(linkAt).toBeGreaterThanOrEqual(0);
    expect(rowAt).toBe(linkAt + 1);

    // Both rows survived (the in-memory rollback ran despite the second save
    // failing); the cursor did not move.
    expect(localRow('tx-inside')).toMatchObject({ amount: -9.01 });
    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual(['mtx-inside']);
    expect(getMercuryLinkedAccounts()[0]).toMatchObject({
      lastSyncedAt: CURSOR,
      stale: true,
      lastError: 'disk full',
    });
  });
});

describe('mixed-run adjudication (F8)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('one success plus one 429 consumes the debounce and resets the backoff', async () => {
    await seedLinkedAccount();
    await putMercuryLinkedAccount({
      id: 'acct-2',
      localAccountId: 'acc-managed-2',
      enabled: true,
      currency: 'USD',
      mixedCurrency: false,
      cursorWindowDays: 90,
      lastSyncedAt: null,
      stale: false,
      lastError: null,
    });
    store.setRow('accounts', 'acc-managed-2', {
      name: 'Mercury Savings',
      icon: 'landmark',
      description: null,
      balance: 0,
      order: 1,
      currency: 'USD',
      source: 'mercury',
    });
    await seedImportedRow('tx-2', 'mtx-2', '2026-11-21T09:00:00Z', 'acc-managed-2', 'acct-2');
    fetchAccountsMock.mockResolvedValue([
      { id: 'acct-1', name: 'Checking', currentBalance: 100 },
      { id: 'acct-2', name: 'Savings', currentBalance: 200 },
    ]);
    fetchMock.mockImplementation(async (_token: string, accountId: string) => {
      if (accountId === 'acct-2') {
        throw new MercuryApiError('unexpected', 429, 'Slow down.', { retryAfter: 30 });
      }
      return [mercuryRow({ id: 'mtx-1', accountId: 'acct-1' })];
    });

    const outcome = await syncMercuryAccounts({ force: true });
    expect(outcome.succeeded).toEqual(['acct-1']);
    expect(outcome.failed.map((failure) => failure.mercuryAccountId)).toEqual(['acct-2']);

    // Connection-level semantics: the API served the token (one account got
    // through), so the run consumes the debounce and resets the backoff even
    // though the other account was rate-limited. See the comment at the
    // debounce/backoff write in mercurySync.ts.
    expect(getSyncDebounceTimestamp()).toBe(NOW);
    expect(getMercuryBackoff()).toEqual({ nextEligibleAt: null, consecutiveFailures: 0 });

    // The 429'd account keeps its rows, its stale marker, its error, and an
    // unchanged cursor (never synced, so still null).
    expect(getMercuryLinkedAccounts().find((a) => a.id === 'acct-2')).toMatchObject({
      stale: true,
      lastError: 'Slow down.',
      lastSyncedAt: null,
    });
    expect(localRow('tx-2')).toMatchObject({ accountId: 'acc-managed-2' });
  });
});

describe('incremental window', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('syncs from the exact stored cursor instead of the backfill window', async () => {
    await seedLinkedAccount({
      lastSyncedAt: Date.parse('2026-11-20T12:34:56.789Z'),
      cursorWindowDays: 365,
    });
    fetchMock.mockResolvedValue([]);

    await syncMercuryAccounts({ force: true });
    // The endpoint accepts ISO 8601 starts bound inclusively (F7 probe), so
    // the cursor goes out verbatim, floored to the probe-verified whole-second
    // format: no day truncation, no safety band.
    expect(fetchMock).toHaveBeenCalledWith('secret-token:abc', 'acct-1', {
      start: '2026-11-20T12:34:56Z',
    });
  });

  it('uses the configured window on a first sync (no cursor yet)', async () => {
    await seedLinkedAccount({ lastSyncedAt: null, cursorWindowDays: 90 });
    fetchMock.mockResolvedValue([]);

    await syncMercuryAccounts({ force: true });
    expect(fetchMock).toHaveBeenCalledWith('secret-token:abc', 'acct-1', {
      start: new Date(NOW - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });
  });
});

it('exposes the persisted five-minute debounce constant', () => {
  expect(MERCURY_SYNC_DEBOUNCE_MS).toBe(5 * 60 * 1000);
});
