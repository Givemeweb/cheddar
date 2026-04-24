import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import * as SQLite from 'expo-sqlite';
import { getStore, getPersister } from '../db/tinybase';
import type { Tables } from 'tinybase';

export interface BackupData {
  version: string;
  exportDate: string;
  platform: 'ios' | 'android' | 'web';
  data: Tables;
}

const BACKUP_VERSION = '1.0.0';

export async function exportDatabaseToZip(): Promise<string | null> {
  try {
    const store = getStore();
    const persister = await getPersister();

    if (!store || !persister) {
      throw new Error('Database not initialized');
    }

    // Get all data from store
    const tables = store.getTables();

    const backupData: BackupData = {
      version: BACKUP_VERSION,
      exportDate: new Date().toISOString(),
      platform: Platform.OS as 'ios' | 'android' | 'web',
      data: {
        categories: tables?.categories || {},
        accounts: tables?.accounts || {},
        transactions: tables?.transactions || {},
      },
    };

    // Create ZIP file
    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify(backupData, null, 2));

    // Generate zip blob
    const zipBlob = await zip.generateAsync({
      type: 'base64',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `cheddar-backup-${timestamp}.zip`;

    if (Platform.OS === 'web') {
      // Web: Download directly
      const binaryString = atob(zipBlob);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return null;
    }

    // Native: Save to file and share
    const file = new File(Paths.document, fileName);

    // Convert base64 to Uint8Array and write
    const binaryString = atob(zipBlob);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    file.write(bytes);

    // Share the file (allows user to save to Downloads via share sheet)
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/zip',
        dialogTitle: 'Save Backup',
        UTI: 'public.zip-archive',
      });
    }

    return file.uri;
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
}

export async function validateBackupFile(backupData: unknown): Promise<BackupData> {
  if (!backupData || typeof backupData !== 'object') {
    throw new Error('Invalid backup file: not an object');
  }

  const data = backupData as Record<string, unknown>;

  if (!data.version || typeof data.version !== 'string') {
    throw new Error('Invalid backup file: missing version');
  }

  if (!data.data || typeof data.data !== 'object') {
    throw new Error('Invalid backup file: missing data');
  }

  const innerData = data.data as Record<string, unknown>;

  if (!innerData.categories || !innerData.accounts || !innerData.transactions) {
    throw new Error('Invalid backup file: missing required tables');
  }

  return data as unknown as BackupData;
}

export interface ImportResult {
  categories: number;
  accounts: number;
  transactions: number;
  importDate: string;
}

