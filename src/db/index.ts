// TinyBase-based database implementation
// Works on both native(iOS/Android) and web platforms

export {
  initDatabase,
  getStore,
  isDatabaseReady,
  saveStore,
  generateId,
  getPersister,
  type Category,
  type Account,
  type Transaction,
  type TablesSchema,
} from './tinybase';

export {
  getCategories,
  getCategoryById,
  getAccounts,
  getAccountById,
  updateAccountBalance,
  getTransactions,
  addTransaction,
  deleteTransaction,
  initializeDatabase,
  clearAllData,
  consumeReminderPrompt,
  requestReminderPrompt,
  shouldOfferReminderPrompt,
  markReminderPromptSeen,
} from './storage';

export { getShowIcons, setShowIcons } from './icons';

export {
  MERCURY_ACCOUNT_CURRENCY,
  markConnectionNeedsReauthentication,
  upsertMercuryConnection,
  getMercuryConnection,
  putMercuryLinkedAccount,
  getMercuryLinkedAccounts,
  putMercuryTransactionLink,
  getMercuryTransactionLinks,
  setMercuryCursor,
  getMercuryCursor,
  setSyncDebounceTimestamp,
  getSyncDebounceTimestamp,
  type MercuryConnection,
  type MercuryCursor,
  type MercuryLinkedAccount,
  type MercuryTokenStatus,
  type MercuryTransactionLink,
} from './mercury';

export {
  getSubcategoriesEnabled,
  setSubcategoriesEnabled,
  getSubcategories,
  getAllSubcategories,
  getSubcategoryById,
  addSubcategory,
  updateSubcategory,
  deleteSubcategory,
  deleteSubcategoriesByCategory,
  type Subcategory,
} from './subcategories';

export {
  getMainCurrencyCode,
  setMainCurrencyCode,
  getTotalAssetsCurrencyCode,
  setTotalAssetsCurrencyCode,
  getCurrencySymbol,
  getAccountCurrency,
  setAccountCurrency,
  resolveAccountCurrency,
  convertAmountWithRates,
  CURRENCIES,
  DEFAULT_CURRENCY_CODE,
  DEFAULT_CURRENCY_SYMBOL,
} from './currency';