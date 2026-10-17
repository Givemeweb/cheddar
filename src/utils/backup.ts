import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
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

const BACKUP_VERSION = '1.1.0';

/**
 * Collect all image paths from transactions
 * For native: returns relative file paths
 * For web: returns base64 data URIs
 */
function collectImagePaths(tables: Tables | undefined): string[] {
  const paths: string[] = [];
  if (tables?.transactions) {
    Object.values(tables.transactions as Record<string, { imagePath?: string | null }>).forEach((tx) => {
      if (tx.imagePath) {
        paths.push(tx.imagePath);
      }
    });
  }
  return paths;
}

/**
 * Generate a filename for an image from its path or data URI
 */
function generateImageFilename(imagePath: string): string {
  // Check if it's a base64 data URI
  if (imagePath.startsWith('data:')) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    // Try to extract extension from mime type
    const mimeMatch = imagePath.match(/data:image\/(\w+);/);
    const ext = mimeMatch ? mimeMatch[1] : 'jpg';
    return `${timestamp}_${random}.${ext}`;
  }
  // For native paths, extract filename from path
  return imagePath.split('/').pop() || `image_${Date.now()}.jpg`;
}

/**
 * Convert base64 data URI to Uint8Array
 */
function dataUriToBytes(dataUri: string): Uint8Array {
  const base64 = dataUri.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function exportDatabaseToZip(): Promise<string | null> {
  try {
    const store = getStore();
    const persister = await getPersister();

    if (!store || !persister) {
      throw new Error('Database not initialized');
    }

    // Get all data from store
    const tables = store.getTables();

    // Create ZIP file
    const zip = new JSZip();

    // Add transaction images to ZIP and build mapping
    const imagePaths = collectImagePaths(tables);
    const imageDataMap: Record<string, string> = {}; // Maps original path to new filename

    for (const imagePath of imagePaths) {
      try {
        if (Platform.OS === 'web') {
          // For web: imagePath is a base64 data URI
          // Convert to binary and store as separate file in ZIP
          const filename = generateImageFilename(imagePath);
          const imageBytes = dataUriToBytes(imagePath);
          zip.file(`images/${filename}`, imageBytes);
          imageDataMap[imagePath] = filename;
        } else {
          // For native: imagePath is a relative file path
          const imageFile = new File(Paths.document, imagePath);
          if (imageFile.exists) {
            const imageBytes = await imageFile.bytes();
            // Store images with filename in zip
            const filename = imagePath.split('/').pop() || imagePath;
            zip.file(`images/${filename}`, imageBytes);
            imageDataMap[imagePath] = filename;
          }
        }
      } catch (err) {
        console.warn(`Failed to include image ${imagePath}:`, err);
      }
    }

    // Build SQL statements with image filenames (not full paths)
    const sqlStatements = generateSqlFromTables(tables, imageDataMap);
    const sqlContent = sqlStatements.join(';\n') + ';\n';

    // Add SQL to the ZIP
    zip.file('backup.sql', sqlContent);

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

    // Find and extract the backup.sql file
    const backupFile = zipContent.file('backup.sql');
    if (!backupFile) {
      throw new Error('Invalid backup file: missing backup.sql');
    }

    const sqlContent = await backupFile.async('string');
    const data = parseSqlStatements(sqlContent);

    // Extract images from ZIP first
    const imageFolder = zipContent.folder('images');
    const imageMap: Record<string, string> = {}; // Maps filename to stored path/data URI

    if (imageFolder) {
      for (const [relativePath, file] of Object.entries(imageFolder.files)) {
        if (file.dir) continue;
        const filename = relativePath.split('/').pop() || relativePath;
        try {
          if (Platform.OS === 'web') {
            // For web: convert image back to base64 data URI
            const imageBytes = await file.async('uint8array');
            // Detect image type from filename extension
            const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
            const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
            const base64 = arrayBufferToBase64(imageBytes);
            const dataUri = `data:${mimeType};base64,${base64}`;
            imageMap[filename] = dataUri;
          } else {
            // For native: extract to document directory
            const imageBytes = await file.async('uint8array');
            const imagePath = `transaction_images/${filename}`;
            // Ensure parent directory exists before writing
            const imagesDir = new Directory(Paths.document, 'transaction_images');
            if (!imagesDir.exists) {
              imagesDir.create({ intermediates: true });
            }
            const imageFile = new File(Paths.document, imagePath);
            await imageFile.write(imageBytes);
            imageMap[filename] = imagePath;
          }
        } catch (err) {
          console.warn(`Failed to extract image ${filename}:`, err);
        }
      }
    }

    // Update transaction data with correct image paths before storing
    if (Object.keys(imageMap).length > 0 && data.transactions) {
      const updatedTransactions = { ...data.transactions } as Record<string, Record<string, unknown>>;
      for (const [txId, txData] of Object.entries(updatedTransactions)) {
        const tx = txData as { imagePath?: string | null };
        if (tx.imagePath && imageMap[tx.imagePath]) {
          updatedTransactions[txId] = { ...tx, imagePath: imageMap[tx.imagePath] };
        }
      }
      data.transactions = updatedTransactions as typeof data.transactions;
    }

    // Now set the data with correct image paths
    store.setTables(data as Parameters<typeof store.setTables>[0]);

    // Persist changes
    await persister.save();

    return {
      categories: Object.keys(data.categories || {}).length,
      accounts: Object.keys(data.accounts || {}).length,
      transactions: Object.keys(data.transactions || {}).length,
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
function generateSqlFromTables(tables: Tables | undefined, imagePathMap?: Record<string, string>): string[] {
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
  \`order\` INTEGER NOTNULL,
  currency TEXT
)`);

  statements.push(`CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOTNULL,
  categoryId TEXT,
  subcategoryId TEXT,
  subcategoryName TEXT,
  categoryName TEXT,
  categoryIcon TEXT,
  categoryType TEXT,
  accountId TEXT NOTNULL,
  accountName TEXT NOTNULL,
  toAccountId TEXT,
  toAccountName TEXT,
  note TEXT,
  description TEXT,
  amount REAL NOTNULL,
  currency TEXT,
  date INTEGER NOTNULL,
  imagePath TEXT,
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
    Object.entries(tables.accounts as Record<string, { name: string; icon: string; description: string | null; balance: number; order: number; currency?: string }>).forEach(([id, data]) => {
      const name = escapeSqlString(data.name);
      const icon = escapeSqlString(data.icon);
      const description = data.description ? `'${escapeSqlString(data.description)}'` : 'NULL';
      const currency = data.currency ? `'${escapeSqlString(data.currency)}'` : 'NULL';
      statements.push(`INSERT INTO accounts (id, name, icon, description, balance, \`order\`, currency) VALUES ('${id}', '${name}', '${icon}', ${description}, ${data.balance}, ${data.order}, ${currency})`);
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
      categoryName: string | null;
      categoryIcon: string | null;
      categoryType: string | null;
      accountId: string;
      accountName: string;
      toAccountId: string | null;
      toAccountName: string | null;
      note: string | null;
      description: string | null;
      amount: number;
      currency?: string;
      date: number;
      imagePath: string | null;
    }>).forEach(([id, data]) => {
      const type = escapeSqlString(data.type);
      const categoryId = data.categoryId ? `'${escapeSqlString(data.categoryId)}'` : 'NULL';
      const subcategoryId = data.subcategoryId ? `'${escapeSqlString(data.subcategoryId)}'` : 'NULL';
      const subcategoryName = data.subcategoryName ? `'${escapeSqlString(data.subcategoryName)}'` : 'NULL';
      const categoryName = data.categoryName ? `'${escapeSqlString(data.categoryName)}'` : 'NULL';
      const categoryIcon = data.categoryIcon ? `'${escapeSqlString(data.categoryIcon)}'` : 'NULL';
      const categoryType = data.categoryType ? `'${escapeSqlString(data.categoryType)}'` : 'NULL';
      const accountId = escapeSqlString(data.accountId);
      const accountName = escapeSqlString(data.accountName);
      const toAccountId = data.toAccountId ? `'${escapeSqlString(data.toAccountId)}'` : 'NULL';
      const toAccountName = data.toAccountName ? `'${escapeSqlString(data.toAccountName)}'` : 'NULL';
      const note = data.note ? `'${escapeSqlString(data.note)}'` : 'NULL';
      const description = data.description ? `'${escapeSqlString(data.description)}'` : 'NULL';
      // Use mapped filename if available, otherwise keep original value
      const rawImagePath = imagePathMap && data.imagePath && imagePathMap[data.imagePath]
        ? imagePathMap[data.imagePath]
        : data.imagePath;
      const imagePath = rawImagePath ? `'${escapeSqlString(rawImagePath)}'` : 'NULL';
      const currency = data.currency ? `'${escapeSqlString(data.currency)}'` : 'NULL';
      statements.push(`INSERT INTO transactions (id, type, categoryId, subcategoryId, subcategoryName, categoryName, categoryIcon, categoryType, accountId, accountName, toAccountId, toAccountName, note, description, amount, currency, date, imagePath) VALUES ('${id}', '${type}', ${categoryId}, ${subcategoryId}, ${subcategoryName}, ${categoryName}, ${categoryIcon}, ${categoryType}, '${accountId}', '${accountName}', ${toAccountId}, ${toAccountName}, ${note}, ${description}, ${data.amount}, ${currency}, ${data.date}, ${imagePath})`);
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
 * Convert Uint8Array to base64 string
 */
function arrayBufferToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
        const parsed = parseInsertValues(statement);
        if (parsed.id) {
          data.categories[parsed.id] = {
            name: parsed.name || '',
            icon: parsed.icon || 'circle',
            type: parsed.type || 'expense',
          };
        }
      } else if (tableName === 'subcategories') {
        const parsed = parseInsertValues(statement);
        if (parsed.id) {
          data.subcategories = data.subcategories || {};
          data.subcategories[parsed.id] = {
            name: parsed.name || '',
            categoryId: parsed.categoryId || '',
          };
        }
      } else if (tableName === 'accounts') {
        const parsed = parseInsertValues(statement);
        if (parsed.id) {
          data.accounts[parsed.id] = {
            name: parsed.name || '',
            icon: parsed.icon || 'wallet',
            description: parsed.description || null,
            balance: parseFloat(parsed.balance) || 0,
            order: parseInt(parsed.order) || 0,
            currency: parsed.currency || 'EUR',
          };
        }
      } else if (tableName === 'transactions') {
        const parsed = parseInsertValues(statement);
        if (parsed.id) {
          data.transactions[parsed.id] = {
            type: parsed.type || 'expense',
            categoryId: parsed.categoryId || null,
            subcategoryId: parsed.subcategoryId || null,
            subcategoryName: parsed.subcategoryName || null,
            categoryName: parsed.categoryName || null,
            categoryIcon: parsed.categoryIcon || null,
            categoryType: parsed.categoryType || null,
            accountId: parsed.accountId || '',
            accountName: parsed.accountName || '',
            toAccountId: parsed.toAccountId || null,
            toAccountName: parsed.toAccountName || null,
            note: parsed.note || null,
            description: parsed.description || null,
            amount: parseFloat(parsed.amount) || 0,
            currency: parsed.currency || 'EUR',
            date: parseInt(parsed.date) || Date.now(),
            imagePath: parsed.imagePath || null,
          };
        }
      }
    }
  }

  return data;
}

/**
 * Parse INSERT statement and extract fields by reading the actual column list.
 * Handles INSERT INTO table (col1, col2, ...) VALUES (val1, val2, ...).
 */
function parseInsertValues(statement: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Extract column names from INSERT INTO table (col1, col2, ...)
  const columnsMatch = statement.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i);
  if (!columnsMatch) return result;

  const columns = columnsMatch[1].split(',').map(c => c.trim());

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

  // Map values to columns dynamically
  columns.forEach((field, index) => {
    const value = values[index];
    if (value !== null && value !== 'NULL') {
      result[field] = value;
    }
  });

  return result;
}