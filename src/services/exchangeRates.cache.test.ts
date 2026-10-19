import {
  getLatestRates,
  _resetRatesCacheForTests,
  RatesCache,
} from './exchangeRates';

type MockedAsyncStorage = {
  default: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
};

const storage = require('@react-native-async-storage/async-storage') as MockedAsyncStorage;

// Injectable global fetch (jsdom provides it but we replace per test)
const originalFetch = global.fetch;

const makeCache = (ageMs: number): RatesCache => ({
  base: 'EUR',
  rates: { USD: 1.12 },
  fetchedAt: Date.now() - ageMs,
  date: '2026-10-17',
});

describe('getLatestRates caching behaviour', () => {
  beforeEach(() => {
    _resetRatesCacheForTests();
    storage.default.getItem.mockClear();
    storage.default.setItem.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns fresh cache without touching the network', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    storage.default.getItem.mockResolvedValueOnce(JSON.stringify(makeCache(0)));

    const result = await getLatestRates();
    expect(result).not.toBeNull();
    expect(result!.rates.USD).toBe(1.12);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns stale cache immediately and refreshes in the background', async () => {
    // A fetch that never resolves during the test: the caller must not wait.
    let resolveFetch: (value: unknown) => void = () => {};
    global.fetch = jest.fn(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    ) as unknown as typeof fetch;

    storage.default.getItem.mockResolvedValueOnce(JSON.stringify(makeCache(13 * 60 * 60 * 1000)));

    const started = Date.now();
    const result = await getLatestRates();
    expect(Date.now() - started).toBeLessThan(200);
    expect(result!.rates.USD).toBe(1.12); // stale but served

    // Background refresh was kicked off exactly once
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Let the background refresh finish and verify the cache was written.
    resolveFetch({
      ok: true,
      json: async () => ({ base: 'EUR', rates: { USD: 1.2 }, date: '2026-10-17' }),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(storage.default.setItem).toHaveBeenCalledWith(
      'exchangeRatesCache',
      expect.stringContaining('"USD":1.2'),
    );
  });

  it('caps the blocking fetch on first launch with a hung network', async () => {
    // Mock fetch the way a real fetch behaves: reject when the signal aborts.
    global.fetch = jest.fn(
      (_url: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () =>
            reject(new Error('AbortError')),
          );
        }),
    ) as unknown as typeof fetch;

    storage.default.getItem.mockResolvedValueOnce(null); // no cache at all

    const started = Date.now();
    const result = await getLatestRates();
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(4_500); // hit the 5s timeout
    expect(elapsed).toBeLessThan(8_000); // but nowhere near a real hang
    expect(result).toBeNull(); // nothing to fall back to on first launch
  }, 20_000);

  it('falls back to stale cache when a forced refresh fails', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    storage.default.getItem.mockResolvedValueOnce(JSON.stringify(makeCache(48 * 60 * 60 * 1000)));

    const result = await getLatestRates(true);
    expect(result!.rates.USD).toBe(1.12);
  });
});
