import {
  deriveMercuryTransactionType,
  deriveMercuryTransactionDate,
  parseMercuryTimestamp,
  composeMercuryNote,
  isMercuryAnomalyRow,
  isEligibleMercuryTransaction,
  linkMercuryAccount,
  MERCURY_BACKFILL_DAYS,
  MERCURY_EXPENSE_CATEGORY_NAME,
  MERCURY_INCOME_CATEGORY_NAME,
} from './mercuryImport';
import type { MercuryApiTransaction } from './mercuryApi';
import { fetchMercuryTransactions } from './mercuryApi';
import {
  addTransaction,
  deleteAccount,
  deleteTransaction,
  getAccountById,
  getAccounts,
  getTransactions,
  updateAccount,
  updateTransaction,
} from '../db/storage';
import {
  getMercuryLinkedAccounts,
  getMercuryTransactionLinks,
  hasMercuryImportedTransaction,
  putMercuryTransactionLink,
} from '../db/mercury';
import { generateId, generateTransactionId, getStore } from '../db/tinybase';
import * as storageModule from '../db/storage';
import * as mercuryDb from '../db/mercury';

jest.mock('../db/tinybase', () => ({
  isDatabaseReady: jest.fn(() => true),
  getStore: jest.fn(),
  saveStore: jest.fn(async () => {}),
  generateId: jest.fn(),
  generateTransactionId: jest.fn(),
}));

// The import path is mocked so no fetch machinery runs, while the real
// client stays reachable through requireActual for the pagination tests.
jest.mock('./mercuryApi', () => ({
  ...jest.requireActual('./mercuryApi'),
  fetchMercuryTransactions: jest.fn(),
}));

const fetchMock = fetchMercuryTransactions as jest.Mock;
const getStoreMock = getStore as jest.Mock;
const generateIdMock = generateId as jest.Mock;
const generateTransactionIdMock = generateTransactionId as jest.Mock;

type Row = Record<string, unknown>;

// Minimal in-memory stand-in for the TinyBase store API used here. It
// reproduces the truthy-{} trap of the real store for getRow()/getTable()
// and the undefined reads of getCell() for missing rows, which is exactly
// the surface the getters in mercury.ts and storage.ts rely on.
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

