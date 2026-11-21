/**
 * Tests for the unlink/disconnect flow (ticket 07). Same harness as
 * mercurySync.test.ts: a FakeStore double for TinyBase (ESM-only in Jest)
 * plus a mocked secure-store token path.
 */
import { unlinkMercury } from './mercuryUnlink';
import {
  MercuryBatchBusyError,
  releaseMercuryBatch,
  tryClaimMercuryBatch,
} from './mercuryImport';
import {
  deleteStoredMercuryToken,
  getStoredMercuryToken,
} from './mercuryConnect';
import {
  getMercuryBackoff,
  getMercuryConnection,
  getMercuryLinkedAccounts,
  getMercuryTransactionLinks,
  getSyncDebounceTimestamp,
  putMercuryLinkedAccount,
  putMercuryTransactionLink,
  setMercuryBackoff,
  setMercuryCursor,
  setSyncDebounceTimestamp,
  upsertMercuryConnection,
} from '../db/mercury';
import {
  deleteAccount,
  getAccounts,
  getTransactionById,
  getTransactions,
  updateAccount,
} from '../db/storage';
import { generateId, generateTransactionId, getStore } from '../db/tinybase';

jest.mock('../db/tinybase', () => ({
  isDatabaseReady: jest.fn(() => true),
  getStore: jest.fn(),
  saveStore: jest.fn(async () => {}),
  generateId: jest.fn(),
  generateTransactionId: jest.fn(),
}));

jest.mock('./mercuryConnect', () => ({
  deleteStoredMercuryToken: jest.fn(async () => {}),
  getStoredMercuryToken: jest.fn(async () => null),
}));

const deleteTokenMock = deleteStoredMercuryToken as jest.Mock;
const readTokenMock = getStoredMercuryToken as jest.Mock;
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

  delTable(table: string) {
    delete this.tables[table];
  }

  hasTable(table: string) {
    return this.tables[table] !== undefined;
  }

  getValue(key: string) {
    return this.values[key];
  }

  setValue(key: string, value: unknown) {
    this.values[key] = value;
  }
}

let store: FakeStore;

const DATE = Date.parse('2026-11-21T12:00:00Z');

function localTx(id: string, accountId: string, amount: number, extra: Row = {}): Row {
  return {
    type: amount < 0 ? 'expense' : 'income',
    categoryId: null,
    subcategoryId: null,
    subcategoryName: null,
    categoryName: null,
    categoryIcon: null,
    categoryType: null,
    accountId,
    accountName: 'account',
    toAccountId: null,
    toAccountName: null,
    note: null,
    description: null,
    amount,
    currency: 'USD',
    toCurrency: null,
    toAmount: null,
    date: DATE,
    imagePath: null,
    ...extra,
  };
}

async function seedLinkedWorld(): Promise<void> {
  store.setRow('accounts', 'acc-managed', {
    name: 'Mercury Checking',
    icon: 'landmark',
    description: null,
    balance: 999990,
    order: 0,
    currency: 'USD',
    source: 'mercury',
  });
  store.setRow('accounts', 'acc-manual', {
    name: 'Cash',
    icon: 'wallet',
    description: null,
    balance: 500,
    order: 1,
    currency: 'EUR',
    source: 'manual',
  });
  store.setRow('transactions', 'tx-manual', localTx('tx-manual', 'acc-manual', -12));
  store.setRow('transactions', 'tx-imported-1', localTx('tx-imported-1', 'acc-managed', -9.01));
  store.setRow('transactions', 'tx-imported-2', localTx('tx-imported-2', 'acc-managed', 25));
  // A manual-delete tombstone: the user deleted the local row, the link
  // survived (ticket 04). Unlink must remove it under both policies.
  await putMercuryTransactionLink({
    id: 'mtx-1',
    localTransactionId: 'tx-imported-1',
    mercuryAccountId: 'acct-1',
    anomaly: false,
    mercuryCreatedAtMs: 1000,
  });
  await putMercuryTransactionLink({
    id: 'mtx-2',
    localTransactionId: 'tx-imported-2',
    mercuryAccountId: 'acct-1',
    anomaly: true,
    mercuryCreatedAtMs: 2000,
  });
  await putMercuryTransactionLink({
    id: 'mtx-tombstone',
    localTransactionId: 'tx-gone',
    mercuryAccountId: 'acct-1',
    anomaly: false,
    mercuryCreatedAtMs: 3000,
  });
  await upsertMercuryConnection({ tokenStatus: 'active', createdAt: 1 });
  await putMercuryLinkedAccount({
    id: 'acct-1',
    localAccountId: 'acc-managed',
    enabled: true,
    currency: 'USD',
    mixedCurrency: true,
    cursorWindowDays: 90,
    lastSyncedAt: DATE,
    stale: false,
    lastError: null,
  });
  await setMercuryCursor('acct-1', 'cursor-1');
  await setSyncDebounceTimestamp(123);
  await setMercuryBackoff(456, 2);
}

