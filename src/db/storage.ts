import { getStore, saveStore, generateId, isDatabaseReady } from './tinybase';

// Types - IDs are strings for TinyBase
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
  date: Date;
}

// Categories
export async function getCategories(): Promise<Category[]> {
  if (!isDatabaseReady()) return [];
  const store = getStore();
  const categories = store.getTable('categories');
  if (!categories) return [];

  return Object.entries(categories).map(([id, data]) => ({
    id,
    name: data.name as string,
    icon: data.icon as string,
    type: data.type as 'income' | 'expense',
  }));
}

export async function getCategoryById(id: string): Promise<Category | undefined> {
  if (!isDatabaseReady()) return undefined;
  const store = getStore();
  const row = store.getRow('categories', id);
  if (!row) return undefined;

  return {
    id,
    name: row.name as string,
    icon: row.icon as string,
    type: row.type as 'income' | 'expense',
  };
}

// Accounts
export async function getAccounts(): Promise<Account[]> {
  if (!isDatabaseReady()) return [];
  const store = getStore();
  const accounts = store.getTable('accounts');
  if (!accounts) return [];

  return Object.entries(accounts).map(([id, data]) => ({
    id,
    name: data.name as string,
    type: data.type as Account['type'],
    balance: data.balance as number,
  }));
}

export async function getAccountById(id: string): Promise<Account | undefined> {
  if (!isDatabaseReady()) return undefined;
  const store = getStore();
  const row = store.getRow('accounts', id);
  if (!row) return undefined;

  return {
    id,
    name: row.name as string,
    type: row.type as Account['type'],
    balance: row.balance as number,
  };
}

export async function updateAccountBalance(id: string, balance: number): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.setCell('accounts', id, 'balance', balance);
  await saveStore();
}

// Transactions
export async function getTransactions(): Promise<Transaction[]> {
  if (!isDatabaseReady()) return [];
  const store = getStore();
  const transactions = store.getTable('transactions');
  if (!transactions) return [];

  return Object.entries(transactions)
    .map(([id, data]) => ({
      id,
      type: data.type as 'income' | 'expense' | 'transfer',
      categoryId: data.categoryId as string | null,
      accountId: data.accountId as string,
      toAccountId: data.toAccountId as string | null,
      note: data.note as string | null,
      description: data.description as string | null,
      amount: data.amount as number,
      date: new Date(data.date as number),
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function addTransaction(tx: {
  type: 'income' | 'expense' | 'transfer';
  categoryId?: string | null;
  accountId: string;
  toAccountId?: string | null;
  note?: string | null;
  description?: string | null;
  amount: number;
  date: Date;
}): Promise<Transaction> {
  if (!isDatabaseReady()) {
    throw new Error('Database not initialized');
  }
  const store = getStore();
  const id = generateId();

  store.setRow('transactions', id, {
    type: tx.type,
    categoryId: tx.categoryId ?? null,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId ?? null,
    note: tx.note ?? null,
    description: tx.description ?? null,
    amount: tx.amount,
    date: tx.date.getTime(),
  });

  await saveStore();

  return {
    id,
    type: tx.type,
    categoryId: tx.categoryId ?? null,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId ?? null,
    note: tx.note ?? null,
    description: tx.description ?? null,
    amount: tx.amount,
    date: tx.date,
  };
}

export async function deleteTransaction(id: string): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.delRow('transactions', id);
  await saveStore();
}

// Database initialization
export async function initializeDatabase(): Promise<void> {
  // Database is initialized in initDatabase() in tinybase.ts
  // This function is kept for API compatibility
  if (!isDatabaseReady()) {
    const { initDatabase } = await import('./tinybase');
    await initDatabase();
  }
}

export async function clearAllData(): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.delTables();
  await saveStore();
}

// Category management
export async function getCategoriesByType(type: 'income' | 'expense'): Promise<Category[]> {
  const categories = await getCategories();
  return categories.filter(c => c.type === type);
}

export async function addCategory(category: {
  name: string;
  icon: string;
  type: 'income' | 'expense';
}): Promise<Category> {
  if (!isDatabaseReady()) {
    throw new Error('Database not initialized');
  }
  const store = getStore();
  const id = generateId();

  store.setRow('categories', id, {
    name: category.name,
    icon: category.icon,
    type: category.type,
  });

  await saveStore();

  return {
    id,
    name: category.name,
    icon: category.icon,
    type: category.type,
  };
}

export async function deleteCategory(id: string): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.delRow('categories', id);
  await saveStore();
}