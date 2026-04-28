import { View, Text } from "react-native";
import { GroupedTransactions, TransactionItem } from "./TransactionItem";
import { useTheme } from "./ThemeProvider";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../utils/formatNumber";

interface TransactionGroupProps {
  group: GroupedTransactions;
  isDark?: boolean;
}

function formatCurrencyShort(amount: number, currency: string): string {
  return `${currency} ${formatNumber(amount)}`;
}

function getDayBadgeStyle(dayOfWeek: number, isDark: boolean) {
  // Sunday = 0, Monday = 1, ..., Saturday = 6
  if (dayOfWeek === 0) {
    // Sunday - red
    return {
      bg: isDark ? "bg-red-900/30" : "bg-red-100",
      text: isDark ? "text-red-400" : "text-red-600",
    };
  } else if (dayOfWeek === 6) {
    // Saturday - blue
    return {
      bg: isDark ? "bg-blue-900/30" : "bg-blue-100",
      text: isDark ? "text-blue-400" : "text-blue-600",
    };
  } else {
    // Monday-Friday - gray
    return {
      bg: isDark ? "bg-gray-700" : "bg-gray-200",
      text: isDark ? "text-gray-400" : "text-gray-600",
    };
  }
}

export function TransactionGroup({ group, isDark = false }: TransactionGroupProps) {
  const { currencySymbol } = useTheme();
  const { t } = useTranslation();

  const dayOfWeek = group.date.getDay();
  const day = group.date.getDate();
  const month = String(group.date.getMonth() + 1).padStart(2, "0");
  const year = group.date.getFullYear();

  const days = [
    t('days.short.sun'),
    t('days.short.mon'),
    t('days.short.tue'),
    t('days.short.wed'),
    t('days.short.thu'),
    t('days.short.fri'),
    t('days.short.sat')
  ];
  const dayName = days[dayOfWeek];
  const badgeStyle = getDayBadgeStyle(dayOfWeek, isDark);

  return (
    <View className="mb-2">
      {/* Group Header */}
      <View
        className={`flex-row items-center px-4 py-3 border-b border-t ${isDark ? "bg-[#26282D] border-gray-700" : "bg-gray-50 border-gray-200"}`}
      >
        <View className="flex-1 flex-row items-center">
          <Text
            className={`font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
          >
            {day}{" "}
          </Text>
          <View className={`flex-row items-center justify-center px-2 py-0.5 rounded-md ${badgeStyle.bg}`}>
            <Text className={`text-xs font-semibold ${badgeStyle.text}`}>
              {dayName}
            </Text>
          </View>
          <Text
            className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
          >
            {" "}{month}.{year}
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
