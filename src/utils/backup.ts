import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
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