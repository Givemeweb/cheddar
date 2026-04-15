// TinyBase-based database implementation
// Works on both native (iOS/Android) and web platforms

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
} from './storage';