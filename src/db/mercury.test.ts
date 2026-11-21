import { clearAllData } from './storage';
import {
  getMercuryConnection,
  getMercuryLinkedAccounts,
  getMercuryTransactionLinks,
  getMercuryCursor,
  getSyncDebounceTimestamp,
  putMercuryLinkedAccount,
  putMercuryTransactionLink,
  setMercuryCursor,
  setSyncDebounceTimestamp,
  upsertMercuryConnection,
} from './mercury';
import { getDefaultTables } from './defaults';
import { getStore } from './tinybase';

jest.mock('./tinybase', () => ({
  isDatabaseReady: jest.fn(() => true),
  getStore: jest.fn(),
  saveStore: jest.fn(async () => {}),
  generateId: jest.fn(() => 'generated-id'),
}));

const getStoreMock = getStore as jest.Mock;

type Row = Record<string, unknown>;

// Minimal in-memory stand-in for the TinyBase store API used by these modules.
// (TinyBase ships ESM only, which the test transform does not handle.)
// Faithfulness matters: real TinyBase getRow() returns a truthy {} for a
// missing row, and the tests below rely on that trap being reproduced here.
class FakeStore {
  private tables: Record<string, Record<string, Row>> = {};

  getTables() {
    return this.tables;
  }

  setTables(tables: Record<string, Record<string, Row>>) {
    this.tables = { ...tables };
  }

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

  delTables() {
    this.tables = {};
  }
}

let store: FakeStore;

beforeEach(() => {
  store = new FakeStore();
  getStoreMock.mockReturnValue(store);
});

describe('mercury connection persistence', () => {
  it('reads a missing connection row as null, not a fabricated active row', () => {
    // Regression: TinyBase getRow() returns a truthy {} for a missing row,
    // which used to surface a fake tokenStatus 'active' connection with no
    // Connect action anywhere.
    expect(getMercuryConnection()).toBeNull();
  });

  it('still reads back the connection after an upsert', async () => {
    await upsertMercuryConnection({
      tokenStatus: 'active',
      createdAt: 11,
      lastSyncedAt: 22,
    });

    expect(getMercuryConnection()).toEqual({
      id: 'default',
      tokenStatus: 'active',
      createdAt: 11,
      lastSyncedAt: 22,
    });
  });

  it('never persists unknown cells, so a token cannot reach the database', async () => {
    const rogue = {
      tokenStatus: 'active',
      createdAt: 1000,
      token: 'secret-token',
    } as unknown as Parameters<typeof upsertMercuryConnection>[0];

    await upsertMercuryConnection(rogue);

    const row = store.getRow('mercuryConnection', 'default');
    expect(Object.keys(row ?? {})).toEqual(['tokenStatus', 'createdAt', 'lastSyncedAt']);
    expect(JSON.stringify(store.getTables())).not.toContain('secret-token');
  });

  it('keeps unspecified cells on a partial update and records the status', async () => {
    await upsertMercuryConnection({ createdAt: 1000 });
    await upsertMercuryConnection({ tokenStatus: 'needs_reauth' });

    expect(getMercuryConnection()).toEqual({
      id: 'default',
      tokenStatus: 'needs_reauth',
      createdAt: 1000,
      lastSyncedAt: null,
    });
  });
});

describe('missing rows read as absent everywhere', () => {
  it('reports no linked accounts, links, cursors, or debounce before any write', () => {
    // Same truthy-{} trap checked for the connection getter: these getters
    // go through getTable()/getCell(), whose missing results are empty.
    expect(getMercuryLinkedAccounts()).toEqual([]);
    expect(getMercuryTransactionLinks()).toEqual([]);
    expect(getMercuryCursor('never-written')).toBeNull();
    expect(getSyncDebounceTimestamp()).toBeNull();
  });
});

