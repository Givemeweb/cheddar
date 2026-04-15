import { View, Text, Pressable } from "react-native";
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

export const renderIcon = (iconName: string, size: number = 18, color: string = '#1A1A1A') => {
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
}

export function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const formatted = `€${absAmount.toFixed(2)}`;
  return amount < 0 ? `-${formatted}` : formatted;
}

export function TransactionItem({ transaction }: TransactionItemProps) {
  const isTransfer = transaction.type === 'transfer';
  const isExpense = transaction.amount < 0;

  return (
    <Pressable className="flex-row items-center py-3 px-4 bg-white border-b border-gray-100">
      {/* Left side - Category and Note/Account */}
      <View className="flex-1 flex-col">
        <View className="flex-row items-center">
          <View className="mr-2">
            {isTransfer ? (
              <ArrowRightLeft size={18} color="#6B7280" />
            ) : transaction.category?.icon ? (
              renderIcon(
                transaction.category.icon,
                18,
                transaction.category.type === 'income' ? '#10B981' : '#EF4444'
              )
            ) : null}
          </View>
          <Text className={`text-base font-medium ${isTransfer ? 'text-gray-500' : 'text-cheddar-dark'}`}>
            {isTransfer ? 'Transfer' : transaction.category?.name}
          </Text>
        </View>
        <View className="flex-row items-center mt-1">
          <Text className="text-sm text-cheddar-gray">
            {transaction.note || "No note"} · {transaction.account.name}
            {isTransfer && transaction.toAccount && ` → ${transaction.toAccount.name}`}
          </Text>
        </View>
      </View>

      {/* Right side - Income and Expense columns */}
      <View className="flex-row items-center">
        {isTransfer ? (
          <>
            <View className="w-20 items-end">
              <Text className="text-gray-400">{formatCurrency(Math.abs(transaction.amount))}</Text>
            </View>
            <View className="w-20 items-end">
              <Text className="text-gray-400">{formatCurrency(Math.abs(transaction.amount))}</Text>
            </View>
          </>
        ) : (
          <>
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
          </>
        )}
      </View>
    </Pressable>
  );
}
