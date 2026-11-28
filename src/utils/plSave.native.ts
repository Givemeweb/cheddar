// Native-only implementation (iOS/Android): Android saves through the OS
// folder picker (SAF), iOS offers the file via the share sheet.
// Web implementation is in plSave.web.ts (ticket 03).

import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { StorageAccessFramework, EncodingType, deleteAsync } from 'expo-file-system/legacy';
import { File, Paths } from 'expo-file-system';
import type { SaveOutcome, SaveProfitLossWorkbook } from './plSave';

// Local per-platform constants: a runtime import from './plSave' would hit
// jest's haste shadowing of the .web sibling and read as undefined.
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Delivery contract: on Android the OS folder picker opens on EVERY export
 * (nothing is remembered) and 'saved' means the file was written into the
 * chosen folder. On iOS 'offered' means the workbook was generated and
 * handed to the share sheet - keeping it is up to the user's share-sheet
 * choice ("Save to Files" is the folder-picker equivalent), so a dismissed
 * sheet is still a completed export and there is no silent save anywhere.
 * A dismissed Android picker is 'cancelled': an abort, not a failure.
 */
export const saveProfitLossWorkbook: SaveProfitLossWorkbook = async (
  bytes,
  fileName,
): Promise<SaveOutcome> => {
  if (Platform.OS === 'android') {
    const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      return { status: 'cancelled' };
    }
    // Signature order is (parent folder, display name, mime type): the
    // proposed file name must reach SAF as the display name.
    const fileUri = await StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      XLSX_MIME,
    );
    try {
      await StorageAccessFramework.writeAsStringAsync(fileUri, bytesToBase64(bytes), {
        encoding: EncodingType.Base64,
      });
    } catch (error) {
      // A failed write must not leave a zero-byte file in the user's folder.
      try {
        await deleteAsync(fileUri, { idempotent: true });
      } catch {
        // Cleanup is best effort; the write error is the one to surface.
      }
      throw error;
    }
    return { status: 'saved' };
  }

  // iOS: check sharing support before touching the filesystem, hand a
  // throwaway cache copy to the share sheet, and clean it up afterwards.
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  const file = new File(Paths.cache, fileName);
  try {
    file.write(bytes);
    await Sharing.shareAsync(file.uri, { mimeType: XLSX_MIME, UTI: XLSX_UTI });
  } finally {
    try {
      file.delete();
    } catch {
      // Cleanup must never mask the share outcome.
    }
  }
  return { status: 'offered' };
}