beforeEach(() => {
  store = new FakeStore();
  getStoreMock.mockReturnValue(store);
  jest.clearAllMocks();
  // clearAllMocks keeps mockResolvedValue implementations: pin the default
  // read-back (a deleted token) explicitly for every test.
  readTokenMock.mockResolvedValue(null);
  let accountId = 0;
  let txId = 0;
  (generateId as jest.Mock).mockImplementation(() => `generated-${++accountId}`);
  (generateTransactionId as jest.Mock).mockImplementation(() => `local-${++txId}`);
});

describe('unlink with the keep-rows policy', () => {
  it('removes the links and the managed marker but keeps rows, account, and balances', async () => {
    await seedLinkedWorld();

    await unlinkMercury('keep');

    // The stored token was deleted unconditionally.
    expect(deleteTokenMock).toHaveBeenCalledTimes(1);
    // All Mercury bookkeeping is gone, cursors and sync state included.
    expect(getMercuryConnection()).toBeNull();
    expect(getMercuryLinkedAccounts()).toEqual([]);
    expect(getMercuryTransactionLinks()).toEqual([]);
    expect(store.hasTable('mercuryCursors')).toBe(false);
    expect(store.hasTable('mercurySyncState')).toBe(false);
    expect(getSyncDebounceTimestamp()).toBeNull();
    expect(getMercuryBackoff()).toEqual({ nextEligibleAt: null, consecutiveFailures: 0 });

    // The formerly linked account is back to manual with its balance intact.
    const accounts = await getAccounts();
    expect(accounts.find((a) => a.id === 'acc-managed')).toMatchObject({
      source: 'manual',
      balance: 999990,
      currency: 'USD',
      name: 'Mercury Checking',
    });
    // The unrelated manual account never moved.
    expect(accounts.find((a) => a.id === 'acc-manual')).toMatchObject({ balance: 500 });

    // Every imported transaction survives, tombstone links included; the
    // anomaly decoration went away with the link table.
    const txs = await getTransactions();
    expect(txs.map((tx) => tx.id).sort()).toEqual([
      'tx-imported-1',
      'tx-imported-2',
      'tx-manual',
    ]);
    expect(await getTransactionById('tx-imported-1')).toMatchObject({ amount: -9.01 });
    expect((await getTransactionById('tx-imported-2'))?.anomaly).toBe(false);
  });

  it('the formerly linked account becomes editable and deletable again', async () => {
    await seedLinkedWorld();
    await unlinkMercury('keep');

    const renamed = await updateAccount('acc-managed', { name: 'My Checking' });
    expect(renamed?.name).toBe('My Checking');
    await expect(deleteAccount('acc-managed')).resolves.toBeUndefined();
    expect((await getAccounts()).map((a) => a.id)).toEqual(['acc-manual']);
  });
});

