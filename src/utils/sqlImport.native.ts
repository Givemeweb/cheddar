// Native-only implementation (iOS/Android)
// Web implementation is in sqlImport.web.ts

import { Platform } from 'react-native';
import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { getStore, saveStore } from '../db/tinybase';

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
  imagePath: string | null;
}

export interface SqlImportResult {
  categories: number;
  subcategories: number;
  accounts: number;
  transactions: number;
  importDate: string;
}

const TEMP_DB_NAME = 'sql_temp_import.db';

/**
 * Open database file by copying to SQLite directory (Native only)
 */
async function openDatabaseFromUri(uri: string): Promise<SQLiteDatabase> {
  console.log('[SQLImport] Opening database from URI:', uri);

  // Create a File instance from the URI
  const sourceFile = new ExpoFile(uri);
  console.log('[SQLImport] Source file URI:', sourceFile.uri);
  console.log('[SQLImport] Source file exists:', sourceFile.exists);
  console.log('[SQLImport] Source file size:', sourceFile.size);

  if (!sourceFile.exists) {
    throw new Error('Source file does not exist');
  }

  // Copy to cache directory
  const destFile = new ExpoFile(Paths.cache, TEMP_DB_NAME);
  console.log('[SQLImport] Destination file URI:', destFile.uri);

  // Delete existing temp file if present
  if (destFile.exists) {
    destFile.delete();
    console.log('[SQLImport] Deleted existing temp file');
  }

  // Read bytes from source and write to destination
  console.log('[SQLImport] Reading bytes from source file...');
  const bytes = await sourceFile.bytes();
  console.log('[SQLImport] Read', bytes.length, 'bytes');

  // Write to destination
  destFile.write(bytes);
  console.log('[SQLImport] Wrote bytes to destination');

  // Verify the copy worked
  console.log('[SQLImport] Destination exists after write:', destFile.exists);
  console.log('[SQLImport] Destination size after write:', destFile.size);

  // Open the database using the directory URI path
  const cacheUri = Paths.cache.uri;
  console.log('[SQLImport] Cache directory URI:', cacheUri);

  // For expo-sqlite, we need to strip file:// prefix for the directory
  const dbPath = cacheUri.replace(/^file:\/\//, '');
  console.log('[SQLImport] Opening database with name:', TEMP_DB_NAME, 'directory:', dbPath);

  const db = openDatabaseSync(TEMP_DB_NAME, {}, dbPath);
  console.log('[SQLImport] Database opened');
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
      console.log('[SQLImport] Temp database cleaned up');
    }
  } catch (error) {
    console.error('[SQLImport] Error cleaning up temp database:', error);
  }
}

/**
 * Parse SQLite database and extract data (native implementation)
 */
