import { downloadBytes } from './download';

/**
 * Tests for the shared browser-download mechanism (extracted from the
 * backup export's web branch, reused by the Profit & Loss web path). The
 * test environment is Node, so the DOM surface is stubbed by hand and the
 * deferred revoke runs under fake timers.
 */
describe('downloadBytes (web delivery mechanism)', () => {
  const BYTES = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 0xff]);
  let anchor: { href: string; download: string; click: jest.Mock };
  let appendChild: jest.Mock;
  let removeChild: jest.Mock;
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let urlCounter: number;

  beforeEach(() => {
    jest.useFakeTimers();
    anchor = { href: '', download: '', click: jest.fn() };
    appendChild = jest.fn();
    removeChild = jest.fn();
    urlCounter = 0;
    createObjectURL = jest.fn(() => `blob:mock-${++urlCounter}`);
    revokeObjectURL = jest.fn();
    (globalThis as { document?: unknown }).document = {
      createElement: jest.fn(() => anchor),
      body: { appendChild, removeChild },
    };
    jest.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
  });

  afterEach(() => {
    // The stubbed document and the URL spies must not leak into other tests.
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete (globalThis as { document?: unknown }).document;
  });

  it('downloads the exact bytes under the proposed file name and defers the revoke', async () => {
    downloadBytes(BYTES, 'application/vnd.test', 'Profit & Loss 2025.xlsx');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/vnd.test');
    const payload = new Uint8Array(await blob.arrayBuffer());
    expect([...payload]).toEqual([...BYTES]);

    expect(anchor.download).toBe('Profit & Loss 2025.xlsx');
    expect(anchor.href).toBe('blob:mock-1');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(removeChild).toHaveBeenCalledWith(anchor);
    // The URL must survive the tick a browser may need to resolve it.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(0);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('keeps the object URL alive and revokes it even when the click throws', () => {
    anchor.click.mockImplementation(() => {
      throw new Error('download blocked');
    });

    expect(() => downloadBytes(BYTES, 'application/vnd.test', 'x.xlsx')).toThrow(
      'download blocked',
    );
    // The anchor was attached before the throw, so the cleanup still runs.
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(0);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('revokes the object URL even when attaching the anchor throws', () => {
    appendChild.mockImplementation(() => {
      throw new Error('append failed');
    });

    expect(() => downloadBytes(BYTES, 'application/vnd.test', 'x.xlsx')).toThrow(
      'append failed',
    );
    // The URL was already created, so the deferred revoke must still run.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(0);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('creates and revokes a distinct object URL per download', () => {
    downloadBytes(BYTES, 'application/vnd.test', 'first.xlsx');
    jest.advanceTimersByTime(0);
    downloadBytes(BYTES, 'application/vnd.test', 'second.xlsx');
    jest.advanceTimersByTime(0);

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL.mock.calls.map((call) => call[0])).toEqual([
      'blob:mock-1',
      'blob:mock-2',
    ]);
  });
});
