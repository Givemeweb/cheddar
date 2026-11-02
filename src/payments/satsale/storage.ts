import { getStore, isDatabaseReady, saveStore } from '../../db/tinybase';
import type { CryptoInvoice } from '../PaymentContext';
import { parseInvoice } from './api';

/**
 * TinyBase values rather than tables: finance backups and imports replace
 * tables wholesale, so the license and the pending invoice must live outside
 * them to survive a restore.
 */
const LICENSE_KEY = 'satsaleLicense';
const PENDING_INVOICE_KEY = 'satsalePendingInvoice';

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

  const store = getStore();
  // Reconciliation runs on every foreground; skip the whole-store save when
  // the value has not changed.
  if (store.getValue(LICENSE_KEY) === license) return;

  store.setValue(LICENSE_KEY, license);
  await persist();
}

export async function getPendingInvoice(): Promise<CryptoInvoice | null> {
  if (!isDatabaseReady()) return null;

  const raw = getStore().getValue(PENDING_INVOICE_KEY);
  if (typeof raw !== 'string') return null;

  try {
    return parseInvoice(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function storePendingInvoice(
  invoice: CryptoInvoice,
): Promise<void> {
  if (!isDatabaseReady()) return;

  const raw = JSON.stringify(invoice);
  const store = getStore();
  if (store.getValue(PENDING_INVOICE_KEY) === raw) return;

  store.setValue(PENDING_INVOICE_KEY, raw);
  await persist();
}

export async function clearPendingInvoice(): Promise<void> {
  if (!isDatabaseReady()) return;

  const store = getStore();
  if (store.getValue(PENDING_INVOICE_KEY) === undefined) return;

  store.delValue(PENDING_INVOICE_KEY);
  await persist();
}

/** Forgets both the license and its invoice (expired, revoked, or unknown). */
export async function clearPurchaseState(): Promise<void> {
  if (!isDatabaseReady()) return;

  const store = getStore();
  if (
    store.getValue(LICENSE_KEY) === undefined &&
    store.getValue(PENDING_INVOICE_KEY) === undefined
  ) {
    return;
  }

  store.delValue(LICENSE_KEY);
  store.delValue(PENDING_INVOICE_KEY);
  await persist();
}
