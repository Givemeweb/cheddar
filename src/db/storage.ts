import { getStore, saveStore, generateId, generateTransactionId, isDatabaseReady } from './tinybase';
import { DEFAULT_CURRENCY_CODE, convertAmountWithRates } from './currency';
import {
  FREE_LIMITS,
  getCachedPremium,
  LimitReachedError,
  type LimitedResource,
} from './premium';

// Existing callers import the error from here; keep that path working.
export { LimitReachedError } from './premium';

// Types - IDs are strings for TinyBase
export interface Category {
  id: string;
  name: string;
  icon: string;
  type: 'income' | 'expense';
  /** Position within its type, used by the reorder screens. */
  order?: number;
}

export interface Account {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  balance: number;
  order: number;
  currency: string;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryType: 'income' | 'expense' | null;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  note: string | null;
  description: string | null;
  amount: number;
  currency: string;
  toCurrency: string | null; // transfer destination currency
  toAmount: number | null; // transfer amount in the destination currency
  date: Date;
  imagePath: string | null;
}

/**
 * Free-tier guard shared by both create paths. It only ever blocks new rows;
 * existing rows stay readable and editable (including after a refund). Bulk
 * imports replace tables wholesale, so they use assertImportWithinFreeCaps.
 */
async function assertCanCreate(resource: LimitedResource): Promise<void> {
  const count = Object.keys(getStore().getTable(resource) ?? {}).length;
  if (count >= FREE_LIMITS[resource] && !(await getCachedPremium())) {
    throw new LimitReachedError(resource);
  }
}

