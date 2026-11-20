import JSZip from 'jszip';
import { exportDatabaseToZip, importDatabaseFromZip } from './backup';
import {
  putMercuryLinkedAccount,
  putMercuryTransactionLink,
  setMercuryCursor,
  setSyncDebounceTimestamp,
  upsertMercuryConnection,
} from '../db/mercury';
import { getStore } from '../db/tinybase';

jest.mock('../db/tinybase', () => ({
  isDatabaseReady: jest.fn(() => true),
  getStore: jest.fn(),
  getPersister: jest.fn(async () => ({ save: jest.fn(async () => {}) })),
  saveStore: jest.fn(async () => {}),
}));

jest.mock('../db/premium', () => ({
  assertImportWithinFreeCaps: jest.fn(async () => {}),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

const mockWrites: Uint8Array[] = [];

jest.mock('expo-file-system', () => {
  class FakeFile {
    uri: string;
    exists = true;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((part) => (typeof part === 'string' ? part : part.uri))
        .join('/');
    }

    async bytes() {
      return new Uint8Array();
    }

    write(bytes: Uint8Array) {
      mockWrites.push(bytes);
    }
  }

  return {
    Paths: { document: 'file:///documents' },
    File: FakeFile,
    Directory: class {},
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
}));

const getStoreMock = getStore as jest.Mock;
const LICENSE = 'ABCDEFGHJKMNPQRSTVWX';

type Row = Record<string, unknown>;
type Tables = Record<string, Record<string, Row>>;

class FakeStore {
  private tables: Tables = {};
  private values: Record<string, unknown> = {};

  getTables() {
    return this.tables;
  }

  setTables(tables: Tables) {
    this.tables = tables;
  }

  getTable(table: string) {
    return this.tables[table];
  }

  getRow(table: string, id: string) {
    return this.tables[table]?.[id];
  }

  setRow(table: string, id: string, row: Row) {
    (this.tables[table] ??= {})[id] = { ...row };
  }

  setCell(table: string, id: string, cell: string, value: unknown) {
    this.setRow(table, id, { ...(this.tables[table]?.[id] ?? {}), [cell]: value });
  }

  getValue(key: string) {
    return this.values[key];
  }

  setValue(key: string, value: unknown) {
    this.values[key] = value;
  }
}

beforeEach(() => {
  mockWrites.length = 0;
});

it('exports the finance tables without the license or the premium cache', async () => {
  const store = new FakeStore();
  store.setTables({
    categories: { '1': { name: 'Food', icon: 'utensils', type: 'expense' } },
    accounts: {
      '1': {
        name: 'Checking',
        icon: 'wallet',
        description: null,
        balance: 10,
        order: 0,
        currency: 'EUR',
      },
    },
    transactions: {},
  });
  store.setValue('satsaleLicense', LICENSE);
  store.setValue('isPremium', 'true');
  getStoreMock.mockReturnValue(store);

  await exportDatabaseToZip();

  expect(mockWrites).toHaveLength(1);
  const zip = await JSZip.loadAsync(mockWrites[0]);
  const sql = await zip.file('backup.sql')?.async('string');

  expect(sql).toContain('Checking');
  expect(sql).not.toContain(LICENSE);
  expect(sql).not.toContain('satsaleLicense');
  expect(sql).not.toContain('isPremium');
});

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function exportBackupToBase64(): Promise<string> {
  await exportDatabaseToZip();
  return bytesToBase64(mockWrites[0]);
}

async function seedMercuryState(store: FakeStore): Promise<void> {
  store.setTables({
    categories: { '1': { name: 'Food', icon: 'utensils', type: 'expense' } },
    accounts: {
      'acc-1': { name: 'Mercury Checking', icon: 'wallet', description: null, balance: 0, order: 0, currency: 'EUR', source: 'mercury' },
      'acc-2': { name: 'Manual Savings', icon: 'piggy-bank', description: null, balance: 0, order: 1, currency: 'EUR' },
    },
    transactions: {},
  });
  getStoreMock.mockReturnValue(store);

  await upsertMercuryConnection({ tokenStatus: 'active', createdAt: 1000, lastSyncedAt: 9000 });
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
  await putMercuryTransactionLink({
    id: 'mtx-1',
    localTransactionId: 'tx-1',
    mercuryAccountId: 'acct-abc',
    anomaly: true,
  });
  await setMercuryCursor('acct-abc', 'start_after:mtx-1');
  await setSyncDebounceTimestamp(5000);
}

describe('Mercury backup round trip', () => {
  it('exports connection, linked-account, link, cursor, and debounce data and restores them', async () => {
    const store = new FakeStore();
    await seedMercuryState(store);
    // A rogue cell that bypassed the write helpers must never reach the backup.
    store.setCell('mercuryConnection', 'default', 'token', 'secret-token-value');

    const zipBase64 = await exportBackupToBase64();
    const zip = await JSZip.loadAsync(mockWrites[0]);
    const sql = await zip.file('backup.sql')?.async('string');

    expect(sql).toContain('INSERT INTO mercuryConnection (id, tokenStatus, createdAt, lastSyncedAt)');
    expect(sql).not.toContain('secret-token-value');
    // tokenStatus is allowed; a bare token cell is not.
    expect(sql?.match(/token(?!Status)/gi)).toBeNull();
    expect(sql).toContain("'mercury'"); // the managed account marker
    expect(sql).toContain("'manual'"); // existing accounts default to manual

    const restored = new FakeStore();
    getStoreMock.mockReturnValue(restored);
    await importDatabaseFromZip(zipBase64);

    const tables = restored.getTables();
    expect(tables.mercuryConnection.default).toEqual({
      tokenStatus: 'needs_reauth', // restored connections must re-authenticate
      createdAt: 1000,
      lastSyncedAt: 9000,
    });
    expect(Object.keys(tables.mercuryConnection.default)).toEqual(['tokenStatus', 'createdAt', 'lastSyncedAt']);
    expect(tables.mercuryAccounts['acct-abc']).toEqual({
      localAccountId: 'acc-1',
      enabled: 'true',
      currency: 'USD',
      mixedCurrency: 'true',
      cursorWindowDays: 90,
      lastSyncedAt: 9000,
      stale: 'false',
      lastError: null,
    });
    expect(tables.mercuryTransactionLinks['mtx-1']).toEqual({
      localTransactionId: 'tx-1',
      mercuryAccountId: 'acct-abc',
      anomaly: 'true',
    });
    expect(tables.mercuryCursors['acct-abc']).toEqual({ cursor: 'start_after:mtx-1' });
    expect(tables.mercurySyncState.debounce).toEqual({ lastAttemptAt: 5000 });
    expect(tables.accounts['acc-1'].source).toBe('mercury');
    // An existing account without the marker restores as manual.
    expect(tables.accounts['acc-2'].source).toBe('manual');
  });

  it('marks a restored connection as needing re-authentication while links and cursors survive', async () => {
    const store = new FakeStore();
    await seedMercuryState(store);
    const zipBase64 = await exportBackupToBase64();

    const restored = new FakeStore();
    getStoreMock.mockReturnValue(restored);
    await importDatabaseFromZip(zipBase64);

    const tables = restored.getTables();
    expect(tables.mercuryConnection.default.tokenStatus).toBe('needs_reauth');
    // The dedupe map and cursors survive so reconnecting does not duplicate rows.
    expect(tables.mercuryTransactionLinks['mtx-1']).toMatchObject({ localTransactionId: 'tx-1', mercuryAccountId: 'acct-abc' });
    expect(tables.mercuryCursors['acct-abc']).toMatchObject({ cursor: 'start_after:mtx-1' });
  });
});
