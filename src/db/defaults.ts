import i18n from '../i18n';
import { DEFAULT_CURRENCY_CODE } from './currency';
import type { TablesSchema } from './tinybase';

/**
 * Fresh-install seed data, extracted from tinybase.ts so the reset flow
 * (clearAllData + reseed) can be exercised in Jest, where TinyBase itself
 * cannot be imported.
 */

export function getDefaultCategories(): TablesSchema['categories'] {
  return {
    '1': { name: i18n.t('defaultData.categories.food'), icon: 'utensils', type: 'expense' },
    '2': { name: i18n.t('defaultData.categories.transport'), icon: 'car', type: 'expense' },
    '3': { name: i18n.t('defaultData.categories.shopping'), icon: 'shopping-cart', type: 'expense' },
    '4': { name: i18n.t('defaultData.categories.entertainment'), icon: 'film', type: 'expense' },
    '5': { name: i18n.t('defaultData.categories.bills'), icon: 'receipt', type: 'expense' },
    '6': { name: i18n.t('defaultData.categories.health'), icon: 'heart-pulse', type: 'expense' },
    '7': { name: i18n.t('defaultData.categories.salary'), icon: 'briefcase', type: 'income' },
    '8': { name: i18n.t('defaultData.categories.freelance'), icon: 'laptop', type: 'income' },
    '9': { name: i18n.t('defaultData.categories.investments'), icon: 'trending-up', type: 'income' },
    '10': { name: i18n.t('defaultData.categories.gift'), icon: 'gift', type: 'income' },
  };
}

export function getDefaultAccounts(): TablesSchema['accounts'] {
  return {
    '1': { name: i18n.t('defaultData.accounts.checking'), icon: 'wallet', description: null, balance: 0.0, order: 0, currency: DEFAULT_CURRENCY_CODE, source: 'manual' },
    '2': { name: i18n.t('defaultData.accounts.savings'), icon: 'piggy-bank', description: null, balance: 0.0, order: 1, currency: DEFAULT_CURRENCY_CODE, source: 'manual' },
    '3': { name: i18n.t('defaultData.accounts.creditCard'), icon: 'credit-card', description: null, balance: 0.0, order: 2, currency: DEFAULT_CURRENCY_CODE, source: 'manual' },
  };
}

export function getDefaultTables(): Pick<TablesSchema, 'categories' | 'accounts' | 'transactions'> {
  return {
    categories: getDefaultCategories(),
    accounts: getDefaultAccounts(),
    transactions: {},
  };
}
