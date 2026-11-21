/**
 * Mercury API client.
 *
 * Reads against the production base URL by default. A development build can
 * override it with EXPO_PUBLIC_MERCURY_SANDBOX_API_URL to point at
 * https://api-sandbox.mercury.com/api/v1 (docs/mercury-sandbox-reconnaissance.md);
 * a release build always talks to production regardless of what a local .env
 * contains.
 *
 * The API token travels only inside the Authorization header of the request
 * it authenticates. It is never logged, never part of an error message, and
 * never passed to analytics.
 */

export const MERCURY_PRODUCTION_API_URL = 'https://api.mercury.com/api/v1';

// Bounded network wait so a dead endpoint cannot hang a spinner.
const REQUEST_TIMEOUT_MS = 10_000;

// Expo inlines EXPO_PUBLIC_* values at bundle time.
const CONFIGURED_SANDBOX_URL = process.env.EXPO_PUBLIC_MERCURY_SANDBOX_API_URL;

export type MercuryApiErrorKind =
  | 'invalidCredentials'
  | 'network'
  | 'timeout'
  | 'unexpected';

/**
 * The HTTP status is exposed so callers can distinguish a Mercury rejection
 * (401/403) from a broken relay. The message never repeats the token.
 */
export class MercuryApiError extends Error {
  readonly kind: MercuryApiErrorKind;
  readonly status: number | null;

  constructor(kind: MercuryApiErrorKind, status: number | null, message: string) {
    super(message);
    this.name = 'MercuryApiError';
    this.kind = kind;
    this.status = status;
  }
}

export interface MercuryApiAccount {
  id: string;
  name: string;
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const url = value?.trim().replace(/\/+$/, '');
  return url ? url : null;
}

export function resolveMercuryApiBaseUrl({
  production = MERCURY_PRODUCTION_API_URL,
  sandbox = CONFIGURED_SANDBOX_URL,
  isDev = __DEV__,
}: {
  production?: string;
  sandbox?: string;
  isDev?: boolean;
} = {}): string {
  const productionUrl = normalizeBaseUrl(production) ?? MERCURY_PRODUCTION_API_URL;
  if (!isDev) return productionUrl;
  return normalizeBaseUrl(sandbox) ?? productionUrl;
}

/**
 * Prove a token works: `GET /accounts` is the cheapest authenticated read.
 * Nothing is persisted here; the connect flow only stores a token after this
 * resolves. Errors carry a kind so the UI can show three distinct messages:
 * invalid credentials, network failure, and timeout.
 */
export async function fetchMercuryAccounts(token: string): Promise<MercuryApiAccount[]> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new MercuryApiError('invalidCredentials', null, 'No API token was provided.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(`${resolveMercuryApiBaseUrl()}/accounts`, {
        headers: { Authorization: `Bearer ${trimmed}` },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted || (error as Error | undefined)?.name === 'AbortError') {
        throw new MercuryApiError(
          'timeout',
          null,
          'Mercury did not respond within 10 seconds.',
        );
      }
      throw new MercuryApiError('network', null, 'Could not reach Mercury.');
    }

    if (response.status === 401 || response.status === 403) {
      throw new MercuryApiError(
        'invalidCredentials',
        response.status,
        'Mercury rejected the API token.',
      );
    }
    if (!response.ok) {
      throw new MercuryApiError(
        'unexpected',
        response.status,
        `Mercury responded with an unexpected HTTP ${response.status}.`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // The timeout still bounds the body read: an aborted read must not be
      // misreported as a 200-shaped response problem.
      if (controller.signal.aborted) {
        throw new MercuryApiError(
          'timeout',
          null,
          'Mercury did not respond within 10 seconds.',
        );
      }
      throw new MercuryApiError(
        'unexpected',
        response.status,
        'Mercury sent a response that could not be read.',
      );
    }

    const accounts = (body as { accounts?: unknown } | null)?.accounts;
    if (!Array.isArray(accounts)) {
      throw new MercuryApiError(
        'unexpected',
        response.status,
        'Mercury sent an unexpected response shape.',
      );
    }

    // Entries without a usable id are dropped, not coerced: an empty id would
    // collapse into one row key during mapping later.
    return (accounts as { id?: unknown; name?: unknown }[])
      .filter((account) => typeof account?.id === 'string' && account.id !== '')
      .map((account) => ({
        id: account.id as string,
        name: typeof account?.name === 'string' ? account.name : '',
      }));
  } finally {
    clearTimeout(timer);
  }
}