beforeEach(() => {
  store = new FakeStore();
  getStoreMock.mockReturnValue(store);
  jest.clearAllMocks();
  let accountId = 0;
  let txId = 0;
  generateIdMock.mockImplementation(() => `generated-${++accountId}`);
  generateTransactionIdMock.mockImplementation(() => `local-${++txId}`);
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

function seedManualAccount(id: string, balance = 0) {
  store.setRow('accounts', id, {
    name: 'Manual account',
    icon: 'wallet',
    description: null,
    balance,
    order: 0,
    currency: 'USD',
    source: 'manual',
  });
}

function localRow(localTransactionId: string) {
  return store.getRow('transactions', localTransactionId);
}

function linkedCategoryRows(type: 'income' | 'expense') {
  return Object.values(store.getTable('categories')).filter(
    (category) => category.type === type,
  );
}

function seedLinkedAccount() {
  store.setRow('accounts', 'acc-managed', {
    name: 'Mercury Checking',
    icon: 'landmark',
    description: null,
    balance: 999990,
    order: 0,
    currency: 'USD',
    source: 'mercury',
  });
  store.setRow('transactions', 'tx-imported', {
    type: 'expense',
    categoryId: null,
    subcategoryId: null,
    subcategoryName: null,
    categoryName: null,
    categoryIcon: null,
    categoryType: null,
    accountId: 'acc-managed',
    accountName: 'Mercury Checking',
    toAccountId: null,
    toAccountName: null,
    note: 'Coffee Shop',
    description: null,
    amount: -9.01,
    currency: 'USD',
    toCurrency: null,
    toAmount: null,
    date: Date.parse('2026-11-02T10:00:00Z'),
    imagePath: null,
  });
  putMercuryTransactionLink({
    id: 'mtx-imported',
    localTransactionId: 'tx-imported',
    mercuryAccountId: 'acct-1',
    anomaly: false,
  });
}

describe('sign to type', () => {
  it('derives expense from a negative amount and income from a positive one', () => {
    expect(deriveMercuryTransactionType(-19005)).toBe('expense');
    expect(deriveMercuryTransactionType(9.01)).toBe('income');
    expect(deriveMercuryTransactionType(-0.27)).toBe('expense');
    expect(deriveMercuryTransactionType(0)).toBe('income');
  });
});

describe('date mapping', () => {
  it('uses postedAt and falls back to createdAt', () => {
    const tx = mercuryRow({
      postedAt: '2026-11-02T10:00:00Z',
      createdAt: '2026-11-01T10:00:00Z',
    });
    expect(deriveMercuryTransactionDate(tx)).toBe(
      Date.parse('2026-11-02T10:00:00Z'),
    );
    expect(
      deriveMercuryTransactionDate(mercuryRow({ postedAt: null })),
    ).toBe(Date.parse('2026-11-01T10:00:00Z'));
  });

  it('rejects the Go zero-time sentinel instead of storing a year-1 date', () => {
    const tx = mercuryRow({
      postedAt: '0001-01-01T00:00:00Z',
      createdAt: '2026-11-01T10:00:00Z',
    });
    expect(deriveMercuryTransactionDate(tx)).toBe(Date.parse('2026-11-01T10:00:00Z'));
  });

  it('normalizes variable-length fractional seconds before parsing', () => {
    expect(parseMercuryTimestamp('2026-11-20T21:20:09.13752Z')).toBe(
      Date.parse('2026-11-20T21:20:09.137Z'),
    );
    expect(parseMercuryTimestamp('2026-11-20T21:20:09.432485Z')).toBe(
      Date.parse('2026-11-20T21:20:09.432Z'),
    );
    expect(parseMercuryTimestamp(null)).toBeNull();
  });
});

describe('note composition and truncation', () => {
  it('joins counterparty, bank description, and note in order', () => {
    const tx = mercuryRow({
      counterpartyName: 'Coffee Shop',
      bankDescription: 'BANK DATA 123',
      note: 'Team offsite',
    });
    expect(composeMercuryNote(tx)).toBe('Coffee Shop · BANK DATA 123 · Team offsite');
  });

  it('keeps only the parts that exist and stores an empty result as null', () => {
    expect(composeMercuryNote(mercuryRow({ bankDescription: 'ACH' }))).toBe('Coffee Shop · ACH');
    expect(composeMercuryNote(mercuryRow({ counterpartyName: null }))).toBeNull();
    expect(composeMercuryNote(mercuryRow({ counterpartyName: '  ' }))).toBeNull();
  });

  it('stores long notes verbatim, like hand-entered notes', () => {
    const longNote = 'x'.repeat(2000);
    expect(
      composeMercuryNote(mercuryRow({ counterpartyName: null, note: longNote })),
    ).toBe(longNote);
  });

  it('appends nothing to the note for FX rows: the anomaly flag replaces it', () => {
    const fx = mercuryRow({
      currencyExchangeInfo: {
        convertedFromCurrency: 'USD',
        convertedToCurrency: 'EUR',
        convertedFromAmount: 100,
        convertedToAmount: 92,
        exchangeRate: 0.92,
        feeAmount: 0,
        feePercentage: 0,
        feeTransactionId: null,
      },
      note: 'wire',
    });
    expect(composeMercuryNote(fx)).toBe('Coffee Shop · wire');
  });
});

describe('anomaly rows', () => {
  it('flags currencyExchangeInfo and non-USD merchant currency, nothing else', () => {
    expect(isMercuryAnomalyRow(mercuryRow({ currencyExchangeInfo: {} }))).toBe(true);
    expect(
      isMercuryAnomalyRow(mercuryRow({ merchant: { currency: 'EUR' } })),
    ).toBe(true);
    expect(
      isMercuryAnomalyRow(mercuryRow({ merchant: { currency: 'USD' } })),
    ).toBe(false);
    expect(isMercuryAnomalyRow(mercuryRow({}))).toBe(false);
    expect(isMercuryAnomalyRow(mercuryRow({ merchant: {} }))).toBe(false);
  });
});

describe('eligibility filtering and transfer exclusion', () => {
  it('imports only sent rows on the linked account with a usable amount', () => {
    expect(isEligibleMercuryTransaction(mercuryRow({}), 'acct-1')).toBe(true);
    expect(isEligibleMercuryTransaction(mercuryRow({ status: 'pending' }), 'acct-1')).toBe(false);
    expect(isEligibleMercuryTransaction(mercuryRow({ status: 'failed' }), 'acct-1')).toBe(false);
    expect(isEligibleMercuryTransaction(mercuryRow({ status: 'cancelled' }), 'acct-1')).toBe(false);
    expect(
      isEligibleMercuryTransaction(mercuryRow({ accountId: 'acct-other' }), 'acct-1'),
    ).toBe(false);
    expect(isEligibleMercuryTransaction(mercuryRow({ amount: null }), 'acct-1')).toBe(false);
  });

  it('excludes internal and treasury transfers but keeps every other kind', () => {
    expect(
      isEligibleMercuryTransaction(mercuryRow({ kind: 'internalTransfer' }), 'acct-1'),
    ).toBe(false);
    expect(
      isEligibleMercuryTransaction(mercuryRow({ kind: 'treasuryTransfer' }), 'acct-1'),
    ).toBe(false);
    expect(
      isEligibleMercuryTransaction(mercuryRow({ kind: 'externalTransfer' }), 'acct-1'),
    ).toBe(true);
    expect(
      isEligibleMercuryTransaction(mercuryRow({ kind: 'wireFee' }), 'acct-1'),
    ).toBe(true);
  });
});

describe('linking one account and its backfill', () => {
  beforeEach(() => {
    store.setValue('isPremium', 'true');
  });

  function seedCategories() {
    store.setRow('categories', 'cat-food', {
      name: 'Food',
      icon: 'utensils',
      type: 'expense',
      order: 0,
    });
    store.setRow('categories', 'cat-salary', {
      name: 'SALARY',
      icon: 'briefcase',
      type: 'income',
      order: 1,
    });
  }

  it('creates the managed account one-to-one and imports the window verbatim', async () => {
    seedCategories();
    fetchMock.mockResolvedValue([
      mercuryRow({
        id: 'mtx-out',
        amount: -9.01,
        kind: 'outgoingPayment',
        counterpartyName: 'Coffee Shop',
        bankDescription: 'BANK DATA 123',
        note: null,
        mercuryCategory: 'Food',
      }),
      mercuryRow({
        id: 'mtx-in',
        amount: 500,
        kind: 'checkDeposit',
        counterpartyName: 'Client',
        mercuryCategory: null,
      }),
    ]);

    const summary = await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Mercury *** ••***',
      currentBalance: 999990,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'secret-token:abc',
      'acct-1',
      { start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    );

    const linked = getMercuryLinkedAccounts().find((account) => account.id === 'acct-1');
    expect(linked).toMatchObject({
      localAccountId: expect.any(String),
      enabled: true,
      currency: 'USD',
      mixedCurrency: false,
      cursorWindowDays: MERCURY_BACKFILL_DAYS,
      stale: false,
      lastError: null,
    });

    const accounts = await getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      name: 'Mercury *** ••***',
      icon: 'landmark',
      currency: 'USD',
      balance: 999990,
      source: 'mercury',
    });

    // Debit: negative amount verbatim, expense, composed note.
    const expense = localRow('local-1')!;
    expect(expense).toMatchObject({
      type: 'expense',
      amount: -9.01,
      currency: 'USD',
      accountId: accounts[0].id,
      accountName: 'Mercury *** ••***',
      note: 'Coffee Shop · BANK DATA 123',
      categoryId: 'cat-food',
      categoryName: 'Food',
      categoryType: 'expense',
      subcategoryId: null,
      description: null,
      imagePath: null,
    });

    // Credit: positive amount, income, unmatched category lands in the
    // tagged income category.
    const income = localRow('local-2')!;
    expect(income).toMatchObject({
      type: 'income',
      amount: 500,
      currency: 'USD',
      categoryName: MERCURY_INCOME_CATEGORY_NAME,
    });

    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual([
      'mtx-out',
      'mtx-in',
    ]);
    expect(summary).toEqual({ imported: 2, skipped: 0, anomalyRows: 0 });
  });

  it('matches categories case-insensitively by name within the same type', async () => {
    seedCategories();
    fetchMock.mockResolvedValue([
      // Matches the expense category even though Mercury uppercases it.
      mercuryRow({ id: 'mtx-a', amount: -5, categoryData: { name: 'FOOD' } }),
      // An income row whose category name only exists as an expense type:
      // no cross-type match, so the tagged income category is used.
      mercuryRow({ id: 'mtx-b', amount: 5, categoryData: { name: 'food' } }),
    ]);

    await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 10,
    });

    expect(localRow('local-1')).toMatchObject({ type: 'expense' });
    expect(localRow('local-1')!.categoryId).toBe('cat-food');
    expect(localRow('local-2')).toMatchObject({
      categoryName: MERCURY_INCOME_CATEGORY_NAME,
      type: 'income',
    });

    // Only the one tagged income category was created; Food was matched, not
    // duplicated.
    expect(Object.keys(store.getTable('categories'))).toHaveLength(3);
    expect(
      Object.values(store.getTable('categories')).filter((c) => c.name === 'Food'),
    ).toHaveLength(1);
  });

  it('creates each tagged category once across unmatched rows', async () => {
    fetchMock.mockResolvedValue([
      mercuryRow({ id: 'mtx-a', amount: -5 }),
      mercuryRow({ id: 'mtx-b', amount: -7, counterpartyName: 'Other' }),
      mercuryRow({ id: 'mtx-c', amount: 1, counterpartyName: 'Grant' }),
    ]);

    await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 1,
    });

    expect(linkedCategoryRows('expense').filter(
      (c) => c.name === MERCURY_EXPENSE_CATEGORY_NAME,
    )).toHaveLength(1);
    expect(linkedCategoryRows('income').filter(
      (c) => c.name === MERCURY_INCOME_CATEGORY_NAME,
    )).toHaveLength(1);
    expect(linkedCategoryRows('expense')).toHaveLength(1);
    expect(linkedCategoryRows('income')).toHaveLength(1);
  });

  it('flags FX rows on their links and on the account, never converting the amount', async () => {
    fetchMock.mockResolvedValue([
      mercuryRow({
        id: 'mtx-fx',
        amount: -190.05,
        currencyExchangeInfo: { exchangeRate: 0.92 },
        merchant: { currency: 'EUR' },
      }),
      mercuryRow({ id: 'mtx-plain' }),
    ]);

    const summary = await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 888,
    });

    expect(summary).toEqual({ imported: 2, skipped: 0, anomalyRows: 1 });
    const links = getMercuryTransactionLinks();
    expect(links.find((link) => link.id === 'mtx-fx')).toMatchObject({ anomaly: true });
    expect(links.find((link) => link.id === 'mtx-plain')).toMatchObject({ anomaly: false });

    // Verbatim amount, constant USD: no conversion anywhere.
    expect(localRow('local-1')).toMatchObject({ amount: -190.05, currency: 'USD' });
    expect(localRow('local-2')).toMatchObject({ currency: 'USD' });
    expect(getMercuryLinkedAccounts()[0].mixedCurrency).toBe(true);

    // The flag is lifetime over the account's links: a rerun that imports
    // nothing new (everything is already linked) must not clear it.
    const rerun = await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 888,
    });
    expect(rerun).toEqual({ imported: 0, skipped: 2, anomalyRows: 0 });
    expect(getMercuryLinkedAccounts()[0].mixedCurrency).toBe(true);
  });

  it('re-runs without duplicating anything: links are the dedupe map', async () => {
    fetchMock.mockResolvedValue([
      mercuryRow({ id: 'mtx-out', amount: -9.01 }),
      mercuryRow({ id: 'mtx-in', amount: 500 }),
    ]);

    const first = await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 500,
    });
    expect(first).toEqual({ imported: 2, skipped: 0, anomalyRows: 0 });

    const second = await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 500,
    });
    expect(second).toEqual({ imported: 0, skipped: 2, anomalyRows: 0 });
    expect(Object.keys(store.getTable('transactions'))).toHaveLength(2);
    expect(getMercuryTransactionLinks()).toHaveLength(2);
    // The local account was reused, not created twice.
    expect(await getAccounts()).toHaveLength(1);
  });

  it('records the import window on the linked account', async () => {
    fetchMock.mockResolvedValue([]);
    await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 0,
    });
    expect(getMercuryLinkedAccounts()[0].cursorWindowDays).toBe(MERCURY_BACKFILL_DAYS);
    expect(getMercuryLinkedAccounts()[0].lastSyncedAt).toEqual(expect.any(Number));
  });
});

