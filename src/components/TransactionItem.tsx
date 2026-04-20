import { View, Text, Pressable } from "react-native";
import { useRouter } from 'expo-router';
import {
  TrendingUp,
  Gift,
  Briefcase,
  Wallet,
  PiggyBank,
  Utensils,
  Car,
  ShoppingCart,
  Film,
  Receipt,
  HeartPulse,
  Laptop,
  ArrowRightLeft,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';

// Map icon names to Lucide components
const iconMap: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  'trending-up': TrendingUp,
  'gift': Gift,
  'briefcase': Briefcase,
  'wallet': Wallet,
  'piggy-bank': PiggyBank,
  'utensils': Utensils,
  'car': Car,
  'shopping-cart': ShoppingCart,
  'film': Film,
  'receipt': Receipt,
  'heart-pulse': HeartPulse,
  'laptop': Laptop,
};

export const renderIcon = (
  iconName: string,
  size: number = 18,
  color: string = "#212226",
  showIcons: boolean = true,
) => {
  if (!showIcons) return null;
  const IconComponent = iconMap[iconName];
  if (IconComponent) {
    return <IconComponent size={size} color={color} />;
  }
  return null;
};

export type TransactionWithDetails = {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  subcategoryId?: string | null;
  subcategoryName?: string | null;
  accountId: string;
  toAccountId?: string | null;
  note: string | null;
  description?: string | null;
  amount: number;
  date: Date;
  category?: { name: string; icon: string; type: "income" | "expense" } | null;
  account: { name: string; description: string | null };
  toAccount?: { name: string; description: string | null } | null;
};

export type GroupedTransactions = {
  date: Date;
  dateLabel: string;
  transactions: TransactionWithDetails[];
  totalIncome: number;
  totalExpense: number;
  totalTransfer: number;
};

interface TransactionItemProps {
  transaction: TransactionWithDetails;
  isDark?: boolean;
}

export function formatCurrency(amount: number, currency: string = '€'): string {
  const absAmount = Math.abs(amount);
  const formatted = `${currency} ${absAmount.toFixed(2)}`;
  return formatted;
}

export function TransactionItem({ transaction, isDark = false }: TransactionItemProps) {
  const { t } = useTranslation();
  const { showIcons, currencySymbol, subcategoriesEnabled } = useTheme();
  const router = useRouter();
  const isTransfer = transaction.type === 'transfer';
  const isExpense = transaction.amount < 0;

  const handlePress = () => {
    router.push(`/add-transaction?transactionId=${transaction.id}` as never);
  };

  return (
    <Pressable
      className={`flex-row items-center py-3 px-4 border-b ${isDark ? "bg-[#26282D] border-gray-800" : "bg-white border-gray-100"}`}
      onPress={handlePress}
    >
      {/* Column 1 - Category */}
      <View className="w-[20%] flex-row items-center mr-4">
        {showIcons && (
          <View className="mr-2">
            {isTransfer ? (
              <ArrowRightLeft size={18} color="#6B7280" />
            ) : transaction.category?.icon ? (
              renderIcon(
                transaction.category.icon,
                18,
                transaction.category.type === "income" ? "#10B981" : "#EF4444",
                showIcons,
              )
            ) : null}
          </View>
        )}
        <View className="flex-col flex-1">
          <Text
            className={`text-base font-medium ${isTransfer ? "text-gray-500" : isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {isTransfer
              ? t("transactions.type.transfer")
              : transaction.category?.name}
          </Text>
          {subcategoriesEnabled && transaction.subcategoryName && (
            <Text
              className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {transaction.subcategoryName}
            </Text>
          )}
        </View>
      </View>

      {/* Column 2 - Note and Account */}
      <View className="flex-1 flex-col items-start ml-2">
        {transaction.note && (
          <Text
            className={`text-sm ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
          >
            {transaction.note}
          </Text>
        )}
        <Text
          className={`text-sm ${transaction.note ? "mt-0.5" : ""} ${isDark ? "text-gray-500" : "text-gray-400"}`}
        >
          {transaction.account.name}
          {isTransfer &&
            transaction.toAccount &&
            ` → ${transaction.toAccount.name}`}
        </Text>
      </View>

      {/* Column 3 - Amount */}
      <View className="flex-1 flex-row items-center justify-end">
        {isTransfer ? (
          <>
            <View className="flex-1 items-end">
              <Text className="text-gray-400">
                {formatCurrency(Math.abs(transaction.amount), currencySymbol)}
              </Text>
            </View>
            <View className="flex-1 items-end">
              <Text className="text-gray-400">
                {formatCurrency(Math.abs(transaction.amount), currencySymbol)}
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* Income column */}
            <View className="flex-1 items-end">
              <Text
                className={`${isExpense ? "text-cheddar-expense" : "text-cheddar-income"} font-medium`}
              >
                {formatCurrency(transaction.amount, currencySymbol)}
              </Text>
            </View>
          </>
        )}
      </View>
    </Pressable>
  );
}