// Categories
export async function getCategories(): Promise<Category[]> {
  if (!isDatabaseReady()) return [];
  const store = getStore();
  const categories = store.getTable('categories');
  if (!categories) return [];

  const list: Category[] = Object.entries(categories).map(([id, data]) => ({
    id,
    name: data.name as string,
    icon: data.icon as string,
    type: data.type as 'income' | 'expense',
    order: typeof data.order === 'number' ? data.order : undefined,
  }));

  // Backfill once for categories created before ordering existed, keeping the
  // order they are displayed in today.
  if (list.some(c => c.order === undefined)) {
    list.forEach((category, index) => {
      store.setCell('categories', category.id, 'order', index);
      category.order = index;
    });
    await saveStore();
  }

  return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
    order: typeof row.order === 'number' ? row.order : undefined,
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
      icon: (data.icon as string) ?? 'wallet',
      description: data.description as string | null,
      balance: data.balance as number,
      order: (data.order as number) ?? 0,
      currency: (data.currency as string) || DEFAULT_CURRENCY_CODE,
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
    icon: (row.icon as string) ?? 'wallet',
    description: row.description as string | null,
    balance: row.balance as number,
    order: (row.order as number) ?? 0,
    currency: (row.currency as string) || DEFAULT_CURRENCY_CODE,
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
      subcategoryId: data.subcategoryId as string | null,
      subcategoryName: data.subcategoryName as string | null,
      categoryName: data.categoryName as string | null,
      categoryIcon: data.categoryIcon as string | null,
      categoryType: data.categoryType as 'income' | 'expense' | null,
      accountId: data.accountId as string,
      accountName: data.accountName as string,
      toAccountId: data.toAccountId as string | null,
      toAccountName: data.toAccountName as string | null,
      note: data.note as string | null,
      description: data.description as string | null,
      amount: data.amount as number,
      currency: (data.currency as string) || DEFAULT_CURRENCY_CODE,
      toCurrency: (data.toCurrency as string | null) ?? null,
      toAmount: (data.toAmount as number | null) ?? null,
      date: new Date(data.date as number),
      imagePath: data.imagePath as string | null,
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function addTransaction(tx: {
  type: 'income' | 'expense' | 'transfer';
  categoryId?: string | null;
  subcategoryId?: string | null;
  subcategoryName?: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  categoryType?: 'income' | 'expense' | null;
  accountId: string;
  accountName: string;
  toAccountId?: string | null;
  toAccountName?: string | null;
  note?: string | null;
  description?: string | null;
  amount: number;
  currency?: string;
  date: Date;
  imagePath?: string | null;
}): Promise<Transaction> {
  if (!isDatabaseReady()) {
    throw new Error('Database not initialized');
  }
  const store = getStore();
  const id = generateTransactionId();

  // Currency: explicit value, else the account's currency, else app default.
  const currency = tx.currency
    || ((store.getCell('accounts', tx.accountId, 'currency') as string) || DEFAULT_CURRENCY_CODE);

  store.setRow('transactions', id, {
    type: tx.type,
    categoryId: tx.categoryId ?? null,
    subcategoryId: tx.subcategoryId ?? null,
    subcategoryName: tx.subcategoryName ?? null,
    categoryName: tx.categoryName ?? null,
    categoryIcon: tx.categoryIcon ?? null,
    categoryType: tx.categoryType ?? null,
    accountId: tx.accountId,
    accountName: tx.accountName,
    toAccountId: tx.toAccountId ?? null,
    toAccountName: tx.toAccountName ?? null,
    note: tx.note ?? null,
    description: tx.description ?? null,
    amount: tx.amount,
    currency,
    toCurrency: null,
    toAmount: null,
    date: tx.date.getTime(),
    imagePath: tx.imagePath ?? null,
  });

  // Update account balance(s)
  if (tx.type === 'transfer' && tx.toAccountId) {
    // Transfer: debit from account, credit to toAccountId.
    // When the accounts use different currencies, convert the amount at
    // the destination account's currency so the received value is correct.
    const fromCurrency = currency;
    const toCurrency = ((store.getCell('accounts', tx.toAccountId, 'currency') as string) || DEFAULT_CURRENCY_CODE);
    const toAmount = await convertAmountWithRates(tx.amount, fromCurrency, toCurrency);

    // Persist the converted values so later edits/deletes don't depend on
    // the exchange rate at that future moment.
    store.setCell('transactions', id, 'toCurrency', toCurrency);
    store.setCell('transactions', id, 'toAmount', toAmount);

    const fromBalance = store.getCell('accounts', tx.accountId, 'balance') as number ?? 0;
    const toBalance = store.getCell('accounts', tx.toAccountId, 'balance') as number ?? 0;
    store.setCell('accounts', tx.accountId, 'balance', fromBalance + tx.amount); // amount is negative
    store.setCell('accounts', tx.toAccountId, 'balance', toBalance - toAmount); // positive equivalent converted
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
    subcategoryId: tx.subcategoryId ?? null,
    subcategoryName: tx.subcategoryName ?? null,
    categoryName: tx.categoryName ?? null,
    categoryIcon: tx.categoryIcon ?? null,
    categoryType: tx.categoryType ?? null,
    accountId: tx.accountId,
    accountName: tx.accountName,
    toAccountId: tx.toAccountId ?? null,
    toAccountName: tx.toAccountName ?? null,
    note: tx.note ?? null,
    description: tx.description ?? null,
    amount: tx.amount,
    currency,
    toCurrency: tx.type === 'transfer' && tx.toAccountId ? ((store.getCell('transactions', id, 'toCurrency') as string) ?? null) : null,
    toAmount: tx.type === 'transfer' && tx.toAccountId ? ((store.getCell('transactions', id, 'toAmount') as number) ?? null) : null,
    date: tx.date,
    imagePath: tx.imagePath ?? null,
  };
}

export async function getTransactionById(id: string): Promise<Transaction | undefined> {
  if (!isDatabaseReady()) return undefined;
  const store = getStore();
  const row = store.getRow('transactions', id);
  if (!row || !row.type) return undefined;

  return {
    id,
    type: row.type as 'income' | 'expense' | 'transfer',
    categoryId: row.categoryId as string | null,
    subcategoryId: row.subcategoryId as string | null,
    subcategoryName: row.subcategoryName as string | null,
    categoryName: row.categoryName as string | null,
    categoryIcon: row.categoryIcon as string | null,
    categoryType: row.categoryType as 'income' | 'expense' | null,
    accountId: row.accountId as string,
    accountName: row.accountName as string,
    toAccountId: row.toAccountId as string | null,
    toAccountName: row.toAccountName as string | null,
    note: row.note as string | null,
    description: row.description as string | null,
    amount: row.amount as number,
    currency: (row.currency as string) || DEFAULT_CURRENCY_CODE,
    toCurrency: (row.toCurrency as string | null) ?? null,
    toAmount: (row.toAmount as number | null) ?? null,
    date: new Date(row.date as number),
    imagePath: row.imagePath as string | null,
  };
}

export async function updateTransaction(id: string, updates: {
  type?: 'income' | 'expense' | 'transfer';
  categoryId?: string | null;
  subcategoryId?: string | null;
  subcategoryName?: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  categoryType?: 'income' | 'expense' | null;
  accountId?: string;
  accountName?: string;
  toAccountId?: string | null;
  toAccountName?: string | null;
  note?: string | null;
  description?: string | null;
  amount?: number;
  currency?: string;
  date?: Date;
  imagePath?: string | null;
}): Promise<Transaction | undefined> {
  if (!isDatabaseReady()) return undefined;
  const store = getStore();

  const currentTx = await getTransactionById(id);
  if (!currentTx) return undefined;

  // Get old values for balance adjustment
  const oldType = currentTx.type;
  const oldAmount = currentTx.amount;
  const oldAccountId = currentTx.accountId;
  const oldToAccountId = currentTx.toAccountId;

  // Get new values
  const newType = updates.type ?? currentTx.type;
  const newAmount = updates.amount ?? currentTx.amount;
  const newAccountId = updates.accountId ?? currentTx.accountId;
  const newToAccountId = updates.toAccountId ?? currentTx.toAccountId;
  const newAccountName = updates.accountName ?? currentTx.accountName;
  const newToAccountName = updates.toAccountName ?? currentTx.toAccountName;
  // Currency follows the (possibly changed) from-account unless set explicitly
  const newCurrency = updates.currency
    || ((store.getCell('accounts', newAccountId, 'currency') as string) || DEFAULT_CURRENCY_CODE);

  // Reverse old balance changes
  if (oldType === 'transfer' && oldToAccountId) {
    const fromBalance = store.getCell('accounts', oldAccountId, 'balance') as number ?? 0;
    const toBalance = store.getCell('accounts', oldToAccountId, 'balance') as number ?? 0;
    // Prefer the stored converted amount from entry time; fall back to a
    // live conversion for legacy rows without it.
    const oldToAmount = currentTx.toAmount
      ?? (await convertAmountWithRates(oldAmount, currentTx.currency || DEFAULT_CURRENCY_CODE,
        ((store.getCell('accounts', oldToAccountId, 'currency') as string) || DEFAULT_CURRENCY_CODE)));
    store.setCell('accounts', oldAccountId, 'balance', fromBalance - oldAmount); // reverse: was negative, add back
    store.setCell('accounts', oldToAccountId, 'balance', toBalance + oldToAmount); // reverse the converted credit
  } else {
    const currentBalance = store.getCell('accounts', oldAccountId, 'balance') as number ?? 0;
    store.setCell('accounts', oldAccountId, 'balance', currentBalance - oldAmount);
  }

  // Update the transaction row
  store.setRow('transactions', id, {
    type: newType,
    categoryId: updates.categoryId ?? currentTx.categoryId,
    subcategoryId: updates.subcategoryId ?? currentTx.subcategoryId,
    subcategoryName: updates.subcategoryName ?? currentTx.subcategoryName,
    categoryName: updates.categoryName ?? currentTx.categoryName,
    categoryIcon: updates.categoryIcon ?? currentTx.categoryIcon,
    categoryType: updates.categoryType ?? currentTx.categoryType,
    accountId: newAccountId,
    accountName: newAccountName,
    toAccountId: newToAccountId,
    toAccountName: newToAccountName,
    note: updates.note ?? currentTx.note,
    description: updates.description ?? currentTx.description,
    amount: newAmount,
    currency: newCurrency,
    toCurrency: null,
    toAmount: null,
    date: (updates.date ?? currentTx.date).getTime(),
    imagePath: updates.imagePath ?? currentTx.imagePath,
  });

  // Apply new balance changes
  if (newType === 'transfer' && newToAccountId) {
    const fromBalance = store.getCell('accounts', newAccountId, 'balance') as number ?? 0;
    const toBalance = store.getCell('accounts', newToAccountId, 'balance') as number ?? 0;
    const newToCurrency = ((store.getCell('accounts', newToAccountId, 'currency') as string) || DEFAULT_CURRENCY_CODE);
    const newToAmount = await convertAmountWithRates(newAmount, newCurrency, newToCurrency);
    // Persist the converted values for later edits/deletes
    store.setCell('transactions', id, 'toCurrency', newToCurrency);
    store.setCell('transactions', id, 'toAmount', newToAmount);
    store.setCell('accounts', newAccountId, 'balance', fromBalance + newAmount);
    store.setCell('accounts', newToAccountId, 'balance', toBalance - newToAmount);
  } else {
    const currentBalance = store.getCell('accounts', newAccountId, 'balance') as number ?? 0;
    store.setCell('accounts', newAccountId, 'balance', currentBalance + newAmount);
  }

  await saveStore();

  return getTransactionById(id);
}

export async function deleteTransaction(id: string): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();

  // Reverse balance changes before deleting
  const tx = await getTransactionById(id);
  if (tx) {
    if (tx.type === 'transfer' && tx.toAccountId) {
      const fromBalance = store.getCell('accounts', tx.accountId, 'balance') as number ?? 0;
      const toBalance = store.getCell('accounts', tx.toAccountId, 'balance') as number ?? 0;
      // Prefer the stored converted amount from entry time; fall back to a
      // live conversion for legacy rows without it.
      const toAmount = tx.toAmount
        ?? (await convertAmountWithRates(tx.amount, tx.currency || DEFAULT_CURRENCY_CODE,
          ((store.getCell('accounts', tx.toAccountId, 'currency') as string) || DEFAULT_CURRENCY_CODE)));
      store.setCell('accounts', tx.accountId, 'balance', fromBalance - tx.amount);
      store.setCell('accounts', tx.toAccountId, 'balance', toBalance + toAmount);
    } else {
      const currentBalance = store.getCell('accounts', tx.accountId, 'balance') as number ?? 0;
      store.setCell('accounts', tx.accountId, 'balance', currentBalance - tx.amount);
    }
  }

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
  await assertCanCreate('categories');
  const store = getStore();
  const id = generateId();

  // Append at the end of its own type's list.
  const table = store.getTable('categories') ?? {};
  const nextOrder = Object.values(table)
    .filter(row => row.type === category.type)
    .reduce((max, row) => Math.max(max, typeof row.order === 'number' ? row.order : -1), -1) + 1;

  store.setRow('categories', id, {
    name: category.name,
    icon: category.icon,
    type: category.type,
    order: nextOrder,
  });

  await saveStore();

  return {
    id,
    name: category.name,
    icon: category.icon,
    type: category.type,
    order: nextOrder,
  };
}