describe('balance isolation for linked accounts', () => {
  it('leaves the mirrored balance alone when the import adds rows', async () => {
    seedLinkedAccount();
    await addTransaction({
      type: 'expense',
      accountId: 'acc-managed',
      accountName: 'Mercury Checking',
      amount: -100,
      currency: 'USD',
      date: new Date(),
    });
    expect((await getAccounts())[0].balance).toBe(999990);
  });

  it('leaves the mirrored balance alone when the user targets it directly', async () => {
    seedLinkedAccount();
    await addTransaction({
      type: 'income',
      accountId: 'acc-managed',
      accountName: 'Mercury Checking',
      amount: 100,
      currency: 'USD',
      date: new Date(),
    });
    expect((await getAccounts())[0].balance).toBe(999990);
  });

  it('leaves the mirrored balance alone on edit of an imported row', async () => {
    seedLinkedAccount();
    await updateTransaction('tx-imported', { amount: -50, note: 'Edited' });
    expect((await getAccounts())[0].balance).toBe(999990);
    expect(localRow('tx-imported')).toMatchObject({ amount: -50, note: 'Edited' });
  });

  it('leaves both sides alone when an imported row moves to a manual account', async () => {
    seedLinkedAccount();
    seedManualAccount('acc-manual', 50);
    await updateTransaction('tx-imported', {
      accountId: 'acc-manual',
      accountName: 'Manual account',
    });
    const accounts = await getAccounts();
    // Neither side moves: the row was counted inside the mirror at import,
    // so moving it must not start counting it elsewhere either.
    expect(accounts.find((a) => a.id === 'acc-managed')?.balance).toBe(999990);
    expect(accounts.find((a) => a.id === 'acc-manual')?.balance).toBe(50);
  });

  it('leaves the mirrored balance alone on delete of an imported row', async () => {
    seedLinkedAccount();
    await deleteTransaction('tx-imported');
    expect((await getAccounts())[0].balance).toBe(999990);
    // The link row survives so a later sync does not re-import the row
    // behind the user's back; unlinking is the mapping flow's job.
    expect(hasMercuryImportedTransaction('tx-imported')).toBe(true);
  });

  it('keeps manual accounts working: create, edit, and delete still move balances', async () => {
    seedManualAccount('acc-manual', 100);
    const created = await addTransaction({
      type: 'expense',
      accountId: 'acc-manual',
      accountName: 'Manual account',
      amount: -30,
      currency: 'USD',
      date: new Date(),
    });
    expect((await getAccounts())[0].balance).toBe(70);

    await updateTransaction(created.id, { amount: -10 });
    expect((await getAccounts())[0].balance).toBe(90);

    await deleteTransaction(created.id);
    expect((await getAccounts())[0].balance).toBe(100);
  });
});

