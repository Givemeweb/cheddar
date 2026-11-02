import JSZip from 'jszip';
import { exportDatabaseToZip } from './backup';
import { getStore } from '../db/tinybase';

jest.mock('../db/tinybase', () => ({
  isDatabaseReady: jest.fn(() => true),
  getStore: jest.fn(),
  getPersister: jest.fn(async () => ({ save: jest.fn(async () => {}) })),
  saveStore: jest.fn(async () => {}),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

const mockWrites: Uint8Array[] = [];

jest.mock('expo-file-system', () => {
  class FakeFile {
    uri: string;
    exists = true;

    constructor(...parts: Array<string | { uri: string }>) {
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