export async function parseSqlFile(uri: string): Promise<{
  categories: CheddarCategory[];
  subcategories: CheddarSubcategory[];
  accounts: CheddarAccount[];
  transactions: CheddarTransaction[];
}> {
  let db: SQLiteDatabase | null = null;

  try {
    // Copy file and open database
    db = await openDatabaseFromUri(uri);

    // Get all categories
    const categories = db.getAllSync<CheddarCategory>(
      'SELECT * FROM categories'
    );

    // Get all subcategories (if table exists)
    let subcategories: CheddarSubcategory[] = [];
    try {
      subcategories = db.getAllSync<CheddarSubcategory>(
        'SELECT * FROM subcategories'
      );
    } catch (e) {
      console.log('[SQLImport] No subcategories table or empty');
    }

    // Get all accounts
    const accounts = db.getAllSync<CheddarAccount>(
      'SELECT id, name, icon, description, balance, `order` FROM accounts'
    );

    // Get all transactions
    const transactions = db.getAllSync<CheddarTransaction>(
      'SELECT id, type, categoryId, subcategoryId, subcategoryName, accountId, accountName, toAccountId, toAccountName, note, description, amount, date, imagePath FROM transactions'
    );

    return { categories, subcategories, accounts, transactions };
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
 * Import SQLite data into Cheddar database (native implementation)
 */
export async function importFromSql(uri: string): Promise<SqlImportResult> {
  const store = getStore();

  // Parse the SQLite file
  const { categories, subcategories, accounts, transactions } = await parseSqlFile(uri);

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
    imagePath: string | null;
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
      imagePath: tx.imagePath,
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
 * Validate if a file is a valid Cheddar SQLite database (native implementation)
 * Returns true if valid, throws error with details if invalid
 */
export async function validateSqlFile(uri: string): Promise<boolean> {
  let db: SQLiteDatabase | null = null;

  try {
    console.log('[SQLImport] Validating file:', uri);
    console.log('[SQLImport] Platform:', Platform.OS);

    // Create file instance and check existence
    let sourceFile: ExpoFile;
    try {
      sourceFile = new ExpoFile(uri);
      console.log('[SQLImport] ExpoFile created, uri:', sourceFile.uri);
    } catch (e) {
      console.error('[SQLImport] Failed to create ExpoFile:', e);
      throw new Error(`Failed to access file: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Check if file exists
    let exists: boolean;
    try {
      exists = sourceFile.exists;
      console.log('[SQLImport] File exists:', exists);
    } catch (e) {
      console.error('[SQLImport] Error checking file existence:', e);
      throw new Error(`Cannot check file existence: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!exists) {
      throw new Error('Selected file does not exist or cannot be accessed');
    }

    // Check file size
    let size: number;
    try {
      size = sourceFile.size;
      console.log('[SQLImport] File size:', size, 'bytes');
    } catch (e) {
      console.log('[SQLImport] Could not get file size:', e);
      size = 0;
    }

    if (size === 0) {
      throw new Error('File is empty');
    }

    // Check SQLite header (first 16 bytes should be "SQLite format 3\0")
    try {
      const allBytes = await sourceFile.bytes();
      const headerBytes = allBytes.slice(0, 16);
      const header = new TextDecoder().decode(headerBytes);
      console.log('[SQLImport] File header:', header);

      if (!header.startsWith('SQLite format 3')) {
        throw new Error('File is not a valid SQLite database. Please select a .db or .sqlite file exported from Cheddar.');
      }
    } catch (e) {
      // If it's already our custom error, rethrow it
      if (e instanceof Error && e.message.includes('not a valid SQLite database')) {
        throw e;
      }
      console.error('[SQLImport] Error reading file header:', e);
      throw new Error('Cannot read file header - file may be corrupted or not a SQLite database');
    }

    // Open database
    try {
      db = await openDatabaseFromUri(uri);
      console.log('[SQLImport] Database opened successfully');
    } catch (e) {
      console.error('[SQLImport] Failed to open database:', e);
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (errorMsg.includes('not a database') || errorMsg.includes('file is not a database')) {
        throw new Error('File is not a valid SQLite database. Please select a .db or .sqlite file exported from Cheddar.');
      }
      throw new Error(`Cannot open database: ${errorMsg}`);
    }

    // Check if required tables exist
    let tables: { name: string }[];
    try {
      const allTables = db.getAllSync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      console.log('[SQLImport] ALL tables in database:', allTables.map(t => t.name));

      tables = db.getAllSync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('categories', 'accounts', 'transactions')"
      );
      console.log('[SQLImport] Matching tables:', tables);
    } catch (e) {
      console.error('[SQLImport] Error querying tables:', e);
      throw new Error(`Cannot read database tables: ${e instanceof Error ? e.message : String(e)}`);
    }

    const tableNames = tables.map(t => t.name);

    if (!tableNames.includes('categories')) {
      throw new Error('Database missing categories table - not a valid Cheddar backup');
    }
    if (!tableNames.includes('accounts')) {
      throw new Error('Database missing accounts table - not a valid Cheddar backup');
    }
    if (!tableNames.includes('transactions')) {
      throw new Error('Database missing transactions table - not a valid Cheddar backup');
    }

    console.log('[SQLImport] Validation passed');
    return true;
  } finally {
    // Close database
    if (db) {
      try {
        db.closeSync();
      } catch (e) {
        console.error('[SQLImport] Error closing database:', e);
      }
    }
    // Clean up temp file
    await cleanupTempDatabase();
  }
}