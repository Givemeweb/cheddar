// Web-only implementation using sql.js
// Native implementation (iOS/Android) is in sqlImport.native.ts

import { getStore, saveStore } from '../db/tinybase';

// Dynamic import for sql.js (web only)
type SqlJsStatic = {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
};

type SqlJsDatabase = {
  run: (sql: string) => void;
  exec: (sql: string) => SqlJsResult[];
  close: () => void;
};

type SqlJsResult = {
  columns: string[];
  values: (string | number | null | Uint8Array)[][];
};

type SqlJsModule = {
  default: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
};

// Web File type
type WebFile = globalThis.File;

// Cached sql.js instance for web
let sqlJsPromise: Promise<SqlJsStatic> | null = null;

/**
 * Load WASM from CDN as ArrayBuffer
 */
async function loadWasmFromCdn(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM: ${response.status}`);
  }
  return response.arrayBuffer();
}

/**
 * Get or initialize sql.js (web only)
 * Uses async loading to defer WASM loading until needed
 */
async function getSqlJs(): Promise<SqlJsStatic> {
  if (sqlJsPromise) return sqlJsPromise;

  sqlJsPromise = (async () => {
    // Import sql.js
    // @ts-ignore - sql.js doesn't have proper types for browser build
    const initSqlJs = (await import('sql.js')).default;

    // Initialize with WASM loaded from CDN
    const SQL = await initSqlJs({
      locateFile: (file: string) => {
        // Return CDN URL for WASM file
        return `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`;
      },
    });

    return SQL;
  })();

  return sqlJsPromise;
}

// SQLite table types for Cheddar database
interface CheddarCategory {
  id: string;
  name: string;
  icon: string;
  type: string;
}

interface CheddarSubcategory {
  id: string;
  name: string;
  categoryId: string;
}

interface CheddarAccount {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  balance: number;
  order: number;
}

interface CheddarTransaction {
  id: string;
  type: string;
  categoryId: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  note: string | null;
  description: string | null;
  amount: number;
  date: number;
}

export interface SqlImportResult {
  categories: number;
  subcategories: number;
  accounts: number;
  transactions: number;
  importDate: string;
}

/**
 * Parse SQLite database on web using sql.js
 */
async function parseSqlFileWeb(file: WebFile): Promise<{
  categories: CheddarCategory[];
  subcategories: CheddarSubcategory[];
  accounts: CheddarAccount[];
  transactions: CheddarTransaction[];
}> {
  const SQL = await getSqlJs();

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Create database instance
  const db = new SQL.Database(uint8Array);

  try {
    // Query categories
    const catResult = db.exec('SELECT * FROM categories');
    const categories: CheddarCategory[] = [];
    if (catResult.length > 0) {
      const { columns, values } = catResult[0];
      for (const row of values) {
        const cat: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          cat[col] = row[i];
        });
        categories.push(cat as unknown as CheddarCategory);
      }
    }

    // Query subcategories (if table exists)
    let subcategories: CheddarSubcategory[] = [];
    try {
      const subResult = db.exec('SELECT * FROM subcategories');
      if (subResult.length > 0) {
        const { columns, values } = subResult[0];
        for (const row of values) {
          const sub: Record<string, unknown> = {};
          columns.forEach((col, i) => {
            sub[col] = row[i];
          });
          subcategories.push(sub as unknown as CheddarSubcategory);
        }
      }
    } catch (e) {
      console.log('[SQLImport] No subcategories table or empty');
    }

    // Query accounts
    const accResult = db.exec('SELECT id, name, icon, description, balance, `order` FROM accounts');
    const accounts: CheddarAccount[] = [];
    if (accResult.length > 0) {
      const { columns, values } = accResult[0];
      for (const row of values) {
        const acc: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          acc[col] = row[i];
        });
        accounts.push(acc as unknown as CheddarAccount);
      }
    }

    // Query transactions
    const txResult = db.exec('SELECT id, type, categoryId, subcategoryId, subcategoryName, accountId, accountName, toAccountId, toAccountName, note, description, amount, date FROM transactions');
    const transactions: CheddarTransaction[] = [];
    if (txResult.length > 0) {
      const { columns, values } = txResult[0];
      for (const row of values) {
        const tx: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          tx[col] = row[i];
        });
        transactions.push(tx as unknown as CheddarTransaction);
      }
    }

    return { categories, subcategories, accounts, transactions };
  } finally {
    db.close();
  }
}

/**
 * Validate SQLite file on web using sql.js
 */
async function validateSqlFileWeb(file: WebFile): Promise<boolean> {
  try {
    const SQL = await getSqlJs();
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const db = new SQL.Database(uint8Array);

    try {
      const result = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('categories', 'accounts', 'transactions')"
      );

      if (result.length === 0) return false;

      const tableNames = result[0].values.map(v => v[0] as string);
      return (
        tableNames.includes('categories') &&
        tableNames.includes('accounts') &&
        tableNames.includes('transactions')
      );
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('SQLImport validation error (web):', error);
    return false;
  }
}

/**
 * Parse SQLite file and extract data (web implementation)
 */
export async function parseSqlFile(file: WebFile): Promise<{
  categories: CheddarCategory[];
  subcategories: CheddarSubcategory[];
  accounts: CheddarAccount[];
  transactions: CheddarTransaction[];
}> {
  return parseSqlFileWeb(file);
}

/**
 * Import SQLite data into Cheddar database (web implementation)
 */
export async function importFromSql(file: WebFile): Promise<SqlImportResult> {
  const store = getStore();

  // Parse the SQLite file
  const { categories, subcategories, accounts, transactions } = await parseSqlFile(file);

  // Convert arrays to records (TinyBase format)
  const categoriesRecord: Record<string, { name: string; icon: string; type: string }> = {};
  for (const cat of categories) {
    categoriesRecord[cat.id] = {
      name: cat.name,
      icon: cat.icon,
      type: cat.type,
    };
  }

  const subcategoriesRecord: Record<string, { name: string; categoryId: string }> = {};
  for (const sub of subcategories) {
    subcategoriesRecord[sub.id] = {
      name: sub.name,
      categoryId: sub.categoryId,
    };
  }

  const accountsRecord: Record<string, { name: string; icon: string; description: string | null; balance: number; order: number }> = {};
  for (const acc of accounts) {
    accountsRecord[acc.id] = {
      name: acc.name,
      icon: acc.icon || 'wallet',
      description: acc.description,
      balance: acc.balance,
      order: acc.order,
    };
  }

  const transactionsRecord: Record<string, {
    type: string;
    categoryId: string | null;
    subcategoryId: string | null;
    subcategoryName: string | null;
    accountId: string;
    accountName: string;
    toAccountId: string | null;
    toAccountName: string | null;
    note: string | null;
    description: string | null;
    amount: number;
    date: number;
  }> = {};
  for (const tx of transactions) {
    transactionsRecord[tx.id] = {
      type: tx.type,
      categoryId: tx.categoryId,
      subcategoryId: tx.subcategoryId,
      subcategoryName: tx.subcategoryName,
      accountId: tx.accountId,
      accountName: tx.accountName,
      toAccountId: tx.toAccountId,
      toAccountName: tx.toAccountName,
      note: tx.note,
      description: tx.description,
      amount: tx.amount,
      date: tx.date,
    };
  }

  // Enable subcategories if any were imported
  if (Object.keys(subcategoriesRecord).length > 0) {
    store.setValue('subcategoriesEnabled', 'true');
  }

  // Save to Cheddar database
  store.setTables({
    categories: categoriesRecord,
    subcategories: subcategoriesRecord,
    accounts: accountsRecord,
    transactions: transactionsRecord,
  });

  await saveStore();

  return {
    categories: Object.keys(categoriesRecord).length,
    subcategories: Object.keys(subcategoriesRecord).length,
    accounts: Object.keys(accountsRecord).length,
    transactions: Object.keys(transactionsRecord).length,
    importDate: new Date().toISOString(),
  };
}

/**
 * Validate if a file is a valid Cheddar SQLite database (web implementation)
 * Returns true if valid, throws error with details if invalid
 */
export async function validateSqlFile(file: WebFile): Promise<boolean> {
  return validateSqlFileWeb(file);
}