describe('unlink with the delete-rows policy', () => {
  it('removes the imported rows and the linked account without corrupting balances', async () => {
    await seedLinkedWorld();
    // A transfer the user created from the manual account INTO the linked
    // one: its balance math was skipped at creation (managed target), so
    // unlinking must not move the manual account's balance either.
    store.setRow(
      'transactions',
      'tx-transfer',
      localTx('tx-transfer', 'acc-manual', -50, {
        type: 'transfer',
        toAccountId: 'acc-managed',
        toAccountName: 'Mercury Checking',
      }),
    );

    await unlinkMercury('delete');

    expect(deleteTokenMock).toHaveBeenCalledTimes(1);
    // The imported transactions are gone, including the tombstoned link's
    // remnant bookkeeping; the manual account's own rows stay.
    const txs = await getTransactions();
    expect(txs.map((tx) => tx.id).sort()).toEqual(['tx-manual', 'tx-transfer']);
    // The linked account is gone wholesale; the manual account stands with
    // its balance untouched.
    const accounts = await getAccounts();
    expect(accounts.map((a) => a.id)).toEqual(['acc-manual']);
    expect(accounts[0]).toMatchObject({ balance: 500, source: 'manual' });
    // Link rows are cleared along with the rest of the Mercury bookkeeping.
    expect(getMercuryTransactionLinks()).toEqual([]);
    expect(getMercuryConnection()).toBeNull();
  });

  it('leaves no dangling imported row when a link outlived its local row', async () => {
    await seedLinkedWorld();
    store.delRow('transactions', 'tx-imported-1');

    await unlinkMercury('delete');

    // The surviving imported row goes with the account (delete-rows clears
    // everything living on the linked account), the tombstone link is
    // dropped with the rest, and only the manual account's rows remain.
    const txs = await getTransactions();
    expect(txs.map((tx) => tx.id)).toEqual(['tx-manual']);
    expect(getMercuryTransactionLinks()).toEqual([]);
    expect((await getAccounts()).map((a) => a.id)).toEqual(['acc-manual']);
  });
});

describe('unlink guards', () => {
  it('declines while a link or sync batch holds the single-flight slot', async () => {
    await seedLinkedWorld();
    expect(tryClaimMercuryBatch()).toBe(true);

    await expect(unlinkMercury('keep')).rejects.toBeInstanceOf(MercuryBatchBusyError);
    // Nothing was touched: token still stored, connection still active.
    expect(deleteTokenMock).not.toHaveBeenCalled();
    expect(getMercuryConnection()?.tokenStatus).toBe('active');

    releaseMercuryBatch();
  });

  it('aborts before any teardown when the token deletion did not stick', async () => {
    await seedLinkedWorld();
    // deleteStoredMercuryToken always resolves; only the read-back proves
    // whether the keychain entry really went away.
    readTokenMock.mockResolvedValue('secret-token:survivor');

    await expect(unlinkMercury('delete')).rejects.toThrow(/token could not be deleted/);

    // The connection, its accounts, the links, and the rows all survive so
    // the user can simply retry the unlink.
    expect(getMercuryConnection()?.tokenStatus).toBe('active');
    expect(getMercuryLinkedAccounts()).toHaveLength(1);
    expect(getMercuryTransactionLinks()).toHaveLength(3);
    expect((await getAccounts()).find((a) => a.id === 'acc-managed')).toMatchObject({
      source: 'mercury',
    });
    expect(await getTransactionById('tx-imported-1')).toBeDefined();
    expect(deleteTokenMock).toHaveBeenCalledTimes(1);
  });

  it('deletes the stored token even when there is no connection at all', async () => {
    await unlinkMercury('delete');
    expect(deleteTokenMock).toHaveBeenCalledTimes(1);
    expect(readTokenMock).toHaveBeenCalledTimes(1);
    expect(getMercuryConnection()).toBeNull();
    expect(getMercuryLinkedAccounts()).toEqual([]);
  });
});
