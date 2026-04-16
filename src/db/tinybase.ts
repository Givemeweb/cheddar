import { Platform } from 'react-native';
import { createStore, Store } from 'tinybase';
import {
  createExpoSqlitePersister,
  ExpoSqlitePersister,
} from 'tinybase/persisters/persister-expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import {
  createIndexedDbPersister,
  IndexedDbPersister,
} from 'tinybase/persisters/persister-indexed-db';
import i18n from '../i18n';

// Types for our data
export interface Category {
  id: string;
  name: string;
  icon: string;
  type: 'income' | 'expense';
}

export interface Account {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  balance: number;
  order: number;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  note: string | null;
  description: string | null;
  amount: number;
  date: number; // timestamp
}

// TinyBase schema types
export interface TablesSchema {
  categories: { [id: string]: { name: string; icon: string; type: string } };
  accounts: { [id: string]: { name: string; icon: string; description: string | null; balance: number; order: number } };
  transactions: {
    [id: string]: {
      type: string;
      categoryId: string | null;
      accountId: string;
      accountName: string;
      toAccountId: string | null;
      toAccountName: string | null;
      note: string | null;
      description: string | null;
      amount: number;
      date: number;
    };
  };
}

export interface ValuesSchema {
  theme: string;
  showIcons: string;
  alarmEnabled: string;
  alarmTime: string;
  alarmDays: string;
}

let store: Store | null = null;
let persister: ExpoSqlitePersister | IndexedDbPersister | null = null;

// Default seed data
const getDefaultCategories = (): TablesSchema['categories'] => ({
  '1': { name: i18n.t('defaultData.categories.food'), icon: 'utensils', type: 'expense' },
  '2': { name: i18n.t('defaultData.categories.transport'), icon: 'car', type: 'expense' },
  '3': { name: i18n.t('defaultData.categories.shopping'), icon: 'shopping-cart', type: 'expense' },
  '4': { name: i18n.t('defaultData.categories.entertainment'), icon: 'film', type: 'expense' },
  '5': { name: i18n.t('defaultData.categories.bills'), icon: 'receipt', type: 'expense' },
  '6': { name: i18n.t('defaultData.categories.health'), icon: 'heart-pulse', type: 'expense' },
  '7': { name: i18n.t('defaultData.categories.salary'), icon: 'briefcase', type: 'income' },
  '8': { name: i18n.t('defaultData.categories.freelance'), icon: 'laptop', type: 'income' },
  '9': { name: i18n.t('defaultData.categories.investments'), icon: 'trending-up', type: 'income' },
  '10': { name: i18n.t('defaultData.categories.gift'), icon: 'gift', type: 'income' },
});

const getDefaultAccounts = (): TablesSchema['accounts'] => ({
  '1': { name: i18n.t('defaultData.accounts.checking'), icon: 'wallet', description: null, balance: 0.0, order: 0 },
  '2': { name: i18n.t('defaultData.accounts.savings'), icon: 'piggy-bank', description: null, balance: 0.0, order: 1 },
  '3': { name: i18n.t('defaultData.accounts.creditCard'), icon: 'credit-card', description: null, balance: 0.0, order: 2 },
});

export async function initDatabase(): Promise<Store> {
  if (store) return store;

  store = createStore();

  if (Platform.OS === 'web') {
    // Use IndexedDB persister for web
    persister = createIndexedDbPersister(store, 'cheddar_db');
  } else {
    // Use Expo SQLite persister for native (iOS/Android)
    const db = openDatabaseSync('cheddar.db');
    persister = createExpoSqlitePersister(store, db, 'cheddar_db');
  }

  // Load existing data from database
  await persister.load();

  // Initialize theme value if not set
  if (store.getValue('theme') === undefined) {
    store.setValue('theme', 'system');
    await persister.save();
  }

  // Initialize showIcons value if not set (default: false - icons disabled)
  if (store.getValue('showIcons') === undefined) {
    store.setValue('showIcons', 'false');
    await persister.save();
  }

  // Initialize alarm values if not set (default: disabled, 9:00 PM, all days)
  if (store.getValue('alarmEnabled') === undefined) {
    store.setValue('alarmEnabled', 'false');
    await persister.save();
  }
  if (store.getValue('alarmTime') === undefined) {
    store.setValue('alarmTime', '21:00'); // 9:00 PM
    await persister.save();
  }
  if (store.getValue('alarmDays') === undefined) {
    store.setValue('alarmDays', '0,1,2,3,4,5,6'); // All days (Sun-Sat)
    await persister.save();
  }

  // Check if we need to seed default data
  const categories = store.getTables()?.categories;
  if (!categories || Object.keys(categories).length === 0) {
    // Seed default data
    store.setTables({
      categories: getDefaultCategories(),
      accounts: getDefaultAccounts(),
      transactions: {},
    });
    await persister.save();
  } else {
    // Update default categories with new icons (check if using old emoji icons)
    const firstCat = Object.values(categories)[0] as { icon: string } | undefined;
    if (firstCat && firstCat.icon.includes('🍽')) {
      // Old emoji-based icons detected, update default categories
      Object.entries(getDefaultCategories()).forEach(([id, data]) => {
        store!.setRow('categories', id, data);
      });
      await persister.save();
    }

    // Ensure all accounts have order field (migration)
    const accounts = store!.getTable('accounts');
    if (accounts) {
      let needsSave = false;
      let orderIndex = 0;
      Object.entries(accounts).forEach(([id, data]) => {
        if (data.order === undefined || data.order === null) {
          store!.setCell('accounts', id, 'order', orderIndex);
          needsSave = true;
        }
        // Migrate accounts without icon field
        if (data.icon === undefined || data.icon === null) {
          store!.setCell('accounts', id, 'icon', 'wallet');
          needsSave = true;
        }
        orderIndex++;
      });
      if (needsSave) {
        await persister.save();
      }
    }

    // Ensure all transactions have accountName and toAccountName (migration)
    const transactions = store!.getTable('transactions');
    if (transactions) {
      let needsSave = false;
      Object.entries(transactions).forEach(([id, data]) => {
        if (data.accountName === undefined || data.accountName === null) {
          // Find account name from accountId
          const accountId = data.accountId as string;
          const account = accounts?.[accountId];
          if (account) {
            store!.setCell('transactions', id, 'accountName', account.name as string);
            needsSave = true;
          }
        }
        if (data.toAccountId && (data.toAccountName === undefined || data.toAccountName === null)) {
          const toAccountId = data.toAccountId as string;
          const toAccount = accounts?.[toAccountId];
          if (toAccount) {
            store!.setCell('transactions', id, 'toAccountName', toAccount.name as string);
            needsSave = true;
          }
        }
      });
      if (needsSave) {
        await persister.save();
      }
    }
  }

  return store;
}

export function getStore(): Store {
  if (!store) {
    throw new Error('Store not initialized. Call initDatabase() first.');
  }
  return store;
}

export function isDatabaseReady(): boolean {
  return store !== null;
}

export async function getPersister() {
  return persister;
}

// Helper to generate unique IDs
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Helper to save changes
export async function saveStore(): Promise<void> {
  if (persister) {
    await persister.save();
  }
}