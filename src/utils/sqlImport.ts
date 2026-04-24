// sqlImport - Platform-specific import utilities for SQLite database files
// Metro bundler will automatically resolve:
// - sqlImport.native.ts for iOS/Android
// - sqlImport.web.ts for web

// Types are defined here for TypeScript
export interface SqlImportResult {
  categories: number;
  subcategories: number;
  accounts: number;
  transactions: number;
  importDate: string;
}

// Note: Function signatures differ between platforms:
// - Native (iOS/Android): importFromSql(uri: string), validateSqlFile(uri: string)
// - Web: importFromSql(file: File), validateSqlFile(file: File)
// Use platform-specific imports:
// - For native code paths: import { importFromSql } from './sqlImport.native'
// - For web code paths: import { importFromSql } from './sqlImport.web'