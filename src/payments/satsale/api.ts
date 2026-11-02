import {
  CRYPTO_STATUS_NAMES,
  type CryptoInvoice,
  type CryptoStatus,
  type CryptoStatusName,
} from '../PaymentContext';

/**
 * Client for the SatSale purchase API. The app never talks to SatSale
 * directly: PocketBase creates the invoice, holds the private view key, and
 * reconciles the payment status. Every call is bounded by a timeout so a
 * flaky node cannot leave the payment modal spinning.
 */
const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/satsale';

// Expo inlines EXPO_PUBLIC_* values at bundle time. The staging URL is only
// consulted by a debug build; a release build always uses the configured
// production URL even if a local .env file contains a staging value.
const CONFIGURED_API_BASE_URL = process.env.EXPO_PUBLIC_SATSALE_API_URL;
const STAGING_API_BASE_URL =
  process.env.EXPO_PUBLIC_SATSALE_STAGING_API_URL;

function normalizeBaseUrl(value: string | undefined): string | null {
  const url = value?.trim().replace(/\/+$/, '');
  return url ? url : null;
}

function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      /^127(?:\.\d{1,3}){3}$/.test(host)
    );
  } catch {
    return false;
  }
}

function isCleartextLoopback(url: string): boolean {
  return /^http:\/\//i.test(url) && isLoopbackUrl(url);
}

export function resolveSatSaleApiBaseUrl({
  production = CONFIGURED_API_BASE_URL,
  staging = STAGING_API_BASE_URL,
  isDev = __DEV__,
}: {
  production?: string;
  staging?: string;
  isDev?: boolean;
} = {}): string {
  const productionUrl = normalizeBaseUrl(production);

  if (!isDev) {
    // A release build must never guess. A missing or non-HTTPS URL is a broken
    // build; the release workflow already verifies that this value reaches the
    // APK, but local release builds need the same guard.
    if (!productionUrl) {
      throw new Error(
        'EXPO_PUBLIC_SATSALE_API_URL must be set for a release build.',
      );
    }
    if (!/^https:\/\//i.test(productionUrl)) {
      throw new Error(
        'EXPO_PUBLIC_SATSALE_API_URL must be an absolute https:// URL.',
      );
    }
    if (isLoopbackUrl(productionUrl)) {
      throw new Error(
        'EXPO_PUBLIC_SATSALE_API_URL must not point at a local host.',
      );
    }
    return productionUrl;
  }

  // A debug build only reaches staging or localhost. Falling back to the
  // production URL here would let a forgotten staging variable spend real
  // money, so the safer default wins even when a production URL is configured.
  const stagingUrl = normalizeBaseUrl(staging);
  if (
    stagingUrl &&
    !/^https:\/\//i.test(stagingUrl) &&
    !isCleartextLoopback(stagingUrl)
  ) {
    throw new Error(
      'EXPO_PUBLIC_SATSALE_STAGING_API_URL must be an absolute https:// URL, except for localhost.',
    );
  }
  return stagingUrl ?? DEFAULT_API_BASE_URL;
}

const REQUEST_TIMEOUT_MS = 10_000;
// The backend itself waits up to 20s for SatSale to create the invoice.
const INVOICE_TIMEOUT_MS = 30_000;

// Crockford base32, same alphabet the backend issues.
const LICENSE_LENGTH = 20;
const LICENSE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const STATUS_NAMES: readonly string[] = CRYPTO_STATUS_NAMES;

export type SatSaleApiErrorCode =
  | 'network'
  | 'timeout'
  | 'http'
  | 'invalid_response'
  | 'invalid_license'
  | 'configuration';

export class SatSaleApiError extends Error {
  readonly code: SatSaleApiErrorCode;
  readonly status?: number;

  constructor(code: SatSaleApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'SatSaleApiError';
    this.code = code;
    this.status = status;
  }
}

