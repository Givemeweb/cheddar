import JSZip from 'jszip';
import { importDatabaseFromZip } from './backup';
import { importFromMMBak } from './mmbakImport.native';
import { LimitReachedError } from '../db/premium';
import { getStore } from '../db/tinybase';

jest.mock('../db/tinybase', () => ({
  isDatabaseReady: jest.fn(() => true),
  getStore: jest.fn(),
  getPersister: jest.fn(async () => ({ save: jest.fn(async () => {}) })),
  saveStore: jest.fn(async () => {}),
  generateId: jest.fn(),
}));

// Rows the fake Money Manager database returns; each test swaps them.
let mockMMData: {
  categories: unknown[];
  accounts: unknown[];
  transactions: unknown[];
} = { categories: [], accounts: [], transactions: [] };

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    getAllSync: (sql: string) => {
      if (sql.includes('ZCATEGORY')) return mockMMData.categories;
      if (sql.includes('ASSETS')) return mockMMData.accounts;
      if (sql.includes('INOUTCOME')) return mockMMData.transactions;
      return [];
    },
    closeSync: jest.fn(),
  })),
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' }, document: 'file:///documents/' },
  File: jest.fn().mockImplementation(() => ({
    exists: true,
    size: 1024,
    bytes: jest.fn(async () => new Uint8Array()),
    write: jest.fn(),
    delete: jest.fn(),
  })),
}));

const getStoreMock = getStore as jest.Mock;

// Minimal in-memory stand-in for the TinyBase store API used by the importers.
// (TinyBase ships ESM only, which the test transform does not handle.)
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

  getValue(key: string) {
    return this.values[key];
  }

  setValue(key: string, value: unknown) {
    this.values[key] = value;
  }
}

let store: FakeStore;

beforeEach(() => {
  store = new FakeStore();
  getStoreMock.mockReturnValue(store);
  mockMMData = { categories: [], accounts: [], transactions: [] };
});

function seedExistingData() {
  store.setTables({
    accounts: { 'existing-account': { name: 'Existing', balance: 42 } },
    categories: {},
    transactions: { 'existing-tx': { amount: 42 } },
  });
}

function assertUntouched(before: Tables) {
  expect(store.getTables()).toEqual(before);
}

function mmCategories(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ID: i + 1,
    uid: `mm-category-${i + 1}`,
    NAME: `Category ${i + 1}`,
    TYPE: 1,
    ORDERSEQ: i,
    pUid: 0,
    C_IS_DEL: 0,
  }));
}

function mmAccounts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ID: i + 1,
    uid: `mm-account-${i + 1}`,
    NIC_NAME: `Account ${i + 1}`,
    ORDERSEQ: i,
    currencyUid: 'eur',
  }));
}

/** A backup.zip with a backup.sql file containing the given row counts. */
async function backupZip(accounts: number, categories: number): Promise<string> {
  const statements: string[] = ['-- Cheddar Backup SQL'];

  for (let i = 1; i <= categories; i++) {
    statements.push(
      `INSERT INTO categories (id, name, icon, type) VALUES ('category-${i}', 'Category ${i}', 'circle', 'expense')`,
    );
  }
  for (let i = 1; i <= accounts; i++) {
    statements.push(
      `INSERT INTO accounts (id, name, icon, description, balance, \`order\`, currency) VALUES ('account-${i}', 'Account ${i}', 'wallet', NULL, 0, ${i - 1}, 'EUR')`,
    );
  }
  statements.push(
    "INSERT INTO transactions (id, type, categoryId, subcategoryId, subcategoryName, categoryName, categoryIcon, categoryType, accountId, accountName, toAccountId, toAccountName, note, description, amount, currency, date, imagePath) VALUES ('tx-1', 'expense', 'category-1', NULL, NULL, 'Category 1', 'circle', 'expense', 'account-1', 'Account 1', NULL, NULL, NULL, NULL, -5, 'EUR', 1750000000000, NULL)",
  );

  const zip = new JSZip();
  zip.file('backup.sql', statements.join(';\n') + ';\n');
  return zip.generateAsync({ type: 'base64' });
}