export async function importDatabaseFromZip(zipBase64: string): Promise<ImportResult> {
  try {
    const store = getStore();
    const persister = await getPersister();

    if (!store || !persister) {
      throw new Error('Database not initialized');
    }

    // Load the ZIP file
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(zipBase64, { base64: true });

    // Find and extract the backup.json file
    const backupFile = zipContent.file('backup.json');
    if (!backupFile) {
      throw new Error('Invalid backup file: missing backup.json');
    }

    const backupJson = await backupFile.async('string');
    const backupData = JSON.parse(backupJson);

    // Validate the backup data
    const validatedData = await validateBackupFile(backupData);

    // Clear existing data and set new data
    store.setTables(validatedData.data as Parameters<typeof store.setTables>[0]);

    // Persist changes
    await persister.save();

    return {
      categories: Object.keys(validatedData.data.categories).length,
      accounts: Object.keys(validatedData.data.accounts).length,
      transactions: Object.keys(validatedData.data.transactions).length,
      importDate: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Import failed:', error);
    throw error;
  }
}

/**
 * Export database as SQL file
 * For native platforms: serialize the SQLite database directly
 * For web: generate SQL statements from TinyBase data (since web uses IndexedDB)
 */
export async function exportDatabaseToSql(): Promise<string | null> {
  try {
    const store = getStore();
    const persister = await getPersister();

    if (!store || !persister) {
      throw new Error('Database not initialized');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `cheddar-backup-${timestamp}.db`;

    if (Platform.OS === 'web') {
      // For web, we export as SQL statements since we use IndexedDB
      const tables = store.getTables();
      const sqlStatements = generateSqlFromTables(tables);
      const sqlContent = sqlStatements.join(';\n') + ';\n';

      // Create and download the file
      const blob = new Blob([sqlContent], { type: 'application/sql' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName.replace('.db', '.sql');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return null;
    }

    // For native platforms (iOS/Android), export the SQLite database file directly
    // Open the database and serialize it
    const db = await SQLite.openDatabaseAsync('cheddar.db');
    const serializedData = await db.serializeAsync();
    await db.closeAsync();

    // Write to file and share
    const file = new File(Paths.document, fileName);
    file.write(serializedData);

    // Share the file
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/x-sqlite3',
        dialogTitle: 'Save SQL Backup',
        UTI: 'public.database',
      });
    }

    return file.uri;
  } catch (error) {
    console.error('SQL Export failed:', error);
    throw error;
  }
}

/**
 * Generate SQL statements from TinyBase tables
 * Used for web platform where we use IndexedDB instead of SQLite
 */
function generateSqlFromTables(tables: Tables | undefined): string[] {
  const statements: string[] = [];

  // Add header
  statements.push('-- Cheddar Backup SQL');
  statements.push(`-- Export Date: ${new Date().toISOString()}`);
  statements.push('-- Version: 1.0.0');
  statements.push('');

  // Create tables
  statements.push('-- Create tables');
  statements.push(`CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOTNULL,
  icon TEXT NOTNULL,
  type TEXT NOTNULL
)`);

  statements.push(`CREATE TABLE IF NOT EXISTS subcategories (
  id TEXT PRIMARY KEY,
  name TEXT NOTNULL,
  categoryId TEXT NOTNULL,
  FOREIGN KEY (categoryId) REFERENCES categories(id)
)`);

  statements.push(`CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOTNULL,
  icon TEXT NOTNULL,
  description TEXT,
  balance REAL NOTNULL,
  \`order\` INTEGER NOTNULL
)`);

  statements.push(`CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOTNULL,
  categoryId TEXT,
  subcategoryId TEXT,
  subcategoryName TEXT,
  accountId TEXT NOTNULL,
  accountName TEXT NOTNULL,
  toAccountId TEXT,
  toAccountName TEXT,
  note TEXT,
  description TEXT,
  amount REAL NOTNULL,
  date INTEGER NOTNULL,
  FOREIGN KEY (categoryId) REFERENCES categories(id),
  FOREIGN KEY (accountId) REFERENCES accounts(id)
)`);

  statements.push('');

  // Insert categories
  if (tables?.categories) {
    statements.push('-- Insert categories');
    Object.entries(tables.categories as Record<string, { name: string; icon: string; type: string }>).forEach(([id, data]) => {
      const name = escapeSqlString(data.name);
      const icon = escapeSqlString(data.icon);
      const type = escapeSqlString(data.type);
      statements.push(`INSERT INTO categories (id, name, icon, type) VALUES ('${id}', '${name}', '${icon}', '${type}')`);
    });
    statements.push('');
  }

  // Insert subcategories
  if (tables?.subcategories) {
    statements.push('-- Insert subcategories');
    Object.entries(tables.subcategories as Record<string, { name: string; categoryId: string }>).forEach(([id, data]) => {
      const name = escapeSqlString(data.name);
      const categoryId = escapeSqlString(data.categoryId);
      statements.push(`INSERT INTO subcategories (id, name, categoryId) VALUES ('${id}', '${name}', '${categoryId}')`);
    });
    statements.push('');
  }

  // Insert accounts
  if (tables?.accounts) {
    statements.push('-- Insert accounts');
    Object.entries(tables.accounts as Record<string, { name: string; icon: string; description: string | null; balance: number; order: number }>).forEach(([id, data]) => {
      const name = escapeSqlString(data.name);
      const icon = escapeSqlString(data.icon);
      const description = data.description ? `'${escapeSqlString(data.description)}'` : 'NULL';
      statements.push(`INSERT INTO accounts (id, name, icon, description, balance, \`order\`) VALUES ('${id}', '${name}', '${icon}', ${description}, ${data.balance}, ${data.order})`);
    });
    statements.push('');
  }

  // Insert transactions
  if (tables?.transactions) {
    statements.push('-- Insert transactions');
    Object.entries(tables.transactions as Record<string, {
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
    }>).forEach(([id, data]) => {
      const type = escapeSqlString(data.type);
      const categoryId = data.categoryId ? `'${escapeSqlString(data.categoryId)}'` : 'NULL';
      const subcategoryId = data.subcategoryId ? `'${escapeSqlString(data.subcategoryId)}'` : 'NULL';
      const subcategoryName = data.subcategoryName ? `'${escapeSqlString(data.subcategoryName)}'` : 'NULL';
      const accountId = escapeSqlString(data.accountId);
      const accountName = escapeSqlString(data.accountName);
      const toAccountId = data.toAccountId ? `'${escapeSqlString(data.toAccountId)}'` : 'NULL';
      const toAccountName = data.toAccountName ? `'${escapeSqlString(data.toAccountName)}'` : 'NULL';
      const note = data.note ? `'${escapeSqlString(data.note)}'` : 'NULL';
      const description = data.description ? `'${escapeSqlString(data.description)}'` : 'NULL';
      statements.push(`INSERT INTO transactions (id, type, categoryId, subcategoryId, subcategoryName, accountId, accountName, toAccountId, toAccountName, note, description, amount, date) VALUES ('${id}', '${type}', ${categoryId}, ${subcategoryId}, ${subcategoryName}, '${accountId}', '${accountName}', ${toAccountId}, ${toAccountName}, ${note}, ${description}, ${data.amount}, ${data.date})`);
    });
    statements.push('');
  }

  return statements;
}

/**
 * Escape a string for use in SQL statements
 */
function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Import database from a JSON file (direct JSON, not ZIP)
 * Used when user exports as JSON format from web
 */
export async function importDatabaseFromJson(jsonContent: string): Promise<ImportResult> {
  try {
    const store = getStore();
    const persister = await getPersister();

    if (!store || !persister) {
      throw new Error('Database not initialized');
    }

    // Parse JSON content
    const backupData = JSON.parse(jsonContent);

    // Validate the backup data
    const validatedData = await validateBackupFile(backupData);

    // Clear existing data and set new data
    store.setTables(validatedData.data as Parameters<typeof store.setTables>[0]);

    // Persist changes
    await persister.save();

    return {
      categories: Object.keys(validatedData.data.categories).length,
      accounts: Object.keys(validatedData.data.accounts).length,
      transactions: Object.keys(validatedData.data.transactions).length,
      importDate: new Date().toISOString(),
    };
  } catch (error) {
    console.error('JSON Import failed:', error);
    throw error;
  }
}

/**
 * Import database from SQL statements
 * Used on web platform where we can't use SQLite directly
 */
export async function importDatabaseFromSql(sqlContent: string): Promise<ImportResult> {
  try {
    const store = getStore();
    const persister = await getPersister();

    if (!store || !persister) {
      throw new Error('Database not initialized');
    }

    // Parse SQL statements and extract data
    const data = parseSqlStatements(sqlContent);

    // Set data in store
    store.setTables(data);

    // Persist changes
    await persister.save();

    return {
      categories: Object.keys(data.categories || {}).length,
      accounts: Object.keys(data.accounts || {}).length,
      transactions: Object.keys(data.transactions || {}).length,
      importDate: new Date().toISOString(),
    };
  } catch (error) {
    console.error('SQL Import failed:', error);
    throw error;
  }
}

/**
 * Parse SQL statements and extract data
 */
function parseSqlStatements(sqlContent: string): Tables {
  const statements = sqlContent.split(';').map(s => s.trim()).filter(s => s.length > 0);

  const data: Tables = {
    categories: {},
    accounts: {},
    transactions: {},
    subcategories: {},
  };

  for (const statement of statements) {
    // Parse INSERT statements
    if (statement.toUpperCase().startsWith('INSERT INTO')) {
      const tableMatch = statement.match(/INSERT INTO\s+(\w+)/i);
      if (!tableMatch) continue;

      const tableName = tableMatch[1].toLowerCase();

      // Extract values using regex for VALUES clause
      const valuesMatch = statement.match(/VALUES\s*\((.+)\)/is);
      if (!valuesMatch) continue;

      if (tableName === 'categories') {
        const parsed = parseInsertValues(statement, ['id', 'name', 'icon', 'type']);
        if (parsed.id) {
          data.categories[parsed.id] = {
            name: parsed.name || '',
            icon: parsed.icon || 'circle',
            type: parsed.type || 'expense',
          };
        }
      } else if (tableName === 'subcategories') {
        const parsed = parseInsertValues(statement, ['id', 'name', 'categoryId']);
        if (parsed.id) {
          data.subcategories = data.subcategories || {};
          data.subcategories[parsed.id] = {
            name: parsed.name || '',
            categoryId: parsed.categoryId || '',
          };
        }
      } else if (tableName === 'accounts') {
        const parsed = parseInsertValues(statement, ['id', 'name', 'icon', 'description', 'balance', 'order']);
        if (parsed.id) {
          data.accounts[parsed.id] = {
            name: parsed.name || '',
            icon: parsed.icon || 'wallet',
            description: parsed.description || null,
            balance: parseFloat(parsed.balance) || 0,
            order: parseInt(parsed.order) || 0,
          };
        }
      } else if (tableName === 'transactions') {
        const parsed = parseInsertValues(statement, [
          'id', 'type', 'categoryId', 'subcategoryId', 'subcategoryName',
          'accountId', 'accountName', 'toAccountId', 'toAccountName',
          'note', 'description', 'amount', 'date'
        ]);
        if (parsed.id) {
          data.transactions[parsed.id] = {
            type: parsed.type || 'expense',
            categoryId: parsed.categoryId || null,
            subcategoryId: parsed.subcategoryId || null,
            subcategoryName: parsed.subcategoryName || null,
            accountId: parsed.accountId || '',
            accountName: parsed.accountName || '',
            toAccountId: parsed.toAccountId || null,
            toAccountName: parsed.toAccountName || null,
            note: parsed.note || null,
            description: parsed.description || null,
            amount: parseFloat(parsed.amount) || 0,
            date: parseInt(parsed.date) || Date.now(),
          };
        }
      }
    }
  }

  return data;
}

/**
 * Parse INSERT VALUES clause and extract fields
 */
function parseInsertValues(statement: string, fields: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  // Extract values between parentheses after VALUES
  const valuesMatch = statement.match(/VALUES\s*\((.+)\)\s*$/is);
  if (!valuesMatch) return result;

  const valuesStr = valuesMatch[1];

  // Parse values, handling quoted strings and NULL
  const values: (string | null)[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];

    if ((char === "'" || char === '"') && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      // Check for escaped quote
      if (valuesStr[i + 1] === quoteChar) {
        current += quoteChar;
        i++; // Skip next quote
      } else {
        inQuotes = false;
        quoteChar = '';
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim() || null);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim() || null);

  // Map values to fields
  fields.forEach((field, index) => {
    const value = values[index];
    if (value !== null && value !== 'NULL') {
      result[field] = value;
    }
  });

  return result;
}