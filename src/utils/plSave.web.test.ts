import { saveProfitLossWorkbook } from './plSave.web';
import { downloadBytes } from './download';

jest.mock('./download', () => ({ downloadBytes: jest.fn() }));

const downloadBytesMock = downloadBytes as jest.Mock;

beforeEach(() => {
  // mockReset, not clearAllMocks: implementations survive clearAllMocks, so
  // the error-path test's throwing implementation would leak into the
  // happy-path test.
  downloadBytesMock.mockReset();
});

describe('plSave on web (browser download)', () => {
  it('downloads the exact workbook bytes under the proposed file name', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 1, 2, 3]);

    const outcome = await saveProfitLossWorkbook(bytes, 'Profit & Loss 2025.xlsx');

    expect(downloadBytesMock).toHaveBeenCalledTimes(1);
    expect(downloadBytesMock).toHaveBeenCalledWith(
      bytes,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Profit & Loss 2025.xlsx',
    );
    // A started download is the completed export on web.
    expect(outcome).toEqual({ status: 'saved' });
  });

  it('propagates a failed download as a rejection (the screen maps it to the error card)', async () => {
    downloadBytesMock.mockImplementation(() => {
      throw new Error('download blocked');
    });

    await expect(
      saveProfitLossWorkbook(new Uint8Array([1]), 'Profit & Loss 2025.xlsx'),
    ).rejects.toThrow('download blocked');
  });
});
