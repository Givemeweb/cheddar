import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { getStore, getPersister } from '../db/tinybase';

export interface BackupData {
  version: string;
  exportDate: string;
  platform: 'ios' | 'android' | 'web';
  data: {
    categories: Record<string, unknown>;
    accounts: Record<string, unknown>;
    transactions: Record<string, unknown>;
  };
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