describe('locked linked accounts', () => {
  it('keeps the name and currency of a linked account on update', async () => {
    store.setRow('accounts', 'acc-managed', {
      name: 'Mercury Checking',
      icon: 'landmark',
      description: null,
      balance: 100,
      order: 0,
      currency: 'USD',
      source: 'mercury',
    });
    const updated = await updateAccount('acc-managed', {
      name: 'Renamed',
      currency: 'EUR',
      description: 'Mine now',
    });
    expect(updated).toMatchObject({ name: 'Mercury Checking', currency: 'USD' });
    expect((await getAccounts())[0].description).toBe('Mine now');
  });

  it('refuses to delete a linked account', async () => {
    store.setRow('accounts', 'acc-managed', {
      name: 'Mercury Checking',
      icon: 'landmark',
      description: null,
      balance: 100,
      order: 0,
      currency: 'USD',
      source: 'mercury',
    });
    await expect(deleteAccount('acc-managed')).rejects.toThrow(/cannot be deleted/);
    expect((await getAccounts())).toHaveLength(1);
  });
});

describe('read model anomaly flag', () => {
  it('stores an anomaly row and keeps it out of a totals computation', async () => {
    seedLinkedAccount();
    // The imported row is anomalous: flag its link row.
    await putMercuryTransactionLink({
      id: 'mtx-imported',
      localTransactionId: 'tx-imported',
      mercuryAccountId: 'acct-1',
      anomaly: true,
    });
    // Make the imported row an income row so a naive income total would
    // include it.
    store.setRow('transactions', 'tx-imported', {
      ...store.getRow('transactions', 'tx-imported'),
      type: 'income',
      amount: 9.01,
    });
    seedManualAccount('acc-manual', 0);
    store.setRow('transactions', 'tx-manual', {
      type: 'income',
      categoryId: null,
      subcategoryId: null,
      subcategoryName: null,
      categoryName: null,
      categoryIcon: null,
      categoryType: null,
      accountId: 'acc-manual',
      accountName: 'Manual account',
      toAccountId: null,
      toAccountName: null,
      note: null,
      description: null,
      amount: 40,
      currency: 'USD',
      toCurrency: null,
      toAmount: null,
      date: Date.parse('2026-11-02T10:00:00Z'),
      imagePath: null,
    });

    const transactions = await getTransactions();
    expect(transactions.find((tx) => tx.id === 'tx-imported')).toMatchObject({
      anomaly: true,
    });
    expect(transactions.find((tx) => tx.id === 'tx-manual')).toMatchObject({
      anomaly: false,
    });

    // The totals pattern every aggregation surface uses: filter the anomaly
    // flag out before summing. The row itself stays in the read model.
    const incomeTotal = transactions
      .filter((tx) => tx.type === 'income' && !tx.anomaly)
      .reduce((sum, tx) => sum + tx.amount, 0);
    expect(incomeTotal).toBe(40);
  });
});

