// mmbakImport - Platform-specific import utilities for Money Manager backup files
// Metro bundler will automatically resolve:
// - mmbakImport.native.ts for iOS/Android
// - mmbakImport.web.ts for web

// Types are defined here for TypeScript
export interface MMBakImportResult {
  categories: number;
  subcategories: number;
  accounts: number;
  transactions: number;
  importDate: string;
}

// Note: Function signatures differ between platforms:
// - Native (iOS/Android): importFromMMBak(uri: string), validateMMBakFile(uri: string)
// - Web: importFromMMBak(file: File), validateMMBakFile(file: File)
// Use platform-specific imports:
// - For native code paths: import { importFromMMBak } from './mmbakImport.native'
// - For web code paths: import { importFromMMBak } from './mmbakImport.web'