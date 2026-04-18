// Web-only implementation using sql.js
// Native implementation (iOS/Android) is in mmbakImport.native.ts

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

// MMBak database schema types
interface MMCategory {
  ID: number;
  uid: string | null;
  NAME: string;
  TYPE: number; // 0 = income, 1 = expense
  ORDERSEQ: number;
  pUid: number | string; // parent category ID (0 for top-level, as string or number)
  C_IS_DEL: number;
}

interface MMAccount {
  ID: number;
  uid: string;
  NIC_NAME: string;
  ORDERSEQ: number;
  currencyUid: string;
}

interface MMTransaction {
  AID: number;
  uid: string;
  assetUid: string;
  ctgUid: string | null;
  toAssetUid: string | null;
  ZCONTENT: string | null; // note
  ZDATA: string | null; // description
  ZDATE: string | number; // timestamp in milliseconds (stored as text)
  ZMONEY: string; // amount as string
  DO_TYPE: string; // '0' = income, '1' = expense
  ASSET_NIC: string; // account name
  CATEGORY_NAME: string | null;
  IN_ZMONEY: string | null; // for transfers
  UTIME: string | number; // timestamp in milliseconds
  IS_DEL: number;
}

// Cheddar schema types
interface CheddarCategory {
  id: string;
  name: string;
  icon: string;
  type: 'income' | 'expense';
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
  date: number; // timestamp
}

export interface MMBakImportResult {
  categories: number;
  subcategories: number;
  accounts: number;
  transactions: number;
  importDate: string;
}

// Default icon mapping for categories
const categoryIconMap: Record<string, string> = {
  // Income categories
  '🤑allowance': 'gift',
  '💰salary': 'briefcase',
  '💵petty cash': 'wallet',
  '🏅bonus': 'award',
  'other income': 'plus-circle',
  // Expense categories
  '🍜food': 'utensils',
  '👬🏻social life': 'users',
  '🐶pets': 'heart',
  '🚖transport': 'car',
  '🖼culture': 'film',
  '🪑household': 'home',
  '🧥apparel': 'shirt',
  '💄beauty': 'sparkles',
  '🧘🏼health': 'heart-pulse',
  '📙education': 'book',
  '🎁gift': 'gift',
  'other expense': 'minus-circle',
};

// Lucide icons for common category names
const getIconForCategory = (name: string): string => {
  const lowerName = name.toLowerCase();

  // Check exact matches first
  if (categoryIconMap[lowerName]) {
    return categoryIconMap[lowerName];
  }

  // Pattern matching
  if (lowerName.includes('food') || lowerName.includes('lunch') || lowerName.includes('dinner')) return 'utensils';
  if (lowerName.includes('transport') || lowerName.includes('car') || lowerName.includes('taxi')) return 'car';
  if (lowerName.includes('shopping')) return 'shopping-cart';
  if (lowerName.includes('entertainment') || lowerName.includes('movie') || lowerName.includes('culture')) return 'film';
  if (lowerName.includes('bill') || lowerName.includes('utility')) return 'receipt';
  if (lowerName.includes('health') || lowerName.includes('medical')) return 'heart-pulse';
  if (lowerName.includes('salary') || lowerName.includes('income')) return 'briefcase';
  if (lowerName.includes('gift') || lowerName.includes('allowance')) return 'gift';
  if (lowerName.includes('pet')) return 'heart';
  if (lowerName.includes('social')) return 'users';
  if (lowerName.includes('house') || lowerName.includes('home')) return 'home';
  if (lowerName.includes('cloth') || lowerName.includes('apparel')) return 'shirt';
  if (lowerName.includes('beauty')) return 'sparkles';
  if (lowerName.includes('education') || lowerName.includes('book')) return 'book';

  // Default icons
  return 'circle';
};

/**
 * Parse SQLite database on web using sql.js
 */