describe('dangling local account guard', () => {
  it('reads a missing account as undefined despite the truthy-{} getRow trap', async () => {
    // The FakeStore reproduces TinyBase's truthy-{} for a missing getRow.
    expect(store.getRow('accounts', 'never-written')).toEqual({});
    expect(await getAccountById('never-written')).toBeUndefined();
  });
});

describe('link write failure rollback', () => {
  it('rolls the local transaction back when its link write fails', async () => {
    fetchMock.mockResolvedValue([mercuryRow({ id: 'mtx-1', amount: -9.01 })]);
    const putLinkSpy = jest.spyOn(mercuryDb, 'putMercuryTransactionLink')
      .mockRejectedValueOnce(new Error('link write failed'));

    await expect(
      linkMercuryAccount('secret-token:abc', {
        id: 'acct-1',
        name: 'Checking',
        currentBalance: 1,
      }),
    ).rejects.toThrow('link write failed');

    // No orphan transaction and no partial link: a retry can import again.
    expect(Object.keys(store.getTable('transactions'))).toHaveLength(0);
    expect(Object.keys(store.getTable('mercuryTransactionLinks'))).toHaveLength(0);
    // The mirrored balance never moved during the failed pair.
    expect((await getAccounts())[0]).toMatchObject({ balance: 1, source: 'mercury' });
    // The linked-account row records the failure for the retry affordance.
    expect(getMercuryLinkedAccounts()[0]).toMatchObject({
      stale: true,
      lastError: 'link write failed',
    });
    expect(putLinkSpy).toHaveBeenCalledTimes(1);
  });
});

