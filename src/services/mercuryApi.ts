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
  /** Major-unit balance; null when Mercury did not report one. */
  currentBalance: number | null;
}

/**
 * The subset of the Mercury transaction object the importer reads
 * (docs/mercury-sandbox-reconnaissance.md section 2). Unknown fields are not
 * carried: the importer stores a fixed mapping, not a mirror of the payload.
 */
export interface MercuryApiTransaction {
  id: string;
  accountId: string | null;
  /** Signed major-unit amount; debits negative, credits positive. */
  amount: number | null;
  status: string | null;
  kind: string | null;
  createdAt: string | null;
  postedAt: string | null;
  note: string | null;
  bankDescription: string | null;
  counterpartyName: string | null;
  /** Non-null only on FX rows; presence is the anomaly signal (record rule 4). */
  currencyExchangeInfo: unknown;
  /** Card-transaction merchant; its currency feeds the anomaly signal. */
  merchant: { currency?: unknown } | null;
  /** Custom Mercury category (when the org has one), nullable. */
  categoryData: { name?: unknown } | null;
  /** Built-in Mercury category enum value, nullable. */
  mercuryCategory: string | null;
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
 * One authenticated GET: bounded wait, status classification, and JSON body.
 * The token only ever lands in the Authorization header; errors never repeat it.
 */
async function mercuryFetchJson(token: string, path: string): Promise<unknown> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new MercuryApiError('invalidCredentials', null, 'No API token was provided.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(`${resolveMercuryApiBaseUrl()}${path}`, {
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

    try {
      return await response.json();
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
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prove a token works: `GET /accounts` is the cheapest authenticated read.
 * Nothing is persisted here; the connect flow only stores a token after this
 * resolves. Errors carry a kind so the UI can show three distinct messages:
 * invalid credentials, network failure, and timeout.
 */
export async function fetchMercuryAccounts(token: string): Promise<MercuryApiAccount[]> {
  const body = await mercuryFetchJson(token, '/accounts');

  const accounts = (body as { accounts?: unknown } | null)?.accounts;
  if (!Array.isArray(accounts)) {
    throw new MercuryApiError('unexpected', 200, 'Mercury sent an unexpected response shape.');
  }

  // Entries without a usable id are dropped, not coerced: an empty id would
  // collapse into one row key during mapping later.
  return (accounts as Record<string, unknown>[])
    .filter((account) => typeof account?.id === 'string' && account.id !== '')
    .map((account) => ({
      id: account.id as string,
      name: typeof account?.name === 'string' ? account.name : '',
      currentBalance: typeof account?.currentBalance === 'number' ? account.currentBalance : null,
    }));
}

// The importer pages in chunks of 500 per the ticket; the endpoint accepts
// 1..1000 and paginates with an integer offset.
export const MERCURY_TRANSACTIONS_PAGE_LIMIT = 500;

function parseMercuryTransaction(raw: Record<string, unknown>): MercuryApiTransaction | null {
  // Rows without a usable id are dropped: the id is the dedupe key and an
  // empty id would collapse into one link row.
  if (typeof raw?.id !== 'string' || raw.id === '') return null;
  return {
    id: raw.id,
    accountId: typeof raw.accountId === 'string' ? raw.accountId : null,
    amount: typeof raw.amount === 'number' ? raw.amount : null,
    status: typeof raw.status === 'string' ? raw.status : null,
    kind: typeof raw.kind === 'string' ? raw.kind : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    postedAt: raw.postedAt === null || raw.postedAt === undefined ? null
      : typeof raw.postedAt === 'string' ? raw.postedAt : null,
    note: raw.note === null || raw.note === undefined ? null
      : typeof raw.note === 'string' ? raw.note : null,
    bankDescription: raw.bankDescription === null || raw.bankDescription === undefined ? null
      : typeof raw.bankDescription === 'string' ? raw.bankDescription : null,
    counterpartyName: raw.counterpartyName === null || raw.counterpartyName === undefined ? null
      : typeof raw.counterpartyName === 'string' ? raw.counterpartyName : null,
    currencyExchangeInfo: raw.currencyExchangeInfo ?? null,
    merchant: raw.merchant && typeof raw.merchant === 'object'
      ? (raw.merchant as { currency?: unknown }) : null,
    categoryData: raw.categoryData && typeof raw.categoryData === 'object'
      ? (raw.categoryData as { name?: unknown }) : null,
    mercuryCategory: raw.mercuryCategory === null || raw.mercuryCategory === undefined ? null
      : typeof raw.mercuryCategory === 'string' ? raw.mercuryCategory : null,
  };
}

async function fetchMercuryTransactionPage(
  token: string,
  accountId: string,
  { start, offset }: { start: string; offset: number },
): Promise<{ total: number; rawCount: number; transactions: MercuryApiTransaction[] }> {
  const query = new URLSearchParams({
    limit: String(MERCURY_TRANSACTIONS_PAGE_LIMIT),
    start,
    offset: String(offset),
  });
  const body = await mercuryFetchJson(
    token,
    `/account/${encodeURIComponent(accountId)}/transactions?${query.toString()}`,
  );

  const transactions = (body as { transactions?: unknown } | null)?.transactions;
  if (!Array.isArray(transactions)) {
    throw new MercuryApiError('unexpected', 200, 'Mercury sent an unexpected response shape.');
  }
  const total = (body as { total?: unknown }).total;
  return {
    total: typeof total === 'number' ? total : transactions.length,
    rawCount: transactions.length,
    transactions: (transactions as Record<string, unknown>[])
      .map(parseMercuryTransaction)
      .filter((tx): tx is MercuryApiTransaction => tx !== null),
  };
}

/**
 * Every transaction for one account from `start` (YYYY-MM-DD or ISO 8601)
 * onward, fetched in pages of 500.
 *
 * The `start` parameter must always be passed by callers: the endpoint's
 * default window is 30 days and silently drops boundary rows (record F6).
 * The endpoint paginates with a numeric offset. Two guards keep the walk
 * honest: the page walks stops on the raw page length (rows without a
 * usable id are dropped by the parser and must not end it early), and a
 * repeated first id means the server ignored the offset, so the page is
 * returned without being appended twice.
 */
export async function fetchMercuryTransactions(
  token: string,
  accountId: string,
  { start }: { start: string },
): Promise<MercuryApiTransaction[]> {
  const all: MercuryApiTransaction[] = [];
  let offset = 0;
  let previousPageFirstId: string | null = null;

  while (true) {
    const page = await fetchMercuryTransactionPage(token, accountId, { start, offset });

    const firstId = page.transactions[0]?.id ?? null;
    if (previousPageFirstId !== null && firstId === previousPageFirstId) return all;
    all.push(...page.transactions);

    if (page.rawCount < MERCURY_TRANSACTIONS_PAGE_LIMIT) return all;

    previousPageFirstId = firstId;
    offset += MERCURY_TRANSACTIONS_PAGE_LIMIT;
  }
}
