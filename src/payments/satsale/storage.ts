import { getStore, isDatabaseReady, saveStore } from '../../db/tinybase';
import type { CryptoInvoice } from '../PaymentContext';

/**
 * TinyBase values rather than tables: finance backups and imports replace
 * tables wholesale, so the license and the pending invoice must live outside
 * them to survive a restore.
 */
const LICENSE_KEY = 'satsaleLicense';
const PENDING_INVOICE_KEY = 'satsalePendingInvoice';

function isInvoice(value: unknown): value is CryptoInvoice {
  if (typeof value !== 'object' || value === null) return false;
  const invoice = value as Partial<CryptoInvoice>;
  return (
    typeof invoice.license === 'string' &&
    typeof invoice.licenseFormatted === 'string' &&
    typeof invoice.address === 'string' &&
    typeof invoice.btcValue === 'number' &&
    typeof invoice.uri === 'string' &&
    typeof invoice.expiresAt === 'string'
  );
}

async function persist(): Promise<void> {
  try {
    await saveStore();
  } catch (error) {
    // The value is already in memory; persistence is best-effort, like the
    // premium cache.
    console.warn('[satsale] Failed to persist purchase state', error);
  }
}

export async function getStoredLicense(): Promise<string | null> {
  if (!isDatabaseReady()) return null;
  const license = getStore().getValue(LICENSE_KEY);
  return typeof license === 'string' && license ? license : null;
}

export async function storeLicense(license: string): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().setValue(LICENSE_KEY, license);
  await persist();
}

export async function getPendingInvoice(): Promise<CryptoInvoice | null> {
  if (!isDatabaseReady()) return null;

  const raw = getStore().getValue(PENDING_INVOICE_KEY);
  if (typeof raw !== 'string') return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isInvoice(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function storePendingInvoice(
  invoice: CryptoInvoice,
): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().setValue(PENDING_INVOICE_KEY, JSON.stringify(invoice));
  await persist();
}

export async function clearPendingInvoice(): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().delValue(PENDING_INVOICE_KEY);
  await persist();
}

/** Forgets both the license and its invoice (expired, revoked, or unknown). */
export async function clearPurchaseState(): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().delValue(LICENSE_KEY);
  getStore().delValue(PENDING_INVOICE_KEY);
  await persist();
}
