import { View, Text } from "react-native";
import { GroupedTransactions, TransactionItem } from "./TransactionItem";
import { useTheme } from "./ThemeProvider";

interface TransactionGroupProps {
  group: GroupedTransactions;
  isDark?: boolean;
}

function formatCurrencyShort(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

export function TransactionGroup({ group, isDark = false }: TransactionGroupProps) {
  const { currencySymbol } = useTheme();

  return (
    <View className="mb-2">
      {/* Group Header */}
      <View
        className={`flex-row items-center px-4 py-3 border-b border-t ${isDark ? "bg-[#26282D] border-gray-700" : "bg-gray-50 border-gray-200"}`}
      >
        <View className="flex-1">
          <Text
            className={`font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
          >
            {group.dateLabel}
          </Text>
        </View>
        <View className="flex-row gap-6">
          <Text className="text-cheddar-income mr-4">
            {formatCurrencyShort(group.totalIncome, currencySymbol)}
          </Text>
          <Text className="text-cheddar-expense">
            {formatCurrencyShort(group.totalExpense, currencySymbol)}
          </Text>
        </View>
      </View>

      {/* Transaction Items */}
      {group.transactions.map((transaction) => (
        <TransactionItem
          key={transaction.id}
          transaction={transaction}
          isDark={isDark}
        />
      ))}
    </View>
  );
}
