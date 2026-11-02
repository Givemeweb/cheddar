import {
  createSatSaleInvoice,
  fetchSatSaleConfig,
  fetchSatSaleStatus,
  normalizeLicense,
} from './api';

const INVOICE = {
  license: 'ABCDEFGHJKMNPQRSTVWX',
  licenseFormatted: 'ABCDE-FGHJK-MNPQR-STVWX',
  address: 'bc1qtestaddress',
  btcValue: 0.00042,
  uri: 'bitcoin:bc1qtestaddress?amount=0.00042',
  expiresAt: '2026-11-02T18:00:00.000Z',
};

const originalFetch = global.fetch;
const fetchMock = jest.fn();

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

describe('SatSale API client', () => {
  it('fetches the price, currency, and support email', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ price: 20, currency: 'USD', supportEmail: ' hi@x.io ' }),
    );

    await expect(fetchSatSaleConfig()).resolves.toEqual({
      price: 20,
      currency: 'USD',
      supportEmail: 'hi@x.io',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/satsale/config',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates an invoice with an optional license hint', async () => {
    fetchMock.mockResolvedValue(jsonResponse(INVOICE));

    await expect(createSatSaleInvoice()).resolves.toEqual(INVOICE);
    await expect(createSatSaleInvoice(INVOICE.license)).resolves.toEqual(
      INVOICE,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/satsale/invoice',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/satsale/invoice',
      expect.objectContaining({
        body: JSON.stringify({ license: INVOICE.license }),
      }),
    );
  });

  it('checks a license status', async () => {
    const payload = {
      ...INVOICE,
      status: 'pending',
      confirmedPaid: 0,
      unconfirmedPaid: 0,
      secondsRemaining: 600,
    };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(fetchSatSaleStatus(INVOICE.license)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/satsale/status',
      expect.objectContaining({
        body: JSON.stringify({ license: INVOICE.license }),
      }),
    );
  });

  it('turns a non-2xx answer into a controlled http error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: jest.fn(),
    } as unknown as Response);

    await expect(createSatSaleInvoice()).rejects.toMatchObject({
      name: 'SatSaleApiError',
      code: 'http',
      status: 502,
    });
  });

  it('rejects an unparseable body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new Error('not json')),
    } as unknown as Response);

    await expect(fetchSatSaleConfig()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('rejects an invoice without an address', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...INVOICE, address: '', uri: '' }),
    );

    await expect(createSatSaleInvoice()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('rejects an unknown status value', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...INVOICE, status: 'mined', secondsRemaining: 1 }),
    );

    await expect(fetchSatSaleStatus(INVOICE.license)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(fetchSatSaleConfig()).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('aborts a request that exceeds the timeout', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );

    const request = fetchSatSaleConfig();
    const assertion = expect(request).rejects.toMatchObject({ code: 'timeout' });
    jest.advanceTimersByTime(60_000);
    await assertion;
  });

  it('bounds the body read, not only the headers', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            const abort = () =>
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' }),
              );
            if (init.signal?.aborted) {
              abort();
              return;
            }
            init.signal?.addEventListener('abort', abort);
          }),
      } as unknown as Response),
    );

    const request = fetchSatSaleConfig();
    const assertion = expect(request).rejects.toMatchObject({ code: 'timeout' });
    jest.advanceTimersByTime(60_000);
    await assertion;
  });
});

describe('normalizeLicense', () => {
  it('accepts the display form, lower case, and Crockford lookalikes', () => {
    expect(normalizeLicense('abcde-fghjk-mnpqr-stvwx')).toBe(INVOICE.license);
    expect(normalizeLicense('ABCDE FGHJK MNPQR STVWX')).toBe(INVOICE.license);
    expect(normalizeLicense('ABCDE-FGHJK-MNPQR-STVWX')).toBe(INVOICE.license);
    expect(normalizeLicense('ABCDE-FGHJK-MNPQR-STVWO')).toBe(
      'ABCDEFGHJKMNPQRSTVW0',
    );
    expect(normalizeLicense('ABCDE-FGHJK-MNPQR-STVWl')).toBe(
      'ABCDEFGHJKMNPQRSTVW1',
    );
  });

  it('rejects a wrong length or an alphabet outsider', () => {
    expect(normalizeLicense('ABCDE-FGHJK')).toBe('');
    expect(normalizeLicense('ABCDE-FGHJK-MNPQR-STVWU')).toBe('');
    expect(normalizeLicense('')).toBe('');
    expect(normalizeLicense(undefined as unknown as string)).toBe('');
  });
});
