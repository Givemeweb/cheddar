import { getDb, isDatabaseReady, categories, accounts, transactions } from './index';
import { eq, desc } from 'drizzle-orm';
import type { Category, Account, Transaction } from './schema';

// Re-export types
export type { Category, Account, Transaction };

// Categories
export async function getCategories(): Promise<Category[]> {
    if (!isDatabaseReady()) return [];
    const db = getDb();
    return await db.select().from(categories);
}

export async function getCategoryById(id: number): Promise<Category | undefined> {
    if (!isDatabaseReady()) return undefined;
    const db = getDb();
    const result = await db.select().from(categories).where(eq(categories.id, id));
    return result[0];
}

// Accounts
export async function getAccounts(): Promise<Account[]> {
    if (!isDatabaseReady()) return [];
    const db = getDb();
    return await db.select().from(accounts);
}

export async function getAccountById(id: number): Promise<Account | undefined> {
    if (!isDatabaseReady()) return undefined;
    const db = getDb();
    const result = await db.select().from(accounts).where(eq(accounts.id, id));
    return result[0];
}

export async function updateAccountBalance(id: number, balance: number): Promise<void> {
    if (!isDatabaseReady()) return;
    const db = getDb();
    await db.update(accounts).set({ balance }).where(eq(accounts.id, id));
}

// Transactions
export async function getTransactions(): Promise<Transaction[]> {
    if (!isDatabaseReady()) return [];
    const db = getDb();
    return await db.select().from(transactions).orderBy(desc(transactions.date));
}

export async function addTransaction(tx: {
    categoryId: number;
    accountId: number;
    note: string | null;
    amount: number;
    date: Date;
}): Promise<Transaction> {
    if (!isDatabaseReady()) {
        throw new Error('Database not available on web platform');
    }
    const db = getDb();
    const result = await db.insert(transactions).values(tx).returning();
    return result[0];
}

export async function deleteTransaction(id: number): Promise<void> {
    if (!isDatabaseReady()) return;
    const db = getDb();
    await db.delete(transactions).where(eq(transactions.id, id));
}

// Database initialization
export async function initializeDatabase(): Promise<void> {
    if (!isDatabaseReady()) return;
    const db = getDb();
    const existingCategories = await db.select().from(categories);
    if (existingCategories.length > 0) return;

    // Seed default data
    await seedDefaults();
}

export async function clearAllData(): Promise<void> {
    if (!isDatabaseReady()) return;
    const db = getDb();
    await db.delete(transactions);
    await db.delete(categories);
    await db.delete(accounts);
}

// Default data
const defaultCategories = [
    // Expense categories
    { name: 'Food', icon: '🍽️', type: 'expense' as const },
    { name: 'Transport', icon: '🚗', type: 'expense' as const },
    { name: 'Shopping', icon: '🛒', type: 'expense' as const },
    { name: 'Entertainment', icon: '🎬', type: 'expense' as const },
    { name: 'Bills', icon: '📄', type: 'expense' as const },
    { name: 'Health', icon: '💊', type: 'expense' as const },
    // Income categories
    { name: 'Salary', icon: '💼', type: 'income' as const },
    { name: 'Freelance', icon: '💻', type: 'income' as const },
    { name: 'Investments', icon: '📈', type: 'income' as const },
    { name: 'Gift', icon: '🎁', type: 'income' as const },
];

const defaultAccounts = [
    { name: 'Checking', type: 'checking' as const, balance: 2500.00 },
    { name: 'Savings', type: 'savings' as const, balance: 10000.00 },
    { name: 'Credit Card', type: 'credit' as const, balance: -450.00 },
];

async function seedDefaults(): Promise<void> {
    if (!isDatabaseReady()) return;
    const db = getDb();
    // Insert categories
    await db.insert(categories).values(defaultCategories);

    // Insert accounts
    await db.insert(accounts).values(defaultAccounts);

    // Get inserted data for reference
    const allCategories = await db.select().from(categories);
    const allAccounts = await db.select().from(accounts);

    // Generate mock transactions for current month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const expenseCategories = allCategories.filter(c => c.type === 'expense');
    const incomeCategories = allCategories.filter(c => c.type === 'income');
    const notes = ['Coffee', 'Groceries', 'Metro ticket', 'Netflix', 'Utilities', 'Lunch', 'Gym', 'Ice cream', 'Parking', 'Medicine'];

    for (let day = 1; day <= daysInMonth; day++) {
        const numTransactions = Math.floor(Math.random() * 3) + 1;

        for (let i = 0; i < numTransactions; i++) {
            const isExpense = Math.random() > 0.2;
            const category = isExpense
                ? expenseCategories[Math.floor(Math.random() * expenseCategories.length)]
                : incomeCategories[Math.floor(Math.random() * incomeCategories.length)];
            const account = allAccounts[Math.floor(Math.random() * allAccounts.length)];

            const baseAmount = isExpense ? Math.random() * 50 + 5 : Math.random() * 500 + 100;
            const amount = isExpense ? -parseFloat(baseAmount.toFixed(2)) : parseFloat(baseAmount.toFixed(2));

            await db.insert(transactions).values({
                categoryId: category.id,
                accountId: account.id,
                note: isExpense ? notes[Math.floor(Math.random() * notes.length)] : 'Payment',
                amount,
                date: new Date(currentYear, currentMonth, day, Math.floor(Math.random() * 12) + 8),
            });
        }
    }
}