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
            category_id INTEGER NOT NULL REFERENCES categories(id),
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            note TEXT,
            amount REAL NOT NULL,
            date INTEGER NOT NULL
        );
    `);

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