async function parseMMBakFileWeb(file: WebFile): Promise<{
  categories: MMCategory[];
  accounts: MMAccount[];
  transactions: MMTransaction[];
}> {
  const SQL = await getSqlJs();

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Create database instance
  const db = new SQL.Database(uint8Array);

  try {
    // Query categories
    const catResult = db.exec("SELECT * FROM ZCATEGORY ORDER BY ORDERSEQ");
    const categories: MMCategory[] = [];
    if (catResult.length > 0) {
      const { columns, values } = catResult[0];
      for (const row of values) {
        const cat: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          cat[col] = row[i];
        });
        categories.push(cat as unknown as MMCategory);
      }
    }

    // Query accounts
    const accResult = db.exec('SELECT * FROM ASSETS ORDER BY ORDERSEQ');
    const accounts: MMAccount[] = [];
    if (accResult.length > 0) {
      const { columns, values } = accResult[0];
      for (const row of values) {
        const acc: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          acc[col] = row[i];
        });
        accounts.push(acc as unknown as MMAccount);
      }
    }

    // Query transactions
    const txResult = db.exec("SELECT * FROM INOUTCOME WHERE IS_DEL = 0 OR IS_DEL IS NULL ORDER BY UTIME");
    const transactions: MMTransaction[] = [];
    if (txResult.length > 0) {
      const { columns, values } = txResult[0];
      for (const row of values) {
        const tx: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          tx[col] = row[i];
        });
        transactions.push(tx as unknown as MMTransaction);
      }
    }

    return { categories, accounts, transactions };
  } finally {
    db.close();
  }
}

/**
 * Validate MMBak file on web using sql.js
 */
async function validateMMBakFileWeb(file: WebFile): Promise<boolean> {
  try {
    const SQL = await getSqlJs();
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const db = new SQL.Database(uint8Array);

    try {
      const result = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ZCATEGORY', 'ASSETS', 'INOUTCOME')"
      );

      if (result.length === 0) return false;

      const tableNames = result[0].values.map(v => v[0] as string);
      return (
        tableNames.includes('ZCATEGORY') &&
        tableNames.includes('ASSETS') &&
        tableNames.includes('INOUTCOME')
      );
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('MMBak validation error (web):', error);
    return false;
  }
}

/**
 * Parse MMBak file and extract data (web implementation)
 */
export async function parseMMBakFile(file: WebFile): Promise<{
  categories: MMCategory[];
  accounts: MMAccount[];
  transactions: MMTransaction[];
}> {
  return parseMMBakFileWeb(file);
}

/**
 * Import MMBak data into Cheddar database (web implementation)
 */