export type SatSaleConfig = {
  price: number;
  currency: string;
  supportEmail: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the invoice shape shared by the invoice response, the status
 * response, and the JSON kept in the local store.
 */
export function parseInvoice(payload: unknown): CryptoInvoice | null {
  if (!isRecord(payload)) return null;

  const { license, licenseFormatted, address, btcValue, uri, expiresAt } =
    payload;
  if (
    typeof license !== 'string' ||
    !license ||
    typeof licenseFormatted !== 'string' ||
    typeof address !== 'string' ||
    typeof btcValue !== 'number' ||
    !isFinite(btcValue) ||
    typeof uri !== 'string' ||
    typeof expiresAt !== 'string'
  ) {
    return null;
  }

  return { license, licenseFormatted, address, btcValue, uri, expiresAt };
}

function readStatus(payload: unknown): CryptoStatus | null {
  const invoice = parseInvoice(payload);
  if (!invoice || !isRecord(payload)) return null;

  const { status, confirmedPaid, unconfirmedPaid, secondsRemaining } = payload;
  if (
    typeof status !== 'string' ||
    !STATUS_NAMES.includes(status) ||
    (confirmedPaid !== null && typeof confirmedPaid !== 'number') ||
    (unconfirmedPaid !== null && typeof unconfirmedPaid !== 'number') ||
    typeof secondsRemaining !== 'number'
  ) {
    return null;
  }

  return {
    ...invoice,
    status: status as CryptoStatusName,
    confirmedPaid: confirmedPaid as number | null,
    unconfirmedPaid: unconfirmedPaid as number | null,
    secondsRemaining,
  };
}

async function request(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  let baseUrl: string;
  try {
    // Resolved per request rather than at import time so a release build with
    // a broken configuration fails the request instead of crashing on launch.
    baseUrl = resolveSatSaleApiBaseUrl();
  } catch (error) {
    throw new SatSaleApiError(
      'configuration',
      error instanceof Error
        ? error.message
        : 'The payment server is not configured',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...init.headers },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new SatSaleApiError(
          'timeout',
          'The payment server took too long to answer',
        );
      }
      throw new SatSaleApiError(
        'network',
        'The payment server is unreachable',
      );
    }

    if (!response.ok) {
      throw new SatSaleApiError(
        'http',
        `The payment server answered ${response.status}`,
        response.status,
      );
    }

    // Keep the abort timer armed until the body is read: a server can send
    // headers and then stall, which would otherwise hang the modal.
    try {
      return await response.json();
    } catch {
      if (controller.signal.aborted) {
        throw new SatSaleApiError(
          'timeout',
          'The payment server took too long to answer',
        );
      }
      throw new SatSaleApiError(
        'invalid_response',
        'The payment server sent an invalid response',
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSatSaleConfig(): Promise<SatSaleConfig> {
  const payload = await request('/config', { method: 'GET' }, REQUEST_TIMEOUT_MS);
  if (!isRecord(payload)) {
    throw new SatSaleApiError(
      'invalid_response',
      'The payment server sent an invalid response',
    );
  }

  const { price, currency, supportEmail } = payload;
  if (
    typeof price !== 'number' ||
    !isFinite(price) ||
    price <= 0 ||
    typeof currency !== 'string' ||
    !currency.trim()
  ) {
    throw new SatSaleApiError(
      'invalid_response',
      'The payment server sent an invalid response',
    );
  }

  return {
    price,
    currency: currency.trim(),
    supportEmail:
      typeof supportEmail === 'string' ? supportEmail.trim() : '',
  };
}

/**
 * Creates an invoice. Passing the license of a still-pending purchase makes
 * the backend reuse its invoice instead of burning another one.
 */
export async function createSatSaleInvoice(
  license?: string,
): Promise<CryptoInvoice> {
  const payload = await request(
    '/invoice',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(license ? { license } : {}),
    },
    INVOICE_TIMEOUT_MS,
  );

  const invoice = parseInvoice(payload);
  if (!invoice || !invoice.address || !invoice.uri) {
    throw new SatSaleApiError(
      'invalid_response',
      'The payment server sent an invalid invoice',
    );
  }
  return invoice;
}

export async function fetchSatSaleStatus(license: string): Promise<CryptoStatus> {
  const payload = await request(
    '/status',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license }),
    },
    REQUEST_TIMEOUT_MS,
  );

  const status = readStatus(payload);
  if (!status) {
    throw new SatSaleApiError(
      'invalid_response',
      'The payment server sent an invalid status',
    );
  }
  return status;
}

/**
 * Accepts what a tired customer might type (lower case, display hyphens,
 * spaces, and the usual Crockford lookalikes) and returns the canonical
 * 20-character form, or '' when the value cannot be a license.
 */
export function normalizeLicense(value: string): string {
  if (typeof value !== 'string') return '';

  const license = value
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');

  if (license.length !== LICENSE_LENGTH) return '';
  for (let index = 0; index < license.length; index += 1) {
    if (!LICENSE_ALPHABET.includes(license[index])) return '';
  }
  return license;
}
