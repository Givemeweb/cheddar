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

  return Object.entries(accounts)
    .map(([id, data]) => ({
      id,
      name: data.name as string,
      description: data.description as string | null,
      balance: data.balance as number,
      order: (data.order as number) ?? 0,
    }))
    .sort((a, b) => a.order - b.order);
}

export async function getAccountById(id: string): Promise<Account | undefined> {
  if (!isDatabaseReady()) return undefined;
  const store = getStore();
  const row = store.getRow('accounts', id);
  if (!row) return undefined;

  return {
    id,
    name: row.name as string,
    description: row.description as string | null,
    balance: row.balance as number,
    order: (row.order as number) ?? 0,
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
      accountName: data.accountName as string,
      toAccountId: data.toAccountId as string | null,
      toAccountName: data.toAccountName as string | null,
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
  accountName: string;
  toAccountId?: string | null;
  toAccountName?: string | null;
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
    accountName: tx.accountName,
    toAccountId: tx.toAccountId ?? null,
    toAccountName: tx.toAccountName ?? null,
    note: tx.note ?? null,
    description: tx.description ?? null,
    amount: tx.amount,
    date: tx.date.getTime(),
  });

  // Update account balance(s)
  if (tx.type === 'transfer' && tx.toAccountId) {
    // Transfer: debit from account, credit to toAccountId
    const fromBalance = store.getCell('accounts', tx.accountId, 'balance') as number ?? 0;
    const toBalance = store.getCell('accounts', tx.toAccountId, 'balance') as number ?? 0;
    store.setCell('accounts', tx.accountId, 'balance', fromBalance + tx.amount); // amount is negative
    store.setCell('accounts', tx.toAccountId, 'balance', toBalance - tx.amount); // positive equivalent
  } else {
    // Income or expense: update the account balance
    const currentBalance = store.getCell('accounts', tx.accountId, 'balance') as number ?? 0;
    store.setCell('accounts', tx.accountId, 'balance', currentBalance + tx.amount);
  }

  await saveStore();

  return {
    id,
    type: tx.type,
    categoryId: tx.categoryId ?? null,
    accountId: tx.accountId,
    accountName: tx.accountName,
    toAccountId: tx.toAccountId ?? null,
    toAccountName: tx.toAccountName ?? null,
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

export async function updateCategory(id: string, updates: { name?: string; icon?: string }): Promise<Category | undefined> {
  if (!isDatabaseReady()) return undefined;
  const store = getStore();

  const currentCategory = await getCategoryById(id);
  if (!currentCategory) return undefined;

  const newName = updates.name ?? currentCategory.name;
  const newIcon = updates.icon ?? currentCategory.icon;

  store.setRow('categories', id, {
    name: newName,
    icon: newIcon,
    type: currentCategory.type,
  });

  await saveStore();

  return {
    id,
    name: newName,
    icon: newIcon,
    type: currentCategory.type,
  };
}

// Account management
export async function addAccount(account: {
  name: string;
  description?: string | null;
}): Promise<Account> {
  if (!isDatabaseReady()) {
    throw new Error('Database not initialized');
  }
  const store = getStore();
  const id = generateId();

  // Get the highest order and add 1
  const accounts = await getAccounts();
  const maxOrder = accounts.length > 0 ? Math.max(...accounts.map(a => a.order)) : -1;

  store.setRow('accounts', id, {
    name: account.name,
    description: account.description ?? null,
    balance: 0,
    order: maxOrder + 1,
  });

  await saveStore();

  return {
    id,
    name: account.name,
    description: account.description ?? null,
    balance: 0,
    order: maxOrder + 1,
  };
}

export async function deleteAccount(id: string): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.delRow('accounts', id);
  await saveStore();
}

export async function reorderAccounts(accountIds: string[]): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();

  accountIds.forEach((id, index) => {
    store.setCell('accounts', id, 'order', index);
  });

  await saveStore();
}

export async function updateAccount(id: string, updates: { name?: string; description?: string | null }): Promise<Account | undefined> {
  if (!isDatabaseReady()) return undefined;
  const store = getStore();

  const currentAccount = await getAccountById(id);
  if (!currentAccount) return undefined;

  const newName = updates.name ?? currentAccount.name;
  const newDescription = updates.description ?? currentAccount.description;

  // Update account
  store.setRow('accounts', id, {
    name: newName,
    description: newDescription,
    balance: currentAccount.balance,
    order: currentAccount.order,
  });

  // Update all transactions that reference this account
  const transactions = store.getTable('transactions');
  if (transactions) {
    for (const [txId, txData] of Object.entries(transactions)) {
      const txAccountId = txData.accountId as string;
      const txToAccountId = txData.toAccountId as string | null;

      if (txAccountId === id) {
        // This transaction's account is being renamed
        store.setCell('transactions', txId, 'accountName', newName);
      }

      if (txToAccountId === id) {
        // This is a transfer where toAccount is being renamed
        store.setCell('transactions', txId, 'toAccountName', newName);
      }
    }
  }

  await saveStore();

  return {
    id,
    name: newName,
    description: newDescription,
    balance: currentAccount.balance,
    order: currentAccount.order,
  };
}