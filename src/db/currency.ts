import { getStore, saveStore, isDatabaseReady } from './tinybase';
import { convertWithRates, getLatestRates, RatesCache } from '../services/exchangeRates';

const CURRENCY_KEY = 'mainCurrency';

// Default currency code is Euro
export const DEFAULT_CURRENCY_CODE = 'EUR';

// Available currencies with their symbols
export const CURRENCIES = [
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'CAD', symbol: '$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: '$', name: 'Australian Dollar' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'SGD', symbol: '$', name: 'Singapore Dollar' },
  { code: 'HKD', symbol: '$', name: 'Hong Kong Dollar' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
];

// Default symbol for display purposes
export const DEFAULT_CURRENCY_SYMBOL = '€';

// Helper to get symbol from code
export function getCurrencySymbol(code: string): string {
  const currency = CURRENCIES.find(c => c.code === code);
  return currency?.symbol || DEFAULT_CURRENCY_SYMBOL;
}

// Resolve a stored per-entity currency to a usable code.
// Null/empty/legacy rows mean "app default".
export function resolveAccountCurrency(code: string | null | undefined): string {
  return code && code.trim() ? code : DEFAULT_CURRENCY_CODE;
}

export async function getMainCurrencyCode(): Promise<string> {
  if (!isDatabaseReady()) return DEFAULT_CURRENCY_CODE;
  const store = getStore();
  const code = store.getValue(CURRENCY_KEY) as string | undefined;
  return code || DEFAULT_CURRENCY_CODE;
}

export async function setMainCurrencyCode(code: string): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.setValue(CURRENCY_KEY, code);
  await saveStore();
}

/** Read an account's own currency (defaults to the app default when unset). */
export async function getAccountCurrency(accountId: string): Promise<string> {
  if (!isDatabaseReady() || !accountId) return DEFAULT_CURRENCY_CODE;
  const store = getStore();
  const row = store.getRow('accounts', accountId);
  return resolveAccountCurrency(row?.currency as string | undefined);
}

/**
 * Set an account's currency and convert its stored balance from the old
 * currency to the new one at current rates, so switching an account between
 * currencies keeps its value meaningful.
 */
export async function setAccountCurrency(
  accountId: string,
  newCurrency: string,
): Promise<{ oldCurrency: string; oldBalance: number; newBalance: number } | null> {
  if (!isDatabaseReady() || !accountId) return null;
  const store = getStore();
  const row = store.getRow('accounts', accountId);
  if (!row) return null;

  const oldCurrency = resolveAccountCurrency(row.currency as string | undefined);
  const oldBalance = (row.balance as number) ?? 0;

  store.setCell('accounts', accountId, 'currency', newCurrency);

  if (oldCurrency !== newCurrency) {
    const newBalance = await convertAmountWithRates(oldBalance, oldCurrency, newCurrency);
    store.setCell('accounts', accountId, 'balance', newBalance);
  }

  await saveStore();
  return { oldCurrency, oldBalance, newBalance: (store.getCell('accounts', accountId, 'balance') as number) ?? 0 };
}

/** Convert using the live/cached rates, falling back to a no-op when offline. */
export async function convertAmountWithRates(
  amount: number,
  from: string,
  to: string,
): Promise<number> {
  if (!from || !to || from === to) return amount;
  const cache = await getLatestRates();
  if (!cache) return amount;
  return convertWithRates(amount, from, to, cache.rates, cache.base);
}

/**
 * Convert a batch of (amount, currency) pairs into a target currency.
 * Fetches rates once instead of once per item.
 */
export async function convertToMainCurrencyBatch(
  items: Array<{ amount: number; currency: string }>,
  target: string,
  rates?: RatesCache | null,
): Promise<number[]> {
  const cache = rates ?? (await getLatestRates());
  if (!cache) return items.map(i => i.amount);
  return items.map(i =>
    convertWithRates(i.amount, i.currency, target, cache.rates, cache.base),
  );
}
