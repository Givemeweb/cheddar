import {
  addAccount,
  addCategory,
  deleteAccount,
  deleteCategory,
  getAccounts,
  getCategories,
  LimitReachedError,
  consumeReminderPrompt,
  markReminderPromptSeen,
  requestReminderPrompt,
  shouldOfferReminderPrompt,
  updateAccount,
  updateCategory,
} from './storage';
import { setCachedPremium } from './premium';
import { getStore } from './tinybase';

jest.mock('./tinybase', () => {
  let nextId = 0;
  return {
    isDatabaseReady: jest.fn(() => true),
    getStore: jest.fn(),
    saveStore: jest.fn(async () => {}),
    generateId: jest.fn(() => `generated-${++nextId}`),
  };
});

const getStoreMock = getStore as jest.Mock;

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

function seedAccounts(count: number) {
  for (let i = 1; i <= count; i++) {
    store.setRow('accounts', `seed-account-${i}`, {
      name: `Account ${i}`,
      icon: 'wallet',
      description: null,
      balance: 0,
      order: i - 1,
      currency: 'EUR',
    });
  }
}

function seedCategories(count: number) {
  for (let i = 1; i <= count; i++) {
    store.setRow('categories', `seed-category-${i}`, {
      name: `Category ${i}`,
      icon: 'utensils',
      type: i % 2 === 0 ? 'income' : 'expense',
      order: i - 1,
    });
  }
}

function rowCount(table: 'accounts' | 'categories') {
  return Object.keys(store.getTable(table) ?? {}).length;
}

beforeEach(() => {
  store = new FakeStore();
  getStoreMock.mockReturnValue(store);
});

describe('free-tier create guards', () => {
  it('allows a free user to create up to the 3 account and 10 category caps', async () => {
    await setCachedPremium(false);
    seedAccounts(2);
    seedCategories(9);

    await addAccount({ name: 'Third account' });
    await addCategory({ name: 'Tenth category', icon: 'gift', type: 'income' });

    expect(rowCount('accounts')).toBe(3);
    expect(rowCount('categories')).toBe(10);
  });

  it('counts the seeded default accounts toward the cap and blocks a 4th', async () => {
    await setCachedPremium(false);
    // The three seeded defaults are just pre-existing rows; ids 1-3 mirror them.
    seedAccounts(3);

    await expect(addAccount({ name: 'Fourth account' })).rejects.toMatchObject({
      name: 'LimitReachedError',
      resource: 'accounts',
      limit: 3,
    });
    expect(rowCount('accounts')).toBe(3);
  });

  it('counts the seeded default categories toward the cap and blocks an 11th', async () => {
    await setCachedPremium(false);
    // The ten seeded defaults are pre-existing rows across both types.
    seedCategories(10);

    await expect(
      addCategory({ name: 'Eleventh category', icon: 'gift', type: 'expense' }),
    ).rejects.toBeInstanceOf(LimitReachedError);
    expect(rowCount('categories')).toBe(10);
  });

  it('lets premium users create beyond the free caps', async () => {
    await setCachedPremium(true);
    seedAccounts(5);
    seedCategories(12);

    await addAccount({ name: 'Sixth account' });
    await addCategory({ name: 'Thirteenth category', icon: 'gift', type: 'expense' });

    expect(rowCount('accounts')).toBe(6);
    expect(rowCount('categories')).toBe(13);
  });

  it('keeps a refunded user over-limit data visible and editable, blocking only new creates', async () => {
    await setCachedPremium(true);
    seedAccounts(5);
    seedCategories(12);
    // A refund flips the entitlement back to free; data must stay untouched.
    await setCachedPremium(false);

    const accounts = await getAccounts();
    const categories = await getCategories();
    expect(accounts).toHaveLength(5);
    expect(categories).toHaveLength(12);

    await updateAccount(accounts[0].id, { name: 'Renamed account' });
    await updateCategory(categories[0].id, { name: 'Renamed category' });
    expect((await getAccounts()).find((a) => a.id === accounts[0].id)?.name).toBe(
      'Renamed account',
    );
    expect(
      (await getCategories()).find((c) => c.id === categories[0].id)?.name,
    ).toBe('Renamed category');

    await deleteAccount(accounts[1].id);
    await deleteCategory(categories[1].id);
    expect(await getAccounts()).toHaveLength(4);
    expect(await getCategories()).toHaveLength(11);

    await expect(addAccount({ name: 'Blocked account' })).rejects.toBeInstanceOf(
      LimitReachedError,
    );
    await expect(
      addCategory({ name: 'Blocked category', icon: 'gift', type: 'income' }),
    ).rejects.toBeInstanceOf(LimitReachedError);

    // Deleting back under the cap re-enables creates; existing data is never locked.
    const remainingAccounts = await getAccounts();
    await Promise.all(
      remainingAccounts.slice(2).map((account) => deleteAccount(account.id)),
    );
    const remainingCategories = await getCategories();
    await Promise.all(
      remainingCategories.slice(9).map((category) => deleteCategory(category.id)),
    );
    await addAccount({ name: 'Allowed account' });
    await addCategory({ name: 'Allowed category', icon: 'gift', type: 'expense' });
    expect(await getAccounts()).toHaveLength(3);
    expect(await getCategories()).toHaveLength(10);
  });
});

describe('reminder prompt state', () => {
  it('offers the prompt once, only while there are no transactions', async () => {
    await expect(shouldOfferReminderPrompt()).resolves.toBe(true);

    store.setRow('transactions', 'first', { type: 'expense' });
    await expect(shouldOfferReminderPrompt()).resolves.toBe(false);

    store.delRow('transactions', 'first');
    await expect(shouldOfferReminderPrompt()).resolves.toBe(true);

    await markReminderPromptSeen();
    await expect(shouldOfferReminderPrompt()).resolves.toBe(false);
  });

  it('queues the prompt and consumes it only once', async () => {
    await requestReminderPrompt();
    await expect(consumeReminderPrompt()).resolves.toBe(true);
    await expect(consumeReminderPrompt()).resolves.toBe(false);
    await expect(shouldOfferReminderPrompt()).resolves.toBe(false);
  });
});
