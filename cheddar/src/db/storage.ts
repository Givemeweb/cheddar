import AsyncStorage from '@react-native-async-storage/async-storage';
import { Category, Account, Transaction } from './schema';

const CATEGORIES_KEY = 'cheddar_categories';
const ACCOUNTS_KEY = 'cheddar_accounts';
const TRANSACTIONS_KEY = 'cheddar_transactions';

// Default data
const defaultCategories: Omit<Category, 'id'>[] = [
    // Expense categories
    { name: 'Food', icon: '🍽️', type: 'expense' },
    { name: 'Transport', icon: '🚗', type: 'expense' },
    { name: 'Shopping', icon: '🛒', type: 'expense' },
    { name: 'Entertainment', icon: '🎬', type: 'expense' },
    { name: 'Bills', icon: '📄', type: 'expense' },
    { name: 'Health', icon: '💊', type: 'expense' },
    // Income categories
    { name: 'Salary', icon: '💼', type: 'income' },
    { name: 'Freelance', icon: '💻', type: 'income' },
    { name: 'Investments', icon: '📈', type: 'income' },
    { name: 'Gift', icon: '🎁', type: 'income' },
];

const defaultAccounts: Omit<Account, 'id'>[] = [
    { name: 'Checking', type: 'checking', balance: 2500.00 },
    { name: 'Savings', type: 'savings', balance: 10000.00 },
    { name: 'Credit Card', type: 'credit', balance: -450.00 },
];

// Storage functions
export async function getCategories(): Promise<Category[]> {
    try {
        const data = await AsyncStorage.getItem(CATEGORIES_KEY);
        if (data) return JSON.parse(data);

        // Seed default categories
        const categories: Category[] = defaultCategories.map((cat, i) => ({
            id: i + 1,
            ...cat,
        }));
        await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
        return categories;
    } catch (e) {
        console.error('Error getting categories:', e);
        return [];
    }
}

export async function getAccounts(): Promise<Account[]> {
    try {
        const data = await AsyncStorage.getItem(ACCOUNTS_KEY);
        if (data) return JSON.parse(data);

        // Seed default accounts
        const accounts: Account[] = defaultAccounts.map((acc, i) => ({
            id: i + 1,
            ...acc,
        }));
        await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
        return accounts;
    } catch (e) {
        console.error('Error getting accounts:', e);
        return [];
    }
}

export async function getTransactions(): Promise<Transaction[]> {
    try {
        const data = await AsyncStorage.getItem(TRANSACTIONS_KEY);
        if (data) return JSON.parse(data);

        // Seed mock transactions for current month
        const categories = await getCategories();
        const accounts = await getAccounts();

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        const expenseCategories = categories.filter(c => c.type === 'expense');
        const incomeCategories = categories.filter(c => c.type === 'income');
        const notes = ['Coffee', 'Groceries', 'Metro ticket', 'Netflix', 'Utilities', 'Lunch', 'Gym', 'Ice cream', 'Parking', 'Medicine'];

        const transactions: Transaction[] = [];
        let id = 1;

        for (let day = 1; day <= daysInMonth; day++) {
            const numTransactions = Math.floor(Math.random() * 3) + 1;

            for (let i = 0; i < numTransactions; i++) {
                const isExpense = Math.random() > 0.2;
                const category = isExpense
                    ? expenseCategories[Math.floor(Math.random() * expenseCategories.length)]
                    : incomeCategories[Math.floor(Math.random() * incomeCategories.length)];
                const account = accounts[Math.floor(Math.random() * accounts.length)];

                const baseAmount = isExpense ? Math.random() * 50 + 5 : Math.random() * 500 + 100;
                const amount = isExpense ? -parseFloat(baseAmount.toFixed(2)) : parseFloat(baseAmount.toFixed(2));

                transactions.push({
                    id: id++,
                    categoryId: category.id,
                    accountId: account.id,
                    note: isExpense ? notes[Math.floor(Math.random() * notes.length)] : 'Payment',
                    amount,
                    date: new Date(currentYear, currentMonth, day, Math.floor(Math.random() * 12) + 8),
                });
            }
        }

        await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
        return transactions;
    } catch (e) {
        console.error('Error getting transactions:', e);
        return [];
    }
}

export async function clearAllData(): Promise<void> {
    await AsyncStorage.multiRemove([CATEGORIES_KEY, ACCOUNTS_KEY, TRANSACTIONS_KEY]);
}