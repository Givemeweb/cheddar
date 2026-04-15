import { Platform } from 'react-native';
import { createStore, Store } from 'tinybase';
import {
  createExpoSqlitePersister,
  ExpoSqlitePersister,
} from 'tinybase/persisters/persister-expo-sqlite';
import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import {
  createIndexedDbPersister,
  IndexedDbPersister,
} from 'tinybase/persisters/persister-indexed-db';

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
  type: 'checking' | 'savings' | 'credit' | 'cash' | 'investment';
  balance: number;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  note: string | null;
  description: string | null;
  amount: number;
  date: number; // timestamp
}

// TinyBase schema types
export interface TablesSchema {
  categories: { [id: string]: { name: string; icon: string; type: string } };
  accounts: { [id: string]: { name: string; type: string; balance: number } };
  transactions: {
    [id: string]: {
      type: string;
      categoryId: string | null;
      accountId: string;
      toAccountId: string | null;
      note: string | null;
      description: string | null;
      amount: number;
      date: number;
    };
  };
}

let store: Store | null = null;
let persister: ExpoSqlitePersister | IndexedDbPersister | null = null;

// Default seed data
const defaultCategories: TablesSchema['categories'] = {
  '1': { name: 'Food', icon: 'utensils', type: 'expense' },
  '2': { name: 'Transport', icon: 'car', type: 'expense' },
  '3': { name: 'Shopping', icon: 'shopping-cart', type: 'expense' },
  '4': { name: 'Entertainment', icon: 'film', type: 'expense' },
  '5': { name: 'Bills', icon: 'receipt', type: 'expense' },
  '6': { name: 'Health', icon: 'heart-pulse', type: 'expense' },
  '7': { name: 'Salary', icon: 'briefcase', type: 'income' },
  '8': { name: 'Freelance', icon: 'laptop', type: 'income' },
  '9': { name: 'Investments', icon: 'trending-up', type: 'income' },
  '10': { name: 'Gift', icon: 'gift', type: 'income' },
};

const defaultAccounts: TablesSchema['accounts'] = {
  '1': { name: 'Checking', type: 'checking', balance: 2500.0 },
  '2': { name: 'Savings', type: 'savings', balance: 10000.0 },
  '3': { name: 'Credit Card', type: 'credit', balance: -450.0 },
};

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

  // Check if we need to seed default data
  const categories = store.getTables()?.categories;
  if (!categories || Object.keys(categories).length === 0) {
    // Seed default data
    store.setTables({
      categories: defaultCategories,
      accounts: defaultAccounts,
      transactions: {},
    });
    await persister.save();
  } else {
    // Update default categories with new icons (check if using old emoji icons)
    const firstCat = Object.values(categories)[0] as { icon: string } | undefined;
    if (firstCat && firstCat.icon.includes('🍽')) {
      // Old emoji-based icons detected, update default categories
      Object.entries(defaultCategories).forEach(([id, data]) => {
        store.setRow('categories', id, data);
      });
      await persister.save();
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