describe('backup restore pre-scan', () => {
  it('rejects a free-user restore over the account cap and writes nothing', async () => {
    seedExistingData();
    const before = structuredClone(store.getTables());

    const restore = importDatabaseFromZip(await backupZip(4, 3));
    await expect(restore).rejects.toBeInstanceOf(LimitReachedError);
    await expect(restore).rejects.toMatchObject({
      resource: 'accounts',
      limit: 3,
    });
    assertUntouched(before);
  });

  it('rejects a free-user restore over the category cap and writes nothing', async () => {
    seedExistingData();
    const before = structuredClone(store.getTables());

    const restore = importDatabaseFromZip(await backupZip(3, 11));
    await expect(restore).rejects.toBeInstanceOf(LimitReachedError);
    await expect(restore).rejects.toMatchObject({
      resource: 'categories',
      limit: 10,
    });
    assertUntouched(before);
  });

  it('restores a file within both caps', async () => {
    const result = await importDatabaseFromZip(await backupZip(3, 10));

    expect(result).toMatchObject({
      accounts: 3,
      categories: 10,
      transactions: 1,
    });
    expect(Object.keys(store.getTables().accounts)).toHaveLength(3);
    expect(Object.keys(store.getTables().categories)).toHaveLength(10);
  });

  it('lets premium users restore past the caps', async () => {
    store.setValue('isPremium', 'true');

    const result = await importDatabaseFromZip(await backupZip(5, 12));

    expect(result).toMatchObject({ accounts: 5, categories: 12 });
    expect(Object.keys(store.getTables().accounts)).toHaveLength(5);
    expect(Object.keys(store.getTables().categories)).toHaveLength(12);
  });
});

describe('Money Manager import pre-scan', () => {
  it('rejects a free-user import over the account cap and writes nothing', async () => {
    seedExistingData();
    const before = structuredClone(store.getTables());
    mockMMData = {
      categories: mmCategories(3),
      accounts: mmAccounts(4),
      transactions: [],
    };

    const attempt = importFromMMBak('file:///backup.mmbak');
    await expect(attempt).rejects.toBeInstanceOf(LimitReachedError);
    await expect(attempt).rejects.toMatchObject({
      resource: 'accounts',
      limit: 3,
    });
    assertUntouched(before);
  });

  it('rejects a free-user import over the category cap and writes nothing', async () => {
    seedExistingData();
    const before = structuredClone(store.getTables());
    mockMMData = {
      categories: mmCategories(11),
      accounts: mmAccounts(3),
      transactions: [],
    };

    const attempt = importFromMMBak('file:///backup.mmbak');
    await expect(attempt).rejects.toBeInstanceOf(LimitReachedError);
    await expect(attempt).rejects.toMatchObject({
      resource: 'categories',
      limit: 10,
    });
    assertUntouched(before);
  });

  it('imports a file within both caps', async () => {
    mockMMData = {
      categories: mmCategories(10),
      accounts: mmAccounts(3),
      transactions: [],
    };

    const result = await importFromMMBak('file:///backup.mmbak');

    expect(result).toMatchObject({ accounts: 3, categories: 10 });
    expect(Object.keys(store.getTables().accounts)).toHaveLength(3);
    expect(Object.keys(store.getTables().categories)).toHaveLength(10);
  });

  it('lets premium users import past the caps', async () => {
    store.setValue('isPremium', 'true');
    mockMMData = {
      categories: mmCategories(12),
      accounts: mmAccounts(5),
      transactions: [],
    };

    const result = await importFromMMBak('file:///backup.mmbak');

    expect(result).toMatchObject({ accounts: 5, categories: 12 });
    expect(Object.keys(store.getTables().accounts)).toHaveLength(5);
    expect(Object.keys(store.getTables().categories)).toHaveLength(12);
  });
});