export async function importFromMMBak(file: WebFile): Promise<MMBakImportResult> {
  const store = getStore();

  // Parse the MMBak file
  const { categories: mmCategories, accounts: mmAccounts, transactions: mmTransactions } = await parseMMBakFile(file);

  // Create ID mappings (MM uid -> Cheddar id)
  // Categories can be referenced by either ID (integer) or uid (UUID string)
  const categoryIdMap: Record<string, string> = {}; // Maps MM category uid to Cheddar ID
  const subcategoryIdMap: Record<string, string> = {}; // Maps MM subcategory uid to Cheddar ID
  const accountIdMap: Record<string, string> = {};

  // Track account balances from transactions
  const accountBalances: Record<string, number> = {};

  // Process categories - only import parent categories (pUid = 0 or "0")
  const cheddarCategories: Record<string, CheddarCategory> = {};

  for (const mmCat of mmCategories) {
    // Only import parent categories (pUid = 0, "0", or empty means it's a top-level category)
    const pUidNum = typeof mmCat.pUid === 'string' ? parseInt(mmCat.pUid) : mmCat.pUid;
    // NaN !== 0 is true, so empty string pUid will pass; also skip if pUid > 0 (subcategory)
    if (!isNaN(pUidNum) && pUidNum !== 0) continue;

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    // Map by uid (UUID) - transactions reference categories by uid
    if (mmCat.uid) {
      categoryIdMap[mmCat.uid] = id;
    }

    cheddarCategories[id] = {
      id,
      name: mmCat.NAME,
      icon: getIconForCategory(mmCat.NAME),
      type: mmCat.TYPE === 0 ? 'income' : 'expense',
    };
  }

  // Process subcategories and build lookup (subcategory uid -> parent category uid + subcategory name)
  const cheddarSubcategories: Record<string, CheddarSubcategory> = {};
  const subcategoryLookup: Record<string, { parentUid: string; parentCheddarId: string; name: string; cheddarId: string }> = {};

  for (const mmCat of mmCategories) {
    const pUidStr = String(mmCat.pUid || '');
    // Skip if no uid for this category
    if (!mmCat.uid) continue;

    // pUid can be: "0", empty string (parent categories), numeric string (old format), or UUID (new format)
    // Subcategories have pUid > 0 (numeric) or pUid is a UUID
    const pUidNum = parseInt(pUidStr);
    const isUuid = pUidStr.includes('-');
    const isSubcategory = isUuid || (!isNaN(pUidNum) && pUidNum > 0);

    if (isSubcategory) {
      // Find parent category - pUid references either parent's ID (numeric) or uid (UUID)
      const parentCat = isUuid
        ? mmCategories.find(c => c.uid === pUidStr)
        : mmCategories.find(c => c.ID === pUidNum);

      if (parentCat && parentCat.uid && categoryIdMap[parentCat.uid]) {
        const subcategoryId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        subcategoryIdMap[mmCat.uid] = subcategoryId;

        subcategoryLookup[mmCat.uid] = {
          parentUid: parentCat.uid,
          parentCheddarId: categoryIdMap[parentCat.uid],
          name: mmCat.NAME,
          cheddarId: subcategoryId,
        };

        cheddarSubcategories[subcategoryId] = {
          id: subcategoryId,
          name: mmCat.NAME,
          categoryId: categoryIdMap[parentCat.uid],
        };
      }
    }
  }

  // Process accounts
  const cheddarAccounts: Record<string, CheddarAccount> = {};

  for (const mmAcc of mmAccounts) {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    accountIdMap[mmAcc.uid] = id;
    accountBalances[id] = 0;

    cheddarAccounts[id] = {
      id,
      name: mmAcc.NIC_NAME,
      icon: 'wallet',
      description: null,
      balance: 0,
      order: mmAcc.ORDERSEQ,
    };
  }

  // Process transactions
  const cheddarTransactions: Record<string, CheddarTransaction> = {};

  for (const mmTx of mmTransactions) {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

    // Map category - ctgUid is the category/subcategory uid (UUID string)
    let categoryId: string | null = null;
    let subcategoryId: string | null = null;
    let subcategoryName: string | null = null;
    let categoryName: string | null = mmTx.CATEGORY_NAME;
    let categoryIcon: string | null = null;
    let categoryType: 'income' | 'expense' | null = null;

    if (mmTx.ctgUid) {
      // ctgUid is a UUID string referencing the category's uid field
      // Check if it's a subcategory
      if (subcategoryLookup[mmTx.ctgUid]) {
        // It's a subcategory - use parent category and set subcategoryId
        categoryId = subcategoryLookup[mmTx.ctgUid].parentCheddarId;
        subcategoryId = subcategoryLookup[mmTx.ctgUid].cheddarId;
        subcategoryName = subcategoryLookup[mmTx.ctgUid].name;
        const parentCat = cheddarCategories[categoryId];
        if (parentCat) {
          categoryName = parentCat.name;
          categoryIcon = parentCat.icon;
          categoryType = parentCat.type;
        }
      } else if (categoryIdMap[mmTx.ctgUid]) {
        // It's a parent category
        categoryId = categoryIdMap[mmTx.ctgUid];
        const cat = cheddarCategories[categoryId];
        if (cat) {
          categoryName = cat.name;
          categoryIcon = cat.icon;
          categoryType = cat.type;
        }
      }
    }

    // Map account
    const accountId = accountIdMap[mmTx.assetUid];
    const account = cheddarAccounts[accountId];

    if (!account) continue; // Skip transactions with missing accounts

    // Map to account for transfers
    const toAccountId = mmTx.toAssetUid ? accountIdMap[mmTx.toAssetUid] : null;
    const toAccount = toAccountId ? cheddarAccounts[toAccountId] : null;

    // Parse amount
    const amount = parseFloat(mmTx.ZMONEY) || 0;

    // Parse date - ZDATE is the transaction date in milliseconds (stored as text or number)
    // UTIME is the last modified time, we use ZDATE as the transaction date
    let date: number;
    if (mmTx.ZDATE) {
      // ZDATE is the transaction creation date in milliseconds
      const zdateVal = typeof mmTx.ZDATE === 'string' ? parseInt(mmTx.ZDATE) : mmTx.ZDATE;
      date = isNaN(zdateVal) ? Date.now() : zdateVal;
    } else if (mmTx.UTIME) {
      // Fallback to UTIME if ZDATE not available
      const utimeVal = typeof mmTx.UTIME === 'string' ? parseInt(mmTx.UTIME) : mmTx.UTIME;
      date = isNaN(utimeVal) ? Date.now() : utimeVal;
    } else {
      date = Date.now();
    }

    // Determine transaction type and amount based on DO_TYPE
    // DO_TYPE values in Money Manager:
    // 0 = income, 1 = expense
    // 3 = transfer out (money leaves this account)
    // 4 = transfer in (money arrives to this account)
    // 7 = income-type adjustment (adds to balance)
    // 8 = expense-type adjustment (subtracts from balance)
    let type: 'income' | 'expense' | 'transfer' = 'expense';
    let cheddarAmount = 0;

    const doType = mmTx.DO_TYPE;

    if (doType === '0') {
      // Income
      type = 'income';
      cheddarAmount = Math.abs(amount);
    } else if (doType === '1') {
      // Expense
      type = 'expense';
      cheddarAmount = -Math.abs(amount);
    } else if (doType === '3') {
      // Transfer out - money leaves this account
      type = 'transfer';
      cheddarAmount = -Math.abs(amount);
    } else if (doType === '4') {
      // Transfer in - money arrives to this account
      type = 'transfer';
      cheddarAmount = Math.abs(amount);
    } else if (doType === '7') {
      // Income-type adjustment (e.g., initial balance, correction)
      type = 'income';
      cheddarAmount = Math.abs(amount);
    } else if (doType === '8') {
      // Expense-type adjustment (e.g., correction)
      type = 'expense';
      cheddarAmount = -Math.abs(amount);
    } else {
      // Fallback for unknown types - treat as expense
      type = 'expense';
      cheddarAmount = -Math.abs(amount);
    }

    // Update account balance
    // For DO_TYPE 3/4 (transfers), each row belongs to one account and the paired row
    // handles the other account, so we only update the account this transaction belongs to
    accountBalances[accountId] += cheddarAmount;

    const toAccountName = toAccount?.name || null;

    cheddarTransactions[id] = {
      id,
      type,
      categoryId,
      subcategoryId,
      subcategoryName,
      categoryName,
      categoryIcon,
      categoryType,
      accountId,
      accountName: account.name,
      toAccountId,
      toAccountName,
      note: mmTx.ZCONTENT || null,
      description: mmTx.ZDATA || null,
      amount: cheddarAmount,
      date,
    };
  }

  // Update account balances
  for (const [id, balance] of Object.entries(accountBalances)) {
    if (cheddarAccounts[id]) {
      cheddarAccounts[id].balance = balance;
    }
  }

  // Enable subcategories if any were imported
  const hasSubcategories = Object.keys(cheddarSubcategories).length > 0;
  if (hasSubcategories) {
    store.setValue('subcategoriesEnabled', 'true');
  }

  // Save to Cheddar database
  store.setTables({
    categories: Object.fromEntries(
      Object.entries(cheddarCategories).map(([id, cat]) => [
        id,
        { name: cat.name, icon: cat.icon, type: cat.type }
      ])
    ),
    subcategories: Object.fromEntries(
      Object.entries(cheddarSubcategories).map(([id, sub]) => [
        id,
        { name: sub.name, categoryId: sub.categoryId }
      ])
    ),
    accounts: Object.fromEntries(
      Object.entries(cheddarAccounts).map(([id, acc]) => [
        id,
        { name: acc.name, icon: acc.icon, description: acc.description, balance: acc.balance, order: acc.order }
      ])
    ),
    transactions: Object.fromEntries(
      Object.entries(cheddarTransactions).map(([id, tx]) => [
        id,
        {
          type: tx.type,
          categoryId: tx.categoryId,
          subcategoryId: tx.subcategoryId,
          subcategoryName: tx.subcategoryName,
          categoryName: tx.categoryName,
          categoryIcon: tx.categoryIcon,
          categoryType: tx.categoryType,
          accountId: tx.accountId,
          accountName: tx.accountName,
          toAccountId: tx.toAccountId,
          toAccountName: tx.toAccountName,
          note: tx.note,
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
        }
      ])
    ),
  });

  await saveStore();

  return {
    categories: Object.keys(cheddarCategories).length,
    subcategories: Object.keys(cheddarSubcategories).length,
    accounts: Object.keys(cheddarAccounts).length,
    transactions: Object.keys(cheddarTransactions).length,
    importDate: new Date().toISOString(),
  };
}

/**
 * Validate if a file is a valid MMBak database (web implementation)
 * Returns true if valid, throws error with details if invalid
 */
export async function validateMMBakFile(file: WebFile): Promise<boolean> {
  return validateMMBakFileWeb(file);
}