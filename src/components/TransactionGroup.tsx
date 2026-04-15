import { View, Text } from "react-native";
import { GroupedTransactions, TransactionItem } from "./TransactionItem";

interface TransactionGroupProps {
  group: GroupedTransactions;
  isDark?: boolean;
}

function formatCurrencyShort(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

export function TransactionGroup({ group, isDark = false }: TransactionGroupProps) {
  return (
    <View className="mb-2">
      {/* Group Header */}
      <View className={`flex-row items-center px-4 py-3 ${isDark ? 'bg-[#26282D]' : 'bg-gray-50'}`}>
        <View className="flex-1">
          <Text className={`font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
            {group.dateLabel}
          </Text>
        </View>
        <View className="flex-row">
          <Text className="text-cheddar-income mr-4">
            {formatCurrencyShort(group.totalIncome)}
          </Text>
          <Text className="text-cheddar-expense">
            {formatCurrencyShort(group.totalExpense)}
          </Text>
        </View>
      </View>

      {/* Transaction Items */}
      {group.transactions.map((transaction) => (
        <TransactionItem key={transaction.id} transaction={transaction} isDark={isDark} />
      ))}
    </View>
  );
}