describe('category creation free-cap fallback', () => {
  it('stops retrying category creation after the cap rejects once', async () => {
    for (let i = 0; i < 10; i++) {
      store.setRow('categories', `cat-${i}`, {
        name: `Category ${i}`,
        icon: 'wallet',
        type: 'expense',
        order: i,
      });
    }
    store.setValue('isPremium', 'false');
    const addCategorySpy = jest.spyOn(storageModule, 'addCategory');

    fetchMock.mockResolvedValue([
      mercuryRow({ id: 'mtx-a', amount: -5 }),
      mercuryRow({ id: 'mtx-b', amount: -6 }),
      mercuryRow({ id: 'mtx-c', amount: 1 }),
    ]);

    const summary = await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 0,
    });

    // Every row still imports; unmatched rows land uncategorized.
    expect(summary).toEqual({ imported: 3, skipped: 0, anomalyRows: 0 });
    expect(localRow('local-1')).toMatchObject({ categoryId: null });
    expect(localRow('local-3')).toMatchObject({ categoryId: null });
    // One attempt per tagged category kind, not one per unmatched row: the
    // cached null is honored (the old falsy check would retry per row).
    expect(addCategorySpy).toHaveBeenCalledTimes(2);
    addCategorySpy.mockRestore();
  });
});

describe('transactions pagination', () => {
  const realMercuryApi = jest.requireActual('./mercuryApi') as typeof import('./mercuryApi');
  const originalFetch = global.fetch;

  function pageRows(offset: number, count: number): Record<string, unknown>[] {
    return Array.from({ length: count }, (_unused, i) => ({
      id: `mtx-${offset + i}`,
      amount: 1,
      status: 'sent',
      kind: 'other',
      createdAt: '2026-11-01T10:00:00Z',
      postedAt: '2026-11-01T10:00:00Z',
      accountId: 'acct-1',
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
  });

  it('walks pages of 500 and stops on a short page', async () => {
    const fetchMockForPages = jest.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get('offset') ?? '0');
      return offset === 0
        ? jsonResponse({ total: 620, transactions: pageRows(0, 500) })
        : jsonResponse({ total: 620, transactions: pageRows(500, 120) });
    });
    global.fetch = fetchMockForPages as unknown as typeof fetch;

    const rows = await realMercuryApi.fetchMercuryTransactions('secret-token:abc', 'acct-1', {
      start: '2026-08-23',
    });

    expect(rows).toHaveLength(620);
    expect(rows[0].id).toBe('mtx-0');
    expect(rows[619].id).toBe('mtx-619');
    expect(fetchMockForPages).toHaveBeenCalledTimes(2);
    expect(String(fetchMockForPages.mock.calls[0][0])).toContain('limit=500');
    expect(String(fetchMockForPages.mock.calls[0][0])).toContain('start=2026-08-23');
    expect(String(fetchMockForPages.mock.calls[0][0])).toContain('offset=0');
    expect(String(fetchMockForPages.mock.calls[1][0])).toContain('offset=500');
  });

  it('returns a page once when a server ignores the offset instead of looping', async () => {
    const identical = pageRows(0, 500);
    const fetchMockForPages = jest.fn(async () => jsonResponse({ transactions: identical }));
    global.fetch = fetchMockForPages as unknown as typeof fetch;

    const rows = await realMercuryApi.fetchMercuryTransactions('secret-token:abc', 'acct-1', {
      start: '2026-08-23',
    });

    expect(rows).toHaveLength(500);
    expect(new Set(rows.map((tx) => tx.id)).size).toBe(500);
    expect(fetchMockForPages).toHaveBeenCalledTimes(2);
  });

  it('keeps walking when a full page loses rows to id-dropping', async () => {
    // 500 raw rows of which one has no id: the raw page length, not the
    // parsed count, decides whether the walk continues.
    const firstPage = [...pageRows(0, 499), { accountId: 'acct-1', amount: 1 }];
    const fetchMockForPages = jest.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get('offset') ?? '0');
      return offset === 0
        ? jsonResponse({ total: 510, transactions: firstPage })
        : jsonResponse({ total: 510, transactions: pageRows(500, 10) });
    });
    global.fetch = fetchMockForPages as unknown as typeof fetch;

    const rows = await realMercuryApi.fetchMercuryTransactions('secret-token:abc', 'acct-1', {
      start: '2026-08-23',
    });

    expect(rows).toHaveLength(509);
    expect(fetchMockForPages).toHaveBeenCalledTimes(2);
  });
});
