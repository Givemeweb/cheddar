import JSZip from 'jszip';
import {
  exportProfitLossWorkbook,
  collectProfitLossConversions,
  toProfitLossTransactions,
  profitLossRowsForYear,
  ProfitLossRatesUnavailableError,
  type ProfitLossSourceRow,
} from './plExport';
import { getLatestRates } from '../services/exchangeRates';
import { getStore } from '../db/tinybase';

jest.mock('../db/tinybase', () => {
  let nextId = 0;
  return {
    isDatabaseReady: jest.fn(() => true),
    getStore: jest.fn(),
    saveStore: jest.fn(async () => {}),
    generateId: jest.fn(() => `generated-${++nextId}`),
    generateTransactionId: jest.fn(() => `generated-tx-${++nextId}`),
  };
});

jest.mock('../services/exchangeRates', () => ({
  ...jest.requireActual('../services/exchangeRates'),
  getLatestRates: jest.fn(),
}));

const getStoreMock = getStore as jest.Mock;
const getLatestRatesMock = getLatestRates as jest.Mock;

// Minimal in-memory stand-in for the TinyBase store API used by storage.ts.
// (TinyBase ships ESM only, which the test transform does not handle.)
type Row = Record<string, unknown>;
class FakeStore {
  private tables: Record<string, Record<string, Row>> = {};
  private values: Record<string, unknown> = {};

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
    this.tables[table] ??= {};
    this.tables[table][id] = { ...this.tables[table][id], [cell]: value };
  }

  getCell(table: string, id: string, cell: string) {
    return this.tables[table]?.[id]?.[cell];
  }

  getValue(key: string) {
    return this.values[key];
  }

  setValue(key: string, value: unknown) {
    this.values[key] = value;
  }
}

let store: FakeStore;

function seedAccount(id: string, currency: string) {
  store.setRow('accounts', id, {
    name: id,
    icon: 'wallet',
    description: null,
    balance: 0,
    order: 0,
    currency,
  });
}

function seedCategory(id: string, name: string, type: 'income' | 'expense') {
  store.setRow('categories', id, { name, icon: 'circle', type, order: 0 });
}

interface SeedTx {
  type: 'income' | 'expense' | 'transfer';
  categoryId?: string | null;
  categoryName?: string | null;
  accountId: string;
  toAccountId?: string | null;
  amount: number;
  currency?: string;
  toCurrency?: string | null;
  toAmount?: number | null;
  date: number;
}

function seedTransaction(id: string, tx: SeedTx) {
  store.setRow('transactions', id, {
    type: tx.type,
    categoryId: tx.categoryId ?? null,
    subcategoryId: null,
    subcategoryName: null,
    categoryName: tx.categoryName ?? null,
    categoryIcon: null,
    categoryType: null,
    accountId: tx.accountId,
    accountName: tx.accountId,
    toAccountId: tx.toAccountId ?? null,
    toAccountName: tx.toAccountId ?? null,
    note: null,
    description: null,
    amount: tx.amount,
    currency: tx.currency ?? null,
    toCurrency: tx.toCurrency ?? null,
    toAmount: tx.toAmount ?? null,
    date: tx.date,
    imagePath: null,
  });
}

const MONTH = (year: number, month: number, day: number): number =>
  new Date(year, month - 1, day, 12, 0, 0).getTime();

// Rates are quoted against the EUR pivot: 1 EUR = 2 USD, so 100 USD -> 50 EUR.
const RATES = {
  base: 'EUR',
  rates: { USD: 2 },
  fetchedAt: 0,
  date: '2026-01-01',
};

beforeEach(() => {
  store = new FakeStore();
  getStoreMock.mockReturnValue(store);
  getLatestRatesMock.mockClear();
  getLatestRatesMock.mockResolvedValue(RATES);
});