describe('mercury linked accounts and links', () => {
  it('stores flags as string cells and reads them back as booleans', async () => {
    await putMercuryLinkedAccount({
      id: 'acct-abc',
      localAccountId: 'acc-1',
      enabled: true,
      currency: 'USD',
      mixedCurrency: true,
      cursorWindowDays: 90,
      lastSyncedAt: 9000,
      stale: false,
      lastError: null,
    });

    expect(store.getRow('mercuryAccounts', 'acct-abc')).toEqual({
      localAccountId: 'acc-1',
      enabled: 'true',
      currency: 'USD',
      mixedCurrency: 'true',
      cursorWindowDays: 90,
      lastSyncedAt: 9000,
      stale: 'false',
      lastError: null,
    });
    expect(getMercuryLinkedAccounts()).toMatchObject([{
      id: 'acct-abc',
      enabled: true,
      mixedCurrency: true,
      stale: false,
      lastError: null,
    }]);
  });

  it('maps each Mercury transaction id to its local transaction and Mercury account', async () => {
    await putMercuryTransactionLink({
      id: 'mtx-1',
      localTransactionId: 'tx-1',
      mercuryAccountId: 'acct-abc',
      anomaly: false,
      mercuryCreatedAtMs: null,
    });

    expect(getMercuryTransactionLinks()).toEqual([{
      id: 'mtx-1',
      localTransactionId: 'tx-1',
      mercuryAccountId: 'acct-abc',
      anomaly: false,
      mercuryCreatedAtMs: null,
    }]);
  });

  it('persists and reads back the sync cursor and the debounce timestamp', async () => {
    expect(getMercuryCursor('acct-abc')).toBeNull();
    expect(getSyncDebounceTimestamp()).toBeNull();

    await setMercuryCursor('acct-abc', 'start_after:mtx-1');
    await setSyncDebounceTimestamp(5000);

    expect(getMercuryCursor('acct-abc')).toBe('start_after:mtx-1');
    expect(getSyncDebounceTimestamp()).toBe(5000);
  });
});

describe('reset', () => {
  it('removes every Mercury row and the managed marker, then reseeds defaults', async () => {
    store.setRow('accounts', 'acc-managed', {
      name: 'Mercury Checking',
      icon: 'wallet',
      description: null,
      balance: 100,
      order: 0,
      currency: 'USD',
      source: 'mercury',
    });
    await upsertMercuryConnection({ tokenStatus: 'active', createdAt: 1, lastSyncedAt: 2 });
    await putMercuryLinkedAccount({
      id: 'acct-abc',
      localAccountId: 'acc-managed',
      enabled: true,
      currency: 'USD',
      mixedCurrency: false,
      cursorWindowDays: 90,
      lastSyncedAt: 2,
      stale: false,
      lastError: null,
    });
    await putMercuryTransactionLink({
      id: 'mtx-1',
      localTransactionId: 'tx-1',
      mercuryAccountId: 'acct-abc',
      anomaly: false,
      mercuryCreatedAtMs: null,
    });
    await setMercuryCursor('acct-abc', 'start_after:mtx-1');
    await setSyncDebounceTimestamp(3);

    await clearAllData();
    expect(store.getTables()).toEqual({});

    // The reset screen reseeds through initDatabase(true), which writes this
    // same default data once the cleared store has no categories.
    store.setTables(getDefaultTables());

    const tables = store.getTables();
    expect(Object.keys(tables.accounts)).toHaveLength(3);
    Object.values(tables.accounts).forEach((account) => {
      expect(account.source).toBe('manual');
    });
    expect(Object.keys(tables.categories)).toHaveLength(10);
    expect(tables.transactions).toEqual({});
    expect(tables.mercuryConnection).toBeUndefined();
    expect(tables.mercuryAccounts).toBeUndefined();
    expect(tables.mercuryTransactionLinks).toBeUndefined();
    expect(tables.mercuryCursors).toBeUndefined();
    expect(tables.mercurySyncState).toBeUndefined();
  });
});
