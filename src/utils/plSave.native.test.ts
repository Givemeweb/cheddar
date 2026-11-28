import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { StorageAccessFramework, EncodingType, deleteAsync } from 'expo-file-system/legacy';
import { File, Paths } from 'expo-file-system';
import { saveProfitLossWorkbook } from './plSave.native';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache' } },
  File: jest.fn().mockImplementation((_dir: unknown, fileName: string) => ({
    uri: `file:///cache/${fileName}`,
    write: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
  },
  deleteAsync: jest.fn(async () => {}),
}));

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BYTES = new Uint8Array([1, 2, 3, 4]);

const requestPermissions = StorageAccessFramework.requestDirectoryPermissionsAsync as jest.Mock;
const createFile = StorageAccessFramework.createFileAsync as jest.Mock;
const writeString = StorageAccessFramework.writeAsStringAsync as jest.Mock;
const deleteString = deleteAsync as jest.Mock;

// The mocked react-native Platform is shared module state; tests flip it to
// stage the platform under test (plSave reads it at call time).
const setPlatform = (os: 'ios' | 'android') => {
  (Platform as { OS: string }).OS = os;
};

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps implementations, so re-arm the defaults each test
  // relies on: an earlier test's override (e.g. sharing unavailable) must
  // not leak into later tests.
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (File as unknown as jest.Mock).mockImplementation(
    (_dir: unknown, fileName: string) => ({
      uri: `file:///cache/${fileName}`,
      write: jest.fn(),
      delete: jest.fn(),
    }),
  );
  setPlatform('ios');
});

describe('plSave on Android (SAF folder picker)', () => {
  beforeEach(() => setPlatform('android'));

  it('asks SAF to create the proposed file name with the xlsx mime type', async () => {
    requestPermissions.mockResolvedValue({
      granted: true,
      directoryUri: 'content://chosen-folder',
    });
    createFile.mockResolvedValue('content://chosen-folder/file.xlsx');

    const outcome = await saveProfitLossWorkbook(BYTES, 'Profit & Loss 2025.xlsx');

    // Argument order is the SAF contract: (parent folder, display name, mime).
    expect(createFile).toHaveBeenCalledWith(
      'content://chosen-folder',
      'Profit & Loss 2025.xlsx',
      XLSX_MIME,
    );
    expect(writeString).toHaveBeenCalledWith(
      'content://chosen-folder/file.xlsx',
      expect.any(String),
      { encoding: EncodingType.Base64 },
    );
    expect(outcome).toEqual({ status: 'saved' });
  });

  it('reports a dismissed folder picker as cancelled and never touches the folder', async () => {
    requestPermissions.mockResolvedValue({ granted: false });

    const outcome = await saveProfitLossWorkbook(BYTES, 'Profit & Loss 2025.xlsx');

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(createFile).not.toHaveBeenCalled();
    expect(writeString).not.toHaveBeenCalled();
  });

  it('deletes the created SAF file when the write fails', async () => {
    requestPermissions.mockResolvedValue({
      granted: true,
      directoryUri: 'content://chosen-folder',
    });
    createFile.mockResolvedValue('content://chosen-folder/file.xlsx');
    writeString.mockRejectedValue(new Error('write failed'));

    await expect(saveProfitLossWorkbook(BYTES, 'Profit & Loss 2025.xlsx')).rejects.toThrow(
      'write failed',
    );

    expect(deleteString).toHaveBeenCalledWith('content://chosen-folder/file.xlsx', {
      idempotent: true,
    });
  });
});

describe('plSave on iOS (share sheet)', () => {
  it('offers a cache copy through the share sheet and cleans it up', async () => {
    const outcome = await saveProfitLossWorkbook(BYTES, 'Profit & Loss 2025.xlsx');

    const fileMock = File as unknown as jest.Mock;
    expect(fileMock).toHaveBeenCalledWith(Paths.cache, 'Profit & Loss 2025.xlsx');
    const written = fileMock.mock.results[0].value;
    expect(written.write).toHaveBeenCalledWith(BYTES);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/Profit & Loss 2025.xlsx',
      {
        mimeType: XLSX_MIME,
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      },
    );
    expect(written.delete).toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'offered' });
  });

  it('fails before writing anything when sharing is unavailable', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

    await expect(saveProfitLossWorkbook(BYTES, 'Profit & Loss 2025.xlsx')).rejects.toThrow(
      'Sharing is not available',
    );

    expect(File).not.toHaveBeenCalled();
  });
});
