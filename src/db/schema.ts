import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
});

export const accounts = sqliteTable('accounts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    type: text('type', { enum: ['checking', 'savings', 'credit', 'cash', 'investment'] }).notNull(),
    balance: real('balance').notNull().default(0),
});

export const transactions = sqliteTable('transactions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: ['income', 'expense', 'transfer'] }).notNull().default('expense'),
    categoryId: integer('category_id').references(() => categories.id), // nullable for transfers
    accountId: integer('account_id').notNull().references(() => accounts.id),
    toAccountId: integer('to_account_id').references(() => accounts.id), // for transfers
    note: text('note'),
    description: text('description'),
    amount: real('amount').notNull(),
    date: integer('date', { mode: 'timestamp' }).notNull(),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;