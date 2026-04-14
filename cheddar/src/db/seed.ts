import { db, categories, accounts, transactions } from './index';

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

export async function seedDatabase() {
    // Check if already seeded
    const existingCategories = await db.select().from(categories);
    if (existingCategories.length > 0) {
        return;
    }

    // Insert categories
    await db.insert(categories).values(defaultCategories);

    // Insert accounts
    await db.insert(accounts).values(defaultAccounts);

    // Generate mock transactions for current month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const allCategories = await db.select().from(categories);
    const allAccounts = await db.select().from(accounts);

    const expenseCategories = allCategories.filter(c => c.type === 'expense');
    const incomeCategories = allCategories.filter(c => c.type === 'income');

    const mockTransactions = [];
    const notes = ['Coffee', 'Groceries', 'Metro ticket', 'Netflix', 'Utilities', 'Lunch', 'Gym', 'Ice cream', 'Parking', 'Medicine'];

    for (let day = 1; day <= daysInMonth; day++) {
        // Add 1-3 random transactions per day
        const numTransactions = Math.floor(Math.random() * 3) + 1;

        for (let i = 0; i < numTransactions; i++) {
            const isExpense = Math.random() > 0.2; // 80% chance of expense
            const category = isExpense
                ? expenseCategories[Math.floor(Math.random() * expenseCategories.length)]
                : incomeCategories[Math.floor(Math.random() * incomeCategories.length)];
            const account = allAccounts[Math.floor(Math.random() * allAccounts.length)];

            const baseAmount = isExpense ? Math.random() * 50 + 5 : Math.random() * 500 + 100;
            const amount = isExpense ? -baseAmount : baseAmount;

            mockTransactions.push({
                categoryId: category.id,
                accountId: account.id,
                note: isExpense ? notes[Math.floor(Math.random() * notes.length)] : 'Payment',
                amount: parseFloat(amount.toFixed(2)),
                date: new Date(currentYear, currentMonth, day, Math.floor(Math.random() * 12) + 8),
            });
        }
    }

    // Insert transactions in batches
    for (const tx of mockTransactions) {
        await db.insert(transactions).values(tx);
    }
}