import { getStore, saveStore, isDatabaseReady } from './tinybase';

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

// Get default symbol for display purposes
export const DEFAULT_CURRENCY_SYMBOL = '€';

// Helper to get symbol from code
export function getCurrencySymbol(code: string): string {
  const currency = CURRENCIES.find(c => c.code === code);
  return currency?.symbol || DEFAULT_CURRENCY_SYMBOL;
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