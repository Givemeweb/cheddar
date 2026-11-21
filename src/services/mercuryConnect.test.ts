import {
  connectMercury,
} from './mercuryConnect';
import { MercuryApiError, resolveMercuryApiBaseUrl } from './mercuryApi';
import { upsertMercuryConnection } from '../db/mercury';
import { isDatabaseReady } from '../db/tinybase';
import * as SecureStore from 'expo-secure-store';

jest.mock('../db/mercury', () => ({
  upsertMercuryConnection: jest.fn(async () => {}),
}));

jest.mock('../db/tinybase', () => ({
  isDatabaseReady: jest.fn(() => true),
}));

// A stateful secure-store double so token-replacement semantics can be
// asserted (the reconnect flow overwrites an existing stored token).
const mockSecureStoreBacking = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreBacking.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStoreBacking.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreBacking.delete(key);
  }),
}));

const originalFetch = global.fetch;
const fetchMock = jest.fn();

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSecureStoreBacking.clear();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

describe('mercury connect flow', () => {
  it('stores the token in secure storage and the connection row after a successful validation', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ accounts: [{ id: 'acct-1', name: 'Checking' }] }),
    );

    await expect(connectMercury(' secret-token:abc ')).resolves.toBe(1);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.mercury.com/api/v1/accounts',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret-token:abc' },
      }),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'mercuryApiToken',
      'secret-token:abc',
    );
    expect(upsertMercuryConnection).toHaveBeenCalledWith(
      expect.objectContaining({ tokenStatus: 'active', createdAt: expect.any(Number) }),
    );
  });

  it('leaves no token and no connection behind when Mercury rejects the token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { errors: { errorCode: 'noTokenInDB', message: 'No matching token found' } },
        401,
      ),
    );

    await expect(connectMercury('secret-token:bad')).rejects.toMatchObject({
      name: 'MercuryApiError',
      kind: 'invalidCredentials',
      status: 401,
    });

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(upsertMercuryConnection).not.toHaveBeenCalled();
  });

  it('refuses to connect while the local database is not ready', async () => {
    (isDatabaseReady as jest.Mock).mockReturnValueOnce(false);
    fetchMock.mockResolvedValue(
      jsonResponse({ accounts: [{ id: 'acct-1', name: 'Checking' }] }),
    );

    await expect(connectMercury('secret-token:x')).rejects.toThrow(
      /database is not ready/,
    );
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(upsertMercuryConnection).not.toHaveBeenCalled();
  });

  it('rolls the just-stored token back when the connection row write fails', async () => {
    (upsertMercuryConnection as jest.Mock).mockRejectedValueOnce(
      new Error('row write failed'),
    );

    await expect(connectMercury('secret-token:x')).rejects.toThrow(
      'row write failed',
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'mercuryApiToken',
      'secret-token:x',
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('mercuryApiToken');
  });

  it('keeps invalid credentials, network failure, and timeout distinct', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 403));
    await expect(connectMercury('secret-token:x')).rejects.toMatchObject({
      kind: 'invalidCredentials',
      status: 403,
    });

    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(connectMercury('secret-token:x')).rejects.toMatchObject({
      kind: 'network',
      status: null,
    });

    fetchMock.mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );
    await expect(connectMercury('secret-token:x')).rejects.toMatchObject({
      kind: 'timeout',
      status: null,
    });
  });

  it('aborts a hung request after ten seconds', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );

    const pending = connectMercury('secret-token:x');
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    jest.advanceTimersByTime(10_000);
    await assertion;

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(upsertMercuryConnection).not.toHaveBeenCalled();
  });

  it('classifies an abort during the body read as a timeout, not as a bad response', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              const abort = () =>
                reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
              if (init.signal?.aborted) {
                abort();
                return;
              }
              init.signal?.addEventListener('abort', abort);
            }),
        } as unknown as Response),
    );

    const pending = connectMercury('secret-token:x');
    const assertion = expect(pending).rejects.toMatchObject({
      kind: 'timeout',
      status: null,
    });
    jest.advanceTimersByTime(10_000);
    await assertion;

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(upsertMercuryConnection).not.toHaveBeenCalled();
  });

  it('drops account entries without a usable id instead of coercing them', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        accounts: [
          { id: 'acct-1', name: 'Checking' },
          { name: 'no id at all' },
          { id: null, name: 'null id' },
          { id: '', name: 'empty id' },
        ],
      }),
    );

    await expect(connectMercury('secret-token:x')).resolves.toBe(1);
    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    expect(upsertMercuryConnection).toHaveBeenCalled();
  });

  it('reports other HTTP statuses with the status attached', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(connectMercury('secret-token:x')).rejects.toMatchObject({
      kind: 'unexpected',
      status: 500,
    });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(upsertMercuryConnection).not.toHaveBeenCalled();
  });

  it('never surfaces the token in an error message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 401));

    const error = await connectMercury('secret-token:leaky').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(MercuryApiError);
    expect((error as Error).message).not.toContain('secret-token:leaky');
  });
});

describe('reconnect replaces the stored token (ticket 07)', () => {
  it('stores the new token over the old one and clears the re-authentication state', async () => {
    mockSecureStoreBacking.set('mercuryApiToken', 'secret-token:old');
    fetchMock.mockResolvedValue(
      jsonResponse({ accounts: [{ id: 'acct-1', name: 'Checking' }] }),
    );

    await expect(connectMercury('secret-token:new')).resolves.toBe(1);

    // The old token is gone and the validated one is what SecureStore holds.
    expect([...mockSecureStoreBacking.entries()]).toEqual([
      ['mercuryApiToken', 'secret-token:new'],
    ]);
    // The connection row flips back to active, so sync resumes.
    expect(upsertMercuryConnection).toHaveBeenCalledWith(
      expect.objectContaining({ tokenStatus: 'active' }),
    );
  });

  it('a failed validation keeps the old token and the needs_reauth state', async () => {
    mockSecureStoreBacking.set('mercuryApiToken', 'secret-token:old');
    fetchMock.mockResolvedValue(
      jsonResponse(
        { errors: { errorCode: 'noTokenInDB', message: 'No matching token found' } },
        401,
      ),
    );

    await expect(connectMercury('secret-token:new')).rejects.toMatchObject({
      kind: 'invalidCredentials',
    });

    // Nothing was written: the old token stays and the row write never ran.
    expect(mockSecureStoreBacking.get('mercuryApiToken')).toBe('secret-token:old');
    expect(upsertMercuryConnection).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});

describe('mercury base URL', () => {
  const PRODUCTION = 'https://api.mercury.com/api/v1';
  const SANDBOX = 'https://api-sandbox.mercury.com/api/v1';

  it('defaults to production and honors the sandbox override only in dev', () => {
    expect(resolveMercuryApiBaseUrl({ isDev: false, sandbox: SANDBOX })).toBe(
      PRODUCTION,
    );
    expect(resolveMercuryApiBaseUrl({ isDev: true, sandbox: SANDBOX })).toBe(
      SANDBOX,
    );
    expect(resolveMercuryApiBaseUrl({ isDev: true, sandbox: undefined })).toBe(
      PRODUCTION,
    );
    expect(resolveMercuryApiBaseUrl({ isDev: true, sandbox: '  ' })).toBe(
      PRODUCTION,
    );
    expect(
      resolveMercuryApiBaseUrl({ isDev: true, sandbox: `${SANDBOX}///` }),
    ).toBe(SANDBOX);
  });
});