describe('profit & loss export wiring', () => {
  beforeEach(() => {
    seedAccount('acc-eur', 'EUR');
    seedAccount('acc-usd', 'USD');
    seedCategory('cat-salary', 'Salary', 'income');
    seedCategory('cat-rent', 'Rent', 'expense');

    seedTransaction('tx-salary-eur', {
      type: 'income', categoryId: 'cat-salary', accountId: 'acc-eur',
      amount: 1000, currency: 'EUR', date: MONTH(2025, 3, 15),
    });
    // Mixed-currency income converts into the main currency.
    seedTransaction('tx-salary-usd', {
      type: 'income', categoryId: 'cat-salary', accountId: 'acc-usd',
      amount: 100, currency: 'USD', date: MONTH(2025, 4, 2),
    });
    seedTransaction('tx-rent', {
      type: 'expense', categoryId: 'cat-rent', accountId: 'acc-usd',
      amount: -200, currency: 'USD', date: MONTH(2025, 5, 10),
    });
    // Both sides selected: internal movement, must stay out of the statement.
    seedTransaction('tx-internal', {
      type: 'transfer', accountId: 'acc-eur', toAccountId: 'acc-usd',
      amount: -300, currency: 'EUR', toCurrency: 'USD', toAmount: 500,
      date: MONTH(2025, 6, 1),
    });
    // One-sided outbound: "Transfers out" from the SOURCE amount; the stored
    // destination figure (-90) must be ignored on the outbound branch.
    seedTransaction('tx-out', {
      type: 'transfer', accountId: 'acc-eur', toAccountId: 'acc-ext',
      amount: -50, currency: 'EUR', toAmount: -90, date: MONTH(2025, 7, 1),
    });
    // One-sided inbound with a stored destination-side figure (negative,
    // destination currency).
    seedTransaction('tx-in-converted', {
      type: 'transfer', accountId: 'acc-ext', toAccountId: 'acc-eur',
      amount: -100, currency: 'USD', toCurrency: 'EUR', toAmount: -250,
      date: MONTH(2025, 8, 1),
    });
    // One-sided inbound on a legacy row without a stored toAmount: falls
    // back to the row's own amount/currency, like the stats screens.
    seedTransaction('tx-in-legacy', {
      type: 'transfer', accountId: 'acc-ext', toAccountId: 'acc-usd',
      amount: -40, currency: 'USD', toAmount: null, date: MONTH(2025, 9, 1),
    });
    // Flagged rows stay out of every total, like the stats screens.
    seedTransaction('tx-anomaly', {
      type: 'income', categoryId: 'cat-salary', accountId: 'acc-eur',
      amount: 999, currency: 'EUR', date: MONTH(2025, 10, 1),
    });
    store.setRow('mercuryTransactionLinks', 'link-1', {
      localTransactionId: 'tx-anomaly',
      anomaly: 'true',
    });
    // Uncategorized rows anchor at the end of their section.
    seedTransaction('tx-uncat', {
      type: 'income', categoryId: null, accountId: 'acc-eur',
      amount: 70, currency: 'EUR', date: MONTH(2025, 11, 3),
    });
    // Outside the chosen year: ignored.
    seedTransaction('tx-2024', {
      type: 'income', categoryId: 'cat-salary', accountId: 'acc-eur',
      amount: 5000, currency: 'EUR', date: MONTH(2024, 1, 1),
    });
  });

  it('builds the statement for the selected accounts and year in the main currency', async () => {
    const result = await exportProfitLossWorkbook({
      year: 2025,
      accountIds: ['acc-eur', 'acc-usd'],
    });

    expect(result.currencyCode).toBe('EUR');

    const revenueTotal = result.statement.revenue.total.reduce((a, b) => a + b, 0);
    const opexTotal = result.statement.operatingExpenses.total.reduce((a, b) => a + b, 0);

    // Salary 1000 + 50 converted, Transfers in 250 + 20 converted,
    // Uncategorized 70. The flagged 999 and the 2024 row stay out.
    expect(revenueTotal).toBe(1390);
    // Rent 200 USD converted to 100, Transfers out 50.
    expect(opexTotal).toBe(150);

    const salary = result.statement.revenue.rows.find((row) => row.label === 'Salary');
    expect(salary?.months[2]).toBe(1000); // March, EUR stays EUR
    expect(salary?.months[3]).toBe(50); // April, 100 USD converted

    const transfersIn = result.statement.revenue.rows.find((row) => row.label === 'Transfers in');
    expect(transfersIn?.months[7]).toBe(250); // stored toAmount side
    expect(transfersIn?.months[8]).toBe(20); // legacy fallback via amount

    const transfersOut = result.statement.operatingExpenses.rows.find(
      (row) => row.label === 'Transfers out',
    );
    expect(transfersOut?.months[6]).toBe(50);

    const uncategorized = result.statement.revenue.rows.find(
      (row) => row.label === 'Uncategorized',
    );
    expect(uncategorized?.months[10]).toBe(70);

    // The rates lookup happens once and feeds the batch converter.
    expect(getLatestRatesMock).toHaveBeenCalledTimes(1);

    // The workbook bytes are a zip container (xlsx) whose number format
    // stamps values with the main-currency symbol (XML-escaped attribute).
    expect(result.bytes[0]).toBe(0x50); // 'P'
    expect(result.bytes[1]).toBe(0x4b); // 'K'
    const zip = await JSZip.loadAsync(result.bytes);
    const stylesFile = zip.file('xl/styles.xml');
    expect(stylesFile).toBeTruthy();
    const stylesXml = await stylesFile!.async('string');
    expect(stylesXml).toContain('&quot;€&quot;#,##0.00');
  });

  it('omits accounts that were not selected from the totals', async () => {
    const result = await exportProfitLossWorkbook({
      year: 2025,
      accountIds: ['acc-eur'],
    });

    const revenueTotal = result.statement.revenue.total.reduce((a, b) => a + b, 0);
    const opexTotal = result.statement.operatingExpenses.total.reduce((a, b) => a + b, 0);

    // Salary 1000 + Transfers in 250 + Uncategorized 70 (no USD account).
    expect(revenueTotal).toBe(1320);
    // The 300 EUR transfer to the unselected USD account turns one-sided
    // (Transfers out) next to tx-out's 50.
    expect(opexTotal).toBe(350);
  });

  it('collects one conversion per amount plus the destination side of transfers, in order', () => {
    const rows = [
      {
        type: 'income', categoryId: 'c', categoryName: null, subcategoryName: null,
        accountId: 'a', toAccountId: null, amount: 10, currency: 'EUR',
        toCurrency: null, toAmount: null, date: new Date(2025, 0, 1), anomaly: false,
      },
      {
        type: 'transfer', categoryId: null, categoryName: null, subcategoryName: null,
        accountId: 'a', toAccountId: 'b', amount: -5, currency: 'EUR',
        toCurrency: 'USD', toAmount: -6, date: new Date(2025, 0, 2), anomaly: false,
      },
    ] as const;

    expect(collectProfitLossConversions([...rows])).toEqual([
      { amount: 10, currency: 'EUR' },
      { amount: -5, currency: 'EUR' },
      { amount: -6, currency: 'USD' },
    ]);

    const mapped = toProfitLossTransactions([...rows], [10, -5, -6]);
    expect(mapped).toHaveLength(2);
    expect(mapped[1]).toMatchObject({
      type: 'transfer',
      amount: -5,
      toAmount: -6,
      date: new Date(2025, 0, 2).getTime(),
      anomaly: false,
    });
  });

  it('filters rows by year and anomaly before the engine sees them', () => {
    const base: ProfitLossSourceRow = {
      type: 'income', categoryId: 'c', categoryName: null, subcategoryName: null,
      accountId: 'a', toAccountId: null, amount: 1, currency: 'EUR',
      toCurrency: null, toAmount: null, date: new Date(2025, 5, 1), anomaly: false,
    };
    const filtered = profitLossRowsForYear(
      [
        base,
        { ...base, date: new Date(2024, 5, 1) }, // other year
        { ...base, date: new Date(2025, 5, 2), anomaly: true }, // flagged
      ],
      2025,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].date.getFullYear()).toBe(2025);
    expect(filtered[0].anomaly).toBe(false);
  });

  it('refuses a mixed-currency export when no rates are available', async () => {
    getLatestRatesMock.mockResolvedValue(null);
    await expect(
      exportProfitLossWorkbook({ year: 2025, accountIds: ['acc-eur', 'acc-usd'] }),
    ).rejects.toBeInstanceOf(ProfitLossRatesUnavailableError);
    // The rates lookup happens once; the batch converter must not re-fetch.
    expect(getLatestRatesMock).toHaveBeenCalledTimes(1);
  });

  it('ignores unselected accounts and unused transfer legs in the rates requirement', async () => {
    // Shared seeds: foreign-currency figures exist on the unselected USD
    // account and on unused transfer legs; only EUR figures reach the
    // selected statement, so identity conversion stays correct.
    getLatestRatesMock.mockResolvedValue(null);
    const result = await exportProfitLossWorkbook({
      year: 2025,
      accountIds: ['acc-eur'],
    });

    const revenueTotal = result.statement.revenue.total.reduce((a, b) => a + b, 0);
    const opexTotal = result.statement.operatingExpenses.total.reduce((a, b) => a + b, 0);
    expect(revenueTotal).toBe(1320);
    expect(opexTotal).toBe(350);
  });

  it('needs nothing from rates when a one-sided outbound transfer is only foreign on the unused side', async () => {
    store = new FakeStore();
    getStoreMock.mockReturnValue(store);
    seedAccount('acc-eur', 'EUR');
    seedAccount('acc-ext', 'USD');
    seedCategory('cat-rent', 'Rent', 'expense');
    seedTransaction('tx-out', {
      type: 'transfer', accountId: 'acc-eur', toAccountId: 'acc-ext',
      amount: -50, currency: 'EUR', toCurrency: 'USD', toAmount: -90,
      date: MONTH(2025, 7, 1),
    });

    getLatestRatesMock.mockResolvedValue(null);
    const result = await exportProfitLossWorkbook({
      year: 2025,
      accountIds: ['acc-eur'],
    });

    const transfersOut = result.statement.operatingExpenses.rows.find(
      (row) => row.label === 'Transfers out',
    );
    expect(transfersOut?.months[6]).toBe(50); // source side, untouched
    expect(result.statement.revenue.total.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('refuses a selected foreign currency whose rate entry is missing', async () => {
    // Rates exist but carry no USD entry: convertWithRates would silently
    // leave the USD amounts unchanged under the EUR symbol.
    getLatestRatesMock.mockResolvedValue({
      base: 'EUR',
      rates: { GBP: 0.86 },
      fetchedAt: 0,
      date: '2026-01-01',
    });
    await expect(
      exportProfitLossWorkbook({ year: 2025, accountIds: ['acc-eur', 'acc-usd'] }),
    ).rejects.toBeInstanceOf(ProfitLossRatesUnavailableError);
    expect(getLatestRatesMock).toHaveBeenCalledTimes(1);
  });

  it('refuses when the rates cache lacks the main-currency entry itself', async () => {
    // Main currency USD against an EUR-pivot cache without a USD entry: the
    // base-pivot conversion needs the main leg too.
    store = new FakeStore();
    getStoreMock.mockReturnValue(store);
    store.setValue('mainCurrency', 'USD');
    seedAccount('acc-eur', 'EUR');
    seedCategory('cat-salary', 'Salary', 'income');
    seedTransaction('tx-salary', {
      type: 'income', categoryId: 'cat-salary', accountId: 'acc-eur',
      amount: 100, currency: 'EUR', date: MONTH(2025, 3, 15),
    });

    getLatestRatesMock.mockResolvedValue({
      base: 'EUR',
      rates: {},
      fetchedAt: 0,
      date: '2026-01-01',
    });
    await expect(
      exportProfitLossWorkbook({ year: 2025, accountIds: ['acc-eur'] }),
    ).rejects.toBeInstanceOf(ProfitLossRatesUnavailableError);
  });

  it('needs nothing from rates for a both-selected cross-currency transfer', async () => {
    store = new FakeStore();
    getStoreMock.mockReturnValue(store);
    seedAccount('acc-a', 'EUR');
    seedAccount('acc-b', 'USD');
    seedCategory('cat-salary', 'Salary', 'income');
    seedTransaction('tx-salary', {
      type: 'income', categoryId: 'cat-salary', accountId: 'acc-a',
      amount: 100, currency: 'EUR', date: MONTH(2025, 3, 15),
    });
    // Internal movement: the engine skips it, so neither leg needs rates.
    seedTransaction('tx-internal', {
      type: 'transfer', accountId: 'acc-a', toAccountId: 'acc-b',
      amount: -300, currency: 'EUR', toCurrency: 'USD', toAmount: 500,
      date: MONTH(2025, 6, 1),
    });

    getLatestRatesMock.mockResolvedValue(null);
    const result = await exportProfitLossWorkbook({
      year: 2025,
      accountIds: ['acc-a', 'acc-b'],
    });

    expect(result.statement.revenue.total.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result.statement.operatingExpenses.total.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('exports unchanged amounts when no rates exist but every figure is main-currency', async () => {
    // Fresh seeds: only main-currency figures, transfers included.
    store = new FakeStore();
    getStoreMock.mockReturnValue(store);
    seedAccount('acc-eur', 'EUR');
    seedAccount('acc-other', 'EUR');
    seedCategory('cat-salary', 'Salary', 'income');
    seedCategory('cat-rent', 'Rent', 'expense');
    seedTransaction('tx-salary', {
      type: 'income', categoryId: 'cat-salary', accountId: 'acc-eur',
      amount: 1000, currency: 'EUR', date: MONTH(2025, 3, 15),
    });
    seedTransaction('tx-rent', {
      type: 'expense', categoryId: 'cat-rent', accountId: 'acc-eur',
      amount: -200, currency: 'EUR', date: MONTH(2025, 5, 10),
    });
    seedTransaction('tx-out', {
      type: 'transfer', accountId: 'acc-eur', toAccountId: 'acc-other',
      amount: -50, currency: 'EUR', toCurrency: 'EUR', toAmount: -55,
      date: MONTH(2025, 7, 1),
    });

    getLatestRatesMock.mockResolvedValue(null);
    const result = await exportProfitLossWorkbook({
      year: 2025,
      accountIds: ['acc-eur'],
    });

    const revenueTotal = result.statement.revenue.total.reduce((a, b) => a + b, 0);
    const opexTotal = result.statement.operatingExpenses.total.reduce((a, b) => a + b, 0);
    expect(revenueTotal).toBe(1000);
    expect(opexTotal).toBe(250); // Rent 200 + Transfers out 50
    expect(getLatestRatesMock).toHaveBeenCalledTimes(1);
  });
});
