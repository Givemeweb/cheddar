import { Platform } from 'react-native';
import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { getStore, saveStore } from '../db/tinybase';

// Native-only implementation (iOS/Android)
// Web implementation is in mmbakImport.web.ts

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

const TEMP_DB_NAME = 'mmbak_temp_import.db';

/**
 * Open database file by copying to SQLite directory (Native only)
 */
async function openDatabaseFromUri(uri: string): Promise<SQLiteDatabase> {
  console.log('[MMBak] Opening database from URI:', uri);

  // Create a File instance from the URI
  const sourceFile = new ExpoFile(uri);
  console.log('[MMBak] Source file URI:', sourceFile.uri);
  console.log('[MMBak] Source file exists:', sourceFile.exists);
  console.log('[MMBak] Source file size:', sourceFile.size);

  if (!sourceFile.exists) {
    throw new Error('Source file does not exist');
  }

  // Copy to cache directory - read bytes and write manually for reliability
  const destFile = new ExpoFile(Paths.cache, TEMP_DB_NAME);
  console.log('[MMBak] Destination file URI:', destFile.uri);

  // Delete existing temp file if present
  if (destFile.exists) {
    destFile.delete();
    console.log('[MMBak] Deleted existing temp file');
  }

  // Read bytes from source and write to destination
  console.log('[MMBak] Reading bytes from source file...');
  const bytes = await sourceFile.bytes();
  console.log('[MMBak] Read', bytes.length, 'bytes');

  // Write to destination
  destFile.write(bytes);
  console.log('[MMBak] Wrote bytes to destination');

  // Verify the copy worked
  console.log('[MMBak] Destination exists after write:', destFile.exists);
  console.log('[MMBak] Destination size after write:', destFile.size);

  // Open the database using the directory URI path
  const cacheUri = Paths.cache.uri;
  console.log('[MMBak] Cache directory URI:', cacheUri);

  // For expo-sqlite, we need to strip file:// prefix for the directory
  const dbPath = cacheUri.replace(/^file:\/\//, '');
  console.log('[MMBak] Opening database with name:', TEMP_DB_NAME, 'directory:', dbPath);

  const db = openDatabaseSync(TEMP_DB_NAME, {}, dbPath);
  console.log('[MMBak] Database opened');
  return db;
}

/**
 * Clean up temporary database file (Native only)
 */
async function cleanupTempDatabase(): Promise<void> {
  try {
    const destFile = new ExpoFile(Paths.cache, TEMP_DB_NAME);
    if (destFile.exists) {
      destFile.delete();
      console.log('[MMBak] Temp database cleaned up');
    }
  } catch (error) {
    console.error('[MMBak] Error cleaning up temp database:', error);
  }
}

/**
 * Parse MMBak file and extract data (native implementation)
 */
export async function parseMMBakFile(uri: string): Promise<{
  categories: MMCategory[];
  accounts: MMAccount[];
  transactions: MMTransaction[];
}> {
  let db: SQLiteDatabase | null = null;

  try {
    // Copy file and open database
    db = await openDatabaseFromUri(uri);

    // Get all categories (excluding deleted ones)
    const categories = db.getAllSync<MMCategory>(
      'SELECT * FROM ZCATEGORY WHERE C_IS_DEL = 0 OR C_IS_DEL IS NULL ORDER BY ORDERSEQ'
    );

    // Get all accounts
    const accounts = db.getAllSync<MMAccount>(
      'SELECT * FROM ASSETS ORDER BY ORDERSEQ'
    );

    // Get all transactions (excluding deleted ones)
    const transactions = db.getAllSync<MMTransaction>(
      'SELECT * FROM INOUTCOME WHERE IS_DEL = 0 OR IS_DEL IS NULL ORDER BY UTIME'
    );

    return { categories, accounts, transactions };
  } finally {
    // Close database
    if (db) {
      db.closeSync();
    }
    // Clean up temp file
    await cleanupTempDatabase();
  }
}

/**
 * Import MMBak data into Cheddar database (native implementation)
 */
export async function importFromMMBak(uri: string): Promise<MMBakImportResult> {
  const store = getStore();

  // Parse the MMBak file
  const { categories: mmCategories, accounts: mmAccounts, transactions: mmTransactions } = await parseMMBakFile(uri);

  // Create ID mappings (MM ID -> Cheddar id)
  const categoryIdMap: Record<number, string> = {}; // Maps MM category ID to Cheddar ID
  const subcategoryIdMap: Record<number, string> = {}; // Maps MM subcategory ID to Cheddar ID
  const accountIdMap: Record<string, string> = {};

  // Track account balances from transactions
  const accountBalances: Record<string, number> = {};

  // Process categories - only import parent categories (pUid = 0 or "0")
  const cheddarCategories: Record<string, CheddarCategory> = {};

  for (const mmCat of mmCategories) {
    // Only import parent categories (pUid = 0 or "0" means it's a top-level category)
    const pUidNum = typeof mmCat.pUid === 'string' ? parseInt(mmCat.pUid) : mmCat.pUid;
    if (pUidNum !== 0) continue;

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    categoryIdMap[mmCat.ID] = id;

    cheddarCategories[id] = {
      id,
      name: mmCat.NAME,
      icon: getIconForCategory(mmCat.NAME),
      type: mmCat.TYPE === 0 ? 'income' : 'expense',
    };
  }

  // Process subcategories and build lookup (subcategory ID -> parent category ID + subcategory name)
  const cheddarSubcategories: Record<string, CheddarSubcategory> = {};
  const subcategoryLookup: Record<number, { parentId: number; parentCheddarId: string; name: string; cheddarId: string }> = {};

  for (const mmCat of mmCategories) {
    const pUidNum = typeof mmCat.pUid === 'string' ? parseInt(mmCat.pUid) : mmCat.pUid;
    if (pUidNum > 0) {
      const parentCat = mmCategories.find(c => c.ID === pUidNum);
      if (parentCat && categoryIdMap[parentCat.ID]) {
        const subcategoryId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        subcategoryIdMap[mmCat.ID] = subcategoryId;

        subcategoryLookup[mmCat.ID] = {
          parentId: pUidNum,
          parentCheddarId: categoryIdMap[parentCat.ID],
          name: mmCat.NAME,
          cheddarId: subcategoryId,
        };

        cheddarSubcategories[subcategoryId] = {
          id: subcategoryId,
          name: mmCat.NAME,
          categoryId: categoryIdMap[parentCat.ID],
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

    // Determine transaction type
    let type: 'income' | 'expense' | 'transfer' = 'expense';
    if (mmTx.toAssetUid && mmTx.IN_ZMONEY) {
      type = 'transfer';
    } else if (mmTx.DO_TYPE === '0') {
      type = 'income';
    } else {
      type = 'expense';
    }

    // Map category - ctgUid is the category/subcategory ID as string
    let categoryId: string | null = null;
    let subcategoryId: string | null = null;
    let subcategoryName: string | null = null;
    let categoryName: string | null = mmTx.CATEGORY_NAME;
    let categoryIcon: string | null = null;
    let categoryType: 'income' | 'expense' | null = null;

    if (mmTx.ctgUid) {
      const ctgId = parseInt(mmTx.ctgUid);
      if (!isNaN(ctgId)) {
        // Check if it's a subcategory
        if (subcategoryLookup[ctgId]) {
          // It's a subcategory - use parent category and set subcategoryId
          categoryId = subcategoryLookup[ctgId].parentCheddarId;
          subcategoryId = subcategoryLookup[ctgId].cheddarId;
          subcategoryName = subcategoryLookup[ctgId].name;
          const parentCat = cheddarCategories[categoryId];
          if (parentCat) {
            categoryName = parentCat.name;
            categoryIcon = parentCat.icon;
            categoryType = parentCat.type;
          }
        } else if (categoryIdMap[ctgId]) {
          // It's a parent category
          categoryId = categoryIdMap[ctgId];
          const cat = cheddarCategories[categoryId];
          if (cat) {
            categoryName = cat.name;
            categoryIcon = cat.icon;
            categoryType = cat.type;
          }
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

    // Calculate amount based on type
    // In MM: expense amounts are positive, income amounts are positive
    // In Cheddar: expense amounts are negative, income amounts are positive
    let cheddarAmount = amount;
    if (type === 'expense') {
      cheddarAmount = -Math.abs(amount);
    } else if (type === 'income') {
      cheddarAmount = Math.abs(amount);
    } else if (type === 'transfer') {
      // Transfers: amount is negative (outgoing), IN_ZMONEY is positive (incoming)
      cheddarAmount = -Math.abs(amount);
    }

    // Update account balance
    accountBalances[accountId] += cheddarAmount;
    if (toAccountId && toAccount) {
      accountBalances[toAccountId] += Math.abs(amount);
    }

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
      toAccountName: toAccount?.name || null,
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
 * Validate if a file is a valid MMBak database (native implementation)
 * Returns true if valid, throws error with details if invalid
 */
export async function validateMMBakFile(uri: string): Promise<boolean> {
  let db: SQLiteDatabase | null = null;

  try {
    console.log('[MMBak] Validating file:', uri);
    console.log('[MMBak] Platform:', Platform.OS);

    // Create file instance and check existence
    let sourceFile: ExpoFile;
    try {
      sourceFile = new ExpoFile(uri);
      console.log('[MMBak] ExpoFile created, uri:', sourceFile.uri);
    } catch (e) {
      console.error('[MMBak] Failed to create ExpoFile:', e);
      throw new Error(`Failed to access file: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Check if file exists
    let exists: boolean;
    try {
      exists = sourceFile.exists;
      console.log('[MMBak] File exists:', exists);
    } catch (e) {
      console.error('[MMBak] Error checking file existence:', e);
      throw new Error(`Cannot check file existence: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!exists) {
      throw new Error('Selected file does not exist or cannot be accessed');
    }

    // Check file size
    let size: number;
    try {
      size = sourceFile.size;
      console.log('[MMBak] File size:', size, 'bytes');
    } catch (e) {
      console.log('[MMBak] Could not get file size:', e);
      size = 0;
    }

    if (size === 0) {
      throw new Error('File is empty');
    }

    // Open database
    try {
      db = await openDatabaseFromUri(uri);
      console.log('[MMBak] Database opened successfully');
    } catch (e) {
      console.error('[MMBak] Failed to open database:', e);
      throw new Error(`Cannot open database: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Check if required tables exist
    let tables: { name: string }[];
    try {
      // First, let's see ALL tables in the database
      const allTables = db.getAllSync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      console.log('[MMBak] ALL tables in database:', allTables.map(t => t.name));

      tables = db.getAllSync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ZCATEGORY', 'ASSETS', 'INOUTCOME')"
      );
      console.log('[MMBak] Matching tables:', tables);
    } catch (e) {
      console.error('[MMBak] Error querying tables:', e);
      throw new Error(`Cannot read database tables: ${e instanceof Error ? e.message : String(e)}`);
    }

    const tableNames = tables.map(t => t.name);

    if (!tableNames.includes('ZCATEGORY')) {
      throw new Error('Database missing ZCATEGORY table - not a valid Money Manager backup');
    }
    if (!tableNames.includes('ASSETS')) {
      throw new Error('Database missing ASSETS table - not a valid Money Manager backup');
    }
    if (!tableNames.includes('INOUTCOME')) {
      throw new Error('Database missing INOUTCOME table - not a valid Money Manager backup');
    }

    console.log('[MMBak] Validation passed');
    return true;
  } finally {
    // Close database
    if (db) {
      try {
        db.closeSync();
      } catch (e) {
        console.error('[MMBak] Error closing database:', e);
      }
    }
    // Clean up temp file
    await cleanupTempDatabase();
  }
}