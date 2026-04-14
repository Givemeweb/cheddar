import { Platform } from 'react-native';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import * as schema from './schema';

let dbInstance: ReturnType<typeof drizzle> | null = null;

export async function initDatabase(): Promise<ReturnType<typeof drizzle> | null> {
    // Web requires SharedArrayBuffer which needs specific CORS headers
    // Skip database on web for now
    if (Platform.OS === 'web') {
        console.log('Skipping database initialization on web platform');
        return null;
    }

    if (dbInstance) return dbInstance;

    const expoDb = await openDatabaseAsync('cheddar.db');

    // Create tables if they don't exist
    await expoDb.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT NOT NULL,
            type TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            balance REAL NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL DEFAULT 'expense',
            category_id INTEGER REFERENCES categories(id),
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            to_account_id INTEGER REFERENCES accounts(id),
            note TEXT,
            description TEXT,
            amount REAL NOT NULL,
            date INTEGER NOT NULL
        );
    `);

    // Migrate existing transactions table if needed (add new columns)
    try {
        await expoDb.execAsync(`
            ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense';
        `);
    } catch (e) { /* Column already exists, ignore */ }

    try {
        await expoDb.execAsync(`
            ALTER TABLE transactions ADD COLUMN to_account_id INTEGER REFERENCES accounts(id);
        `);
    } catch (e) { /* Column already exists, ignore */ }

    try {
        await expoDb.execAsync(`
            ALTER TABLE transactions ADD COLUMN description TEXT;
        `);
    } catch (e) { /* Column already exists, ignore */ }

    dbInstance = drizzle(expoDb, { schema });
    return dbInstance;
}

export function getDb(): ReturnType<typeof drizzle> {
    if (!dbInstance) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return dbInstance;
}

export function isDatabaseReady(): boolean {
    return dbInstance !== null;
}

export * from './schema';