/** Persist a new order for one type's categories. */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  orderedIds.forEach((id, index) => {
    store.setCell('categories', id, 'order', index);
  });
  await saveStore();
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
    order: currentCategory.order ?? 0,
  });

  // Update all transactions that reference this category
  const transactions = store.getTable('transactions');
  if (transactions) {
    for (const [txId, txData] of Object.entries(transactions)) {
      const txCategoryId = txData.categoryId as string | null;
      if (txCategoryId === id) {
        // This transaction's category is being updated
        store.setCell('transactions', txId, 'categoryName', newName);
        store.setCell('transactions', txId, 'categoryIcon', newIcon);
      }
    }
  }

  await saveStore();

  return {
    id,
    name: newName,
    icon: newIcon,
    type: currentCategory.type,
    order: currentCategory.order ?? 0,
  };
}

// Account management
export async function addAccount(account: {
  name: string;
  icon?: string;
  description?: string | null;
  currency?: string;
}): Promise<Account> {
  if (!isDatabaseReady()) {
    throw new Error('Database not initialized');
  }
  await assertCanCreate('accounts');
  const store = getStore();
  const id = generateId();

  // Get the highest order and add 1
  const accounts = await getAccounts();
  const maxOrder = accounts.length > 0 ? Math.max(...accounts.map(a => a.order)) : -1;

  const accountIcon = account.icon ?? 'wallet';
  const accountCurrency = account.currency || DEFAULT_CURRENCY_CODE;

  store.setRow('accounts', id, {
    name: account.name,
    icon: accountIcon,
    description: account.description ?? null,
    balance: 0,
    order: maxOrder + 1,
    currency: accountCurrency,
  });

  await saveStore();

  return {
    id,
    name: account.name,
    icon: accountIcon,
    description: account.description ?? null,
    balance: 0,
    order: maxOrder + 1,
    currency: accountCurrency,
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

export async function updateAccount(id: string, updates: { name?: string; icon?: string; description?: string | null; currency?: string }): Promise<Account | undefined> {
  if (!isDatabaseReady()) return undefined;
  const store = getStore();

  const currentAccount = await getAccountById(id);
  if (!currentAccount) return undefined;

  const newName = updates.name ?? currentAccount.name;
  const newIcon = updates.icon ?? currentAccount.icon;
  const newDescription = updates.description ?? currentAccount.description;
  const newCurrency = updates.currency || currentAccount.currency;

  // If the currency changes, convert the stored balance at current rates so
  // the account keeps its real-world value across the switch.
  let newBalance = currentAccount.balance;
  if (newCurrency !== currentAccount.currency) {
    newBalance = await convertAmountWithRates(
      currentAccount.balance,
      currentAccount.currency,
      newCurrency,
    );
  }

  // Update account
  store.setRow('accounts', id, {
    name: newName,
    icon: newIcon,
    description: newDescription,
    balance: newBalance,
    order: currentAccount.order,
    currency: newCurrency,
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
    icon: newIcon,
    description: newDescription,
    balance: newBalance,
    order: currentAccount.order,
    currency: newCurrency,
  };
}

// Reminder prompt
/**
 * The reminder prompt is offered once, right after the first transaction is
 * saved. The transaction screen queues it, then the home screen consumes it
 * when it regains focus. The seen flag is stored when it is consumed so a
 * dismissed modal never comes back.
 */
export async function shouldOfferReminderPrompt(): Promise<boolean> {
  if (!isDatabaseReady()) return false;
  const store = getStore();
  if (store.getValue('reminderPromptSeen') === 'true') return false;
  const transactions = store.getTable('transactions');
  return !transactions || Object.keys(transactions).length === 0;
}

export async function requestReminderPrompt(): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  if (store.getValue('reminderPromptSeen') === 'true') return;
  store.setValue('reminderPromptPending', 'true');
  await saveStore();
}

export async function consumeReminderPrompt(): Promise<boolean> {
  if (!isDatabaseReady()) return false;
  const store = getStore();
  if (store.getValue('reminderPromptPending') !== 'true') return false;

  store.setValue('reminderPromptPending', 'false');
  if (store.getValue('reminderPromptSeen') === 'true') {
    await saveStore();
    return false;
  }

  store.setValue('reminderPromptSeen', 'true');
  await saveStore();
  return true;
}

export async function markReminderPromptSeen(): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().setValue('reminderPromptSeen', 'true');
  await saveStore();
}

// Alarm settings
export interface AlarmSettings {
  enabled: boolean;
  time: string; // HH:MM format
  days: number[]; // 0-6 for Sunday-Saturday
}

export async function getAlarmSettings(): Promise<AlarmSettings> {
  if (!isDatabaseReady()) {
    return { enabled: false, time: '21:00', days: [0, 1, 2, 3, 4, 5, 6] };
  }
  const store = getStore();

  const enabled = store.getValue('alarmEnabled') as string;
  const time = store.getValue('alarmTime') as string;
  const days = store.getValue('alarmDays') as string;

  return {
    enabled: enabled === 'true',
    time: time ?? '21:00',
    days: days ? days.split(',').map(Number) : [0, 1, 2, 3, 4, 5, 6],
  };
}

export async function saveAlarmSettings(settings: AlarmSettings): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();

  store.setValue('alarmEnabled', settings.enabled ? 'true' : 'false');
  store.setValue('alarmTime', settings.time);
  store.setValue('alarmDays', settings.days.join(','));

  await saveStore();
}