import { View, Text, Pressable } from "react-native";

export type TransactionWithDetails = {
  id: number;
  categoryId: number;
  accountId: number;
  note: string | null;
  amount: number;
  date: Date;
  category: { name: string; icon: string; type: "income" | "expense" };
  account: { name: string; type: string };
};

export type GroupedTransactions = {
  date: Date;
  dateLabel: string;
  transactions: TransactionWithDetails[];
  totalIncome: number;
  totalExpense: number;
};

interface TransactionItemProps {
  transaction: TransactionWithDetails;
}

export function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const formatted = `€${absAmount.toFixed(2)}`;
  return amount < 0 ? `-${formatted}` : formatted;
}

export function TransactionItem({ transaction }: TransactionItemProps) {
  const isExpense = transaction.amount < 0;

  return (
    <Pressable className="flex-row items-center py-3 px-4 bg-white border-b border-gray-100">
      {/* Left side - Category and Note/Account */}
      <View className="flex-1 flex-col">
        <View className="flex-row items-center">
          <Text className="text-lg mr-2">{transaction.category.icon}</Text>
          <Text className="text-base font-medium text-cheddar-dark">
            {transaction.category.name}
          </Text>
        </View>
        <View className="flex-row items-center mt-1">
          <Text className="text-sm text-cheddar-gray">
            {transaction.note || "No note"} · {transaction.account.name}
          </Text>
        </View>
      </View>

      {/* Right side - Income and Expense columns */}
      <View className="flex-row items-center">
        {/* Income column */}
        <View className="w-20 items-end">
          {!isExpense ? (
            <Text className="text-cheddar-income font-medium">
              {formatCurrency(transaction.amount)}
            </Text>
          ) : (
            <Text className="text-cheddar-gray">€0.00</Text>
          )}
        </View>
        {/* Expense column */}
        <View className="w-20 items-end">
          {isExpense ? (
            <Text className="text-cheddar-expense font-medium">
              {formatCurrency(transaction.amount)}
            </Text>
          ) : (
            <Text className="text-cheddar-gray">€0.00</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
