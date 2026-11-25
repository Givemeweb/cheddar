import {
  deriveMercuryTransactionType,
  deriveMercuryTransactionDate,
  parseMercuryTimestamp,
  composeMercuryDescription,
  isMercuryAnomalyRow,
  isEligibleMercuryTransaction,
  linkMercuryAccount,
  linkMercuryAccounts,
  MercuryBatchBusyError,
  MERCURY_BACKFILL_DAYS,
  MERCURY_BACKFILL_WINDOW_CHOICES,
  MERCURY_EXPENSE_CATEGORY_NAME,
  MERCURY_INCOME_CATEGORY_NAME,
} from './mercuryImport';
import type { MercuryApiTransaction } from './mercuryApi';
import { fetchMercuryTransactions, MercuryIncompleteWindowError } from './mercuryApi';
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
  putMercuryLinkedAccount,
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
    // Pre-cell-style link: the sync's deletion pass spares these.
    mercuryCreatedAtMs: null,
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

describe('description composition and truncation', () => {
  it('joins the bank description and note in order', () => {
    const tx = mercuryRow({
      bankDescription: 'BANK DATA 123',
      note: 'Team offsite',
    });
    expect(composeMercuryDescription(tx)).toBe('BANK DATA 123 · Team offsite');
  });

  it('trims each part, drops empty parts, and stores an empty result as null', () => {
    expect(
      composeMercuryDescription(mercuryRow({ bankDescription: '  ACH  ', note: ' wire ' })),
    ).toBe('ACH · wire');
    expect(composeMercuryDescription(mercuryRow({ bankDescription: 'ACH' }))).toBe('ACH');
    expect(composeMercuryDescription(mercuryRow({ note: 'wire' }))).toBe('wire');
    expect(composeMercuryDescription(mercuryRow({ bankDescription: '   ' }))).toBeNull();
    expect(composeMercuryDescription(mercuryRow({}))).toBeNull();
  });

  it('never joins empty segments into double separators', () => {
    expect(
      composeMercuryDescription(mercuryRow({ bankDescription: null, note: '   ' })),
    ).toBeNull();
    expect(composeMercuryDescription(mercuryRow({ bankDescription: 'ACH', note: '  ' }))).toBe('ACH');
    expect(composeMercuryDescription(mercuryRow({ bankDescription: '  ', note: 'wire' }))).toBe('wire');
  });

  it('stores long text verbatim, like hand-entered notes', () => {
    const longNote = 'x'.repeat(2000);
    expect(composeMercuryDescription(mercuryRow({ note: longNote }))).toBe(longNote);
  });

  it('appends nothing to the description for FX rows: the anomaly flag replaces it', () => {
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
      bankDescription: 'wire',
    });
    expect(composeMercuryDescription(fx)).toBe('wire');
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
        bankDescription: 'Mobile deposit',
        note: 'June retainer',
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

    // Debit: negative amount verbatim, expense, composed description with an
    // empty note (the old composed-note format only lives in rows imported
    // before this rule). Mercury's category names it: the seeded expense
    // category is adopted with its own spelling and icon.
    const expense = localRow('local-1')!;
    expect(expense).toMatchObject({
      type: 'expense',
      amount: -9.01,
      currency: 'USD',
      accountId: accounts[0].id,
      accountName: 'Mercury *** ••***',
      note: null,
      description: 'BANK DATA 123',
      categoryId: 'cat-food',
      categoryName: 'Food',
      categoryIcon: 'utensils',
      categoryType: 'expense',
      subcategoryId: null,
      imagePath: null,
    });

    // Credit: positive amount, income; with no Mercury category signal the
    // row lands in the tagged income fallback. Both text parts join in the
    // description.
    const income = localRow('local-2')!;
    expect(income).toMatchObject({
      type: 'income',
      amount: 500,
      currency: 'USD',
      note: null,
      description: 'Mobile deposit · June retainer',
      categoryName: MERCURY_INCOME_CATEGORY_NAME,
      categoryIcon: 'briefcase',
      categoryType: 'income',
    });

    expect(getMercuryTransactionLinks().map((link) => link.id)).toEqual([
      'mtx-out',
      'mtx-in',
    ]);
    expect(summary).toEqual({ imported: 2, skipped: 0, anomalyRows: 0 });
  });

  it('adopts an existing same-type category case-insensitively from Mercury category names', async () => {
    seedCategories();
    fetchMock.mockResolvedValue([
      // Matches the expense category even though the wire name is uppercase:
      // same-type matching is case-insensitive, and the stored name is the
      // existing category's spelling.
      mercuryRow({ id: 'mtx-a', amount: -5, categoryData: { name: 'FOOD' } }),
      // Matches the income category: adoption does not care who created the
      // category row (default, user, or an earlier import all look alike).
      mercuryRow({ id: 'mtx-b', amount: 5, mercuryCategory: 'salary' }),
    ]);

    await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 10,
    });

    expect(localRow('local-1')).toMatchObject({
      type: 'expense',
      categoryId: 'cat-food',
      categoryName: 'Food',
    });
    expect(localRow('local-2')).toMatchObject({
      type: 'income',
      categoryId: 'cat-salary',
      categoryName: 'SALARY',
    });

    // Matched, not duplicated: no new category rows at all.
    expect(Object.keys(store.getTable('categories'))).toHaveLength(2);
  });

  it('gives one Mercury category name one category per type', async () => {
    seedCategories();
    fetchMock.mockResolvedValue([
      // 'Food' exists as an expense category: the expense row adopts it.
      mercuryRow({ id: 'mtx-e', amount: -5, categoryData: { name: 'Food' } }),
      // The same name on an income row has no same-type match, so it lazily
      // creates its own income category; matching never crosses types.
      mercuryRow({ id: 'mtx-i', amount: 7, mercuryCategory: 'Food' }),
    ]);

    await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 1,
    });

    expect(localRow('local-1')).toMatchObject({
      categoryId: 'cat-food',
      categoryType: 'expense',
    });
    expect(localRow('local-2')).toMatchObject({
      categoryName: 'Food',
      categoryIcon: 'briefcase',
      categoryType: 'income',
    });
    // Two categories named Food: the seeded expense one and the created
    // income one.
    expect(
      Object.values(store.getTable('categories')).filter((c) => c.name === 'Food'),
    ).toHaveLength(2);
  });

  it('categorizes rows by Mercury categoryData, then mercuryCategory, then the type fallback', async () => {
    seedCategories();
    fetchMock.mockResolvedValue([
      // categoryData wins when both signals are present.
      mercuryRow({
        id: 'mtx-both',
        amount: -5,
        categoryData: { name: 'Custom Expense' },
        mercuryCategory: 'Bank Fees',
      }),
      // The enum value is trimmed too. This is the first 'Bank Fees' row, so
      // dropping the enum's trim would store the padded spelling instead.
      mercuryRow({ id: 'mtx-pad', amount: -6, mercuryCategory: ' Bank Fees ' }),
      // Only the enum: its value is the category name verbatim.
      mercuryRow({ id: 'mtx-enum', amount: -7, mercuryCategory: 'Bank Fees' }),
      // A categoryData without a usable name carries no signal, so the enum
      // decides.
      mercuryRow({ id: 'mtx-blank', amount: -9, categoryData: {}, mercuryCategory: 'Bank Fees' }),
      // Neither signal, counterparty present or not: the counterparty no
      // longer decides anything, so the row keeps the tagged expense
      // fallback. A whitespace-only name reads as absent too.
      mercuryRow({
        id: 'mtx-none',
        amount: -11,
        categoryData: { name: '   ' },
        mercuryCategory: null,
      }),
      // Wire names are trimmed before matching and creation.
      mercuryRow({ id: 'mtx-trim', amount: -13, categoryData: { name: '  Padded  ' } }),
      // The income twin of the no-signal row: tagged income fallback.
      mercuryRow({ id: 'mtx-income', amount: 3, categoryData: null, mercuryCategory: null }),
    ]);

    await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 1,
    });

    expect(localRow('local-1')).toMatchObject({
      categoryName: 'Custom Expense',
      categoryIcon: 'wallet',
      categoryType: 'expense',
    });
    // The 'Bank Fees' rows share one lazily created expense category
    // (mtx-both carries the enum too, but its categoryData name wins).
    expect(localRow('local-2')).toMatchObject({
      categoryName: 'Bank Fees',
      categoryIcon: 'wallet',
      categoryType: 'expense',
    });
    expect(localRow('local-3')!.categoryId).toBe(localRow('local-2')!.categoryId);
    expect(localRow('local-4')!.categoryId).toBe(localRow('local-2')!.categoryId);
    expect(localRow('local-5')).toMatchObject({
      categoryName: MERCURY_EXPENSE_CATEGORY_NAME,
      categoryIcon: 'wallet',
      categoryType: 'expense',
    });
    expect(localRow('local-6')).toMatchObject({
      categoryName: 'Padded',
      categoryType: 'expense',
    });
    expect(localRow('local-7')).toMatchObject({
      categoryName: MERCURY_INCOME_CATEGORY_NAME,
      categoryIcon: 'briefcase',
      categoryType: 'income',
    });
  });

  it('creates each Mercury category once across repeated rows and case variants', async () => {
    fetchMock.mockResolvedValue([
      mercuryRow({ id: 'mtx-a', amount: -5, categoryData: { name: 'Vendors' } }),
      mercuryRow({ id: 'mtx-b', amount: -7, categoryData: { name: 'VENDORS' } }),
      mercuryRow({ id: 'mtx-c', amount: 1, mercuryCategory: 'Client' }),
      mercuryRow({ id: 'mtx-d', amount: 2, mercuryCategory: 'client' }),
    ]);

    await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 1,
    });

    // One expense and one income category, created once each despite the
    // case variants, under the first spelling seen; the tagged fallbacks
    // were never needed.
    expect(linkedCategoryRows('expense').map((c) => c.name)).toEqual(['Vendors']);
    expect(linkedCategoryRows('income').map((c) => c.name)).toEqual(['Client']);
    // Both rows in each type share the category.
    expect(localRow('local-1')!.categoryId).toBe(localRow('local-2')!.categoryId);
    expect(localRow('local-3')!.categoryId).toBe(localRow('local-4')!.categoryId);
  });

  it('categorizes anomaly rows exactly like normal rows', async () => {
    fetchMock.mockResolvedValue([
      mercuryRow({
        id: 'mtx-fx',
        amount: -190.05,
        categoryData: { name: 'Foreign Vendor' },
        currencyExchangeInfo: { exchangeRate: 0.92 },
      }),
      mercuryRow({ id: 'mtx-plain', amount: -5, categoryData: { name: 'foreign vendor' } }),
    ]);

    const summary = await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 1,
    });

    // The FX row gets the same Mercury category as the plain one, and its
    // anomaly bookkeeping is untouched.
    expect(localRow('local-1')!.categoryId).toBe(localRow('local-2')!.categoryId);
    expect(localRow('local-1')).toMatchObject({
      categoryName: 'Foreign Vendor',
      categoryType: 'expense',
    });
    expect(summary).toEqual({ imported: 2, skipped: 0, anomalyRows: 1 });
    expect(getMercuryTransactionLinks().find((l) => l.id === 'mtx-fx')).toMatchObject({
      anomaly: true,
    });
    expect(getMercuryTransactionLinks().find((l) => l.id === 'mtx-plain')).toMatchObject({
      anomaly: false,
    });
  });

  it('keeps rows without a Mercury category signal in the tagged fallbacks, created once per type', async () => {
    fetchMock.mockResolvedValue([
      mercuryRow({ id: 'mtx-a', amount: -5 }),
      mercuryRow({ id: 'mtx-b', amount: -7 }),
      mercuryRow({ id: 'mtx-c', amount: 1 }),
    ]);

    await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 1,
    });

    expect(linkedCategoryRows('expense')).toHaveLength(1);
    expect(linkedCategoryRows('income')).toHaveLength(1);
    expect(localRow('local-1')).toMatchObject({
      categoryName: MERCURY_EXPENSE_CATEGORY_NAME,
      categoryIcon: 'wallet',
      categoryType: 'expense',
    });
    expect(localRow('local-3')).toMatchObject({
      categoryName: MERCURY_INCOME_CATEGORY_NAME,
      categoryIcon: 'briefcase',
      categoryType: 'income',
    });
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

describe('backfill window selection', () => {
  // Frozen clock: the expected YYYY-MM-DD starts are derived from the same
  // clock read the importer sees, so they cannot flake across a UTC midnight
  // between the call and the assertion.
  const NOW = Date.parse('2026-11-21T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    store.setValue('isPremium', 'true');
    fetchMock.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const expectedStart = (days: number) =>
    new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  it('stores the chosen window and passes its explicit start to the API', async () => {
    await linkMercuryAccount(
      'secret-token:abc',
      { id: 'acct-1', name: 'Checking', currentBalance: 0 },
      { cursorWindowDays: 30 },
    );
    await linkMercuryAccount(
      'secret-token:abc',
      { id: 'acct-2', name: 'Savings', currentBalance: 0 },
      { cursorWindowDays: 365 },
    );

    const linked = getMercuryLinkedAccounts();
    expect(linked.find((account) => account.id === 'acct-1')!.cursorWindowDays).toBe(30);
    expect(linked.find((account) => account.id === 'acct-2')!.cursorWindowDays).toBe(365);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'secret-token:abc',
      'acct-1',
      { start: expectedStart(30) },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'secret-token:abc',
      'acct-2',
      { start: expectedStart(365) },
    );
  });

  it('treats a null window as all history: a fixed unbounded start, recorded as null', async () => {
    await linkMercuryAccount(
      'secret-token:abc',
      { id: 'acct-1', name: 'Checking', currentBalance: 0 },
      { cursorWindowDays: null },
    );

    expect(getMercuryLinkedAccounts()[0].cursorWindowDays).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('secret-token:abc', 'acct-1', { start: '1990-01-01' });
  });

  it('offers exactly the ticketed window choices', () => {
    expect(MERCURY_BACKFILL_WINDOW_CHOICES).toEqual([30, 90, 365, null]);
  });
});

describe('linking several accounts sequentially', () => {
  beforeEach(() => {
    store.setValue('isPremium', 'true');
  });

  const batch = [
    { id: 'acct-1', name: 'Checking', currentBalance: 100 },
    { id: 'acct-2', name: 'Savings', currentBalance: 200 },
    { id: 'acct-3', name: 'Venture', currentBalance: 300 },
  ];

  it('links every selected account one at a time, in order', async () => {
    // An overlapping implementation would run two fetches at once and the
    // concurrency counter would climb past 1; sequential awaits cannot.
    let active = 0;
    let maxActive = 0;
    const callOrder: string[] = [];
    fetchMock.mockImplementation(async (_token: string, accountId: string) => {
      callOrder.push(accountId);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return [];
    });

    const outcomes = await linkMercuryAccounts('secret-token:abc', batch);

    expect(callOrder).toEqual(['acct-1', 'acct-2', 'acct-3']);
    expect(maxActive).toBe(1);
    expect(outcomes.map((outcome) => outcome.mercuryAccountId)).toEqual([
      'acct-1',
      'acct-2',
      'acct-3',
    ]);
    expect(outcomes.every((outcome) => outcome.ok && outcome.summary)).toBe(true);

    // One managed local account per Mercury account, one-to-one.
    const accounts = await getAccounts();
    expect(accounts.map((account) => account.name)).toEqual(['Checking', 'Savings', 'Venture']);
    expect(accounts.every((account) => account.source === 'mercury')).toBe(true);

    // Each account carries its own recorded sync state after the run.
    const linked = getMercuryLinkedAccounts();
    expect(linked.map((account) => account.id)).toEqual(['acct-1', 'acct-2', 'acct-3']);
    expect(linked.every((account) => account.lastSyncedAt !== null && !account.stale)).toBe(true);
  });

  it('keeps going when one account fails; the others still complete', async () => {
    fetchMock.mockImplementation(async (_token: string, accountId: string) => {
      if (accountId === 'acct-2') throw new Error('offline');
      return [mercuryRow({ id: `mtx-${accountId}`, amount: -5, accountId })];
    });

    const outcomes = await linkMercuryAccounts('secret-token:abc', batch, 30);

    expect(outcomes.map((outcome) => [outcome.mercuryAccountId, outcome.ok])).toEqual([
      ['acct-1', true],
      ['acct-2', false],
      ['acct-3', true],
    ]);
    expect(outcomes[1]!.error).toBeInstanceOf(Error);

    const linked = getMercuryLinkedAccounts();
    // The failed account recorded the error, and its sync state never
    // advanced: lastSyncedAt stays unset and the window is untouched.
    expect(linked.find((account) => account.id === 'acct-2')).toMatchObject({
      enabled: true,
      cursorWindowDays: 30,
      lastSyncedAt: null,
      stale: true,
      lastError: 'offline',
    });
    expect(linked.find((account) => account.id === 'acct-1')).toMatchObject({
      stale: false,
      lastError: null,
      lastSyncedAt: expect.any(Number),
    });
    expect(linked.find((account) => account.id === 'acct-3')).toMatchObject({
      stale: false,
      lastError: null,
      lastSyncedAt: expect.any(Number),
    });

    // Rows landed for the healthy accounts only; nothing corrupt or partial
    // for the failed one beyond its reusable (empty) local account.
    const accounts = await getAccounts();
    expect(accounts).toHaveLength(3);
    const localIds = new Map(linked.map((account) => [account.id, account.localAccountId]));
    const transactions = await getTransactions();
    expect(transactions.map((tx) => tx.accountId).sort()).toEqual(
      [localIds.get('acct-1'), localIds.get('acct-3')].sort(),
    );
    expect(getMercuryTransactionLinks().map((link) => link.mercuryAccountId).sort()).toEqual([
      'acct-1',
      'acct-3',
    ]);
  });

  it('keeps a previously synced account intact when its re-confirm fails', async () => {
    fetchMock.mockResolvedValue([mercuryRow({ id: 'mtx-1', amount: -5 })]);
    await linkMercuryAccount('secret-token:abc', batch[0]!);
    const before = getMercuryLinkedAccounts()[0];
    const txCount = Object.keys(store.getTable('transactions')).length;

    fetchMock.mockRejectedValue(new Error('offline'));
    const [outcome] = await linkMercuryAccounts('secret-token:abc', [batch[0]!]);

    expect(outcome!.ok).toBe(false);
    // The imported rows and their links survive the failure.
    expect(Object.keys(store.getTable('transactions'))).toHaveLength(txCount);
    expect(getMercuryTransactionLinks()).toHaveLength(1);
    // The cursor did not advance: same lastSyncedAt, window, and rows; only
    // the error bookkeeping changed.
    const after = getMercuryLinkedAccounts()[0];
    expect(after.lastSyncedAt).toBe(before!.lastSyncedAt);
    expect(after.cursorWindowDays).toBe(before!.cursorWindowDays);
    expect(after).toMatchObject({ stale: true, lastError: 'offline' });
  });

  it('single-flights concurrent batches: the second resolves busy, nothing duplicates', async () => {
    let entered!: () => void;
    const firstFetchEntered = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    const firstFetchGate = new Promise<void>((resolve) => { release = resolve; });

    fetchMock.mockImplementation(async (_token: string, accountId: string) => {
      if (accountId === 'acct-1') {
        // Park the first batch mid-flight until the second call has tried.
        entered();
        await firstFetchGate;
      }
      return [mercuryRow({ id: `mtx-${accountId}`, amount: -5, accountId })];
    });

    const first = linkMercuryAccounts('secret-token:abc', batch.slice(0, 2), 30);
    await firstFetchEntered;
    const second = await linkMercuryAccounts('secret-token:abc', batch.slice(0, 2), 30);

    // The second pass ran nothing: every outcome carries the busy sentinel.
    expect(second.map((outcome) => [outcome.mercuryAccountId, outcome.ok])).toEqual([
      ['acct-1', false],
      ['acct-2', false],
    ]);
    expect(second.every((outcome) => outcome.error instanceof MercuryBatchBusyError)).toBe(true);
    expect(second.every((outcome) => outcome.summary === null)).toBe(true);

    release();
    const firstOutcomes = await first;
    expect(firstOutcomes.map((outcome) => [outcome.mercuryAccountId, outcome.ok])).toEqual([
      ['acct-1', true],
      ['acct-2', true],
    ]);

    // The overlapping call left no second set of accounts, rows, or links.
    expect(await getAccounts()).toHaveLength(2);
    expect(Object.keys(store.getTable('transactions'))).toHaveLength(2);
    expect(getMercuryTransactionLinks()).toHaveLength(2);
  });

  it('re-confirming the same batch creates no duplicate accounts or transactions', async () => {
    fetchMock.mockImplementation(async (_token: string, accountId: string) => [
      mercuryRow({ id: `mtx-${accountId}-a`, amount: -5, accountId }),
      mercuryRow({ id: `mtx-${accountId}-b`, amount: 7, accountId }),
    ]);

    const first = await linkMercuryAccounts('secret-token:abc', batch.slice(0, 2), 30);
    const second = await linkMercuryAccounts('secret-token:abc', batch.slice(0, 2), 30);

    expect(first.every((o) => o.ok && o.summary!.imported === 2)).toBe(true);
    expect(
      second.every((o) => o.ok && o.summary!.imported === 0 && o.summary!.skipped === 2),
    ).toBe(true);
    expect(await getAccounts()).toHaveLength(2);
    expect(Object.keys(store.getTable('transactions'))).toHaveLength(4);
    expect(getMercuryTransactionLinks()).toHaveLength(4);

    // Every row still belongs to its own Mercury account's local account.
    const linked = getMercuryLinkedAccounts();
    for (const account of linked) {
      const rows = await getTransactions();
      expect(rows.filter((tx) => tx.accountId === account.localAccountId)).toHaveLength(2);
    }
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
      mercuryCreatedAtMs: null,
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
    // One attempt per distinct category key (expense, then income), not one
    // per row: the cached null is honored for the repeated fallback name.
    expect(addCategorySpy).toHaveBeenCalledTimes(2);
    addCategorySpy.mockRestore();
  });

  it('stops retrying a wire-named category after the cap rejects it', async () => {
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
      mercuryRow({ id: 'mtx-a', amount: -5, categoryData: { name: 'Vendor' } }),
      // Same name in another case: the failed creation is remembered under
      // the case-insensitive key, so this row does not retry either.
      mercuryRow({ id: 'mtx-b', amount: -6, categoryData: { name: 'VENDOR' } }),
      mercuryRow({ id: 'mtx-c', amount: -7, categoryData: { name: 'Other' } }),
    ]);

    const summary = await linkMercuryAccount('secret-token:abc', {
      id: 'acct-1',
      name: 'Checking',
      currentBalance: 0,
    });

    // Every row still imports; capped wire names leave their rows
    // uncategorized.
    expect(summary).toEqual({ imported: 3, skipped: 0, anomalyRows: 0 });
    expect(localRow('local-1')).toMatchObject({ categoryId: null });
    expect(localRow('local-2')).toMatchObject({ categoryId: null });
    expect(localRow('local-3')).toMatchObject({ categoryId: null });
    // One attempt per distinct case-insensitive name.
    expect(addCategorySpy).toHaveBeenCalledTimes(2);
    addCategorySpy.mockRestore();
  });
});

describe('incomplete window on the backfill path', () => {
  beforeEach(() => {
    store.setValue('isPremium', 'true');
  });

  it('marks the account stale and keeps its rows when a page repeats', async () => {
    seedLinkedAccount();
    await putMercuryLinkedAccount({
      id: 'acct-1',
      localAccountId: 'acc-managed',
      enabled: true,
      currency: 'USD',
      mixedCurrency: false,
      cursorWindowDays: MERCURY_BACKFILL_DAYS,
      lastSyncedAt: 12345,
      stale: false,
      lastError: null,
    });
    fetchMock.mockRejectedValue(new MercuryIncompleteWindowError());

    await expect(
      linkMercuryAccount('secret-token:abc', {
        id: 'acct-1',
        name: 'Checking',
        currentBalance: 999990,
      }),
    ).rejects.toBeInstanceOf(MercuryIncompleteWindowError);

    // The imported row and its link survive; the cursor never advanced.
    expect(Object.keys(store.getTable('transactions'))).toHaveLength(1);
    expect(getMercuryTransactionLinks()).toHaveLength(1);
    expect(getMercuryLinkedAccounts()[0].lastSyncedAt).toBe(12345);
    expect(getMercuryLinkedAccounts()[0]).toMatchObject({
      stale: true,
      lastError: expect.stringContaining('repeated'),
    });
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

  it('throws instead of returning a truncated prefix when a server ignores the offset', async () => {
    // The rows collected before the repeated page are a prefix of the window:
    // handing them back would let a deletion pass drop every linked row beyond
    // the truncation point, so the walk fails loudly instead.
    const identical = pageRows(0, 500);
    const fetchMockForPages = jest.fn(async () => jsonResponse({ transactions: identical }));
    global.fetch = fetchMockForPages as unknown as typeof fetch;

    await expect(
      realMercuryApi.fetchMercuryTransactions('secret-token:abc', 'acct-1', {
        start: '2026-08-23',
      }),
    ).rejects.toBeInstanceOf(realMercuryApi.MercuryIncompleteWindowError);
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
