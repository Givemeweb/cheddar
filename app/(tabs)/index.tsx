import { useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, Search } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  getTransactions,
} from "../../src/db/storage";
import { TransactionGroup } from "../../src/components/TransactionGroup";
import {
  GroupedTransactions,
  TransactionWithDetails,
} from "../../src/components/TransactionItem";
import { FAB } from "../../src/components/FAB";
import { useTheme } from "../../src/components/ThemeProvider";

export default function TransactionsScreen() {
  const [groupedTransactions, setGroupedTransactions] = useState<
    GroupedTransactions[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const { isDark, currencySymbol } = useTheme();
  const { t } = useTranslation();

  const monthYear = currentDate.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  const goToPreviousMonth = () => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() - 1);
      return newDate;
    });
  };

  const goToNextMonth = () => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + 1);
      return newDate;
    });
  };

  async function fetchTransactions() {
    try {
      const allTransactions = await getTransactions();

      // Filter transactions by selected month
      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1,
      );
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      const filteredTransactions = allTransactions.filter((tx) => {
        const txDate = new Date(tx.date);
        return txDate >= startOfMonth && txDate <= endOfMonth;
      });

      const txWithDetails: TransactionWithDetails[] = filteredTransactions.map(
        (tx) => {
          return {
            id: tx.id,
            type: tx.type || "expense",
            categoryId: tx.categoryId,
            accountId: tx.accountId,
            toAccountId: tx.toAccountId,
            note: tx.note,
            description: tx.description,
            amount: tx.amount,
            date: new Date(tx.date),
            category: tx.categoryName
              ? {
                  name: tx.categoryName,
                  icon: tx.categoryIcon || "",
                  type: tx.categoryType as "income" | "expense",
                }
              : null,
            account: { name: tx.accountName, description: null },
            toAccount: tx.toAccountName
              ? { name: tx.toAccountName, description: null }
              : null,
          };
        },
      );

      // Group by date
      const grouped = new Map<string, TransactionWithDetails[]>();
      txWithDetails.forEach((tx) => {
        const dateKey = tx.date.toISOString().split("T")[0];
        if (!grouped.has(dateKey)) {
          grouped.set(dateKey, []);
        }
        grouped.get(dateKey)!.push(tx);
      });

      // Convert to array and calculate totals
      const result: GroupedTransactions[] = [];
      grouped.forEach((txs, dateKey) => {
        const date = new Date(dateKey);
        const sortedTxs = txs.sort(
          (a, b) => b.date.getTime() - a.date.getTime(),
        );
        const totalIncome = sortedTxs
          .filter((t) => t.type === "income")
          .reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = Math.abs(
          sortedTxs
            .filter((t) => t.type === "expense")
            .reduce((sum, t) => sum + t.amount, 0),
        );

        result.push({
          date,
          dateLabel: "",
          transactions: sortedTxs,
          totalIncome,
          totalExpense,
          totalTransfer: 0,
        });
      });

      // Sort by date descending
      result.sort((a, b) => b.date.getTime() - a.date.getTime());
      setGroupedTransactions(result);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchTransactions();
    }, [currentDate]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  // Calculate totals
  const totalIncome = groupedTransactions.reduce(
    (sum, group) => sum + group.totalIncome,
    0,
  );
  const totalExpense = groupedTransactions.reduce(
    (sum, group) => sum + group.totalExpense,
    0,
  );
  const total = totalIncome - totalExpense;

  if (loading) {
    return (
      <View className={`flex-1 items-center justify-center ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <ActivityIndicator size="large" color="#FFB800" />
      </View>
    );
  }

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"}`}
      edges={isLargeScreen ? ["top", "right", "bottom"] : undefined}
    >
      {/* Month Navigation Bar */}
      <View
        className={`flex-row items-center justify-between px-4 py-3 ${isDark ? "bg-[#26282D] border-gray-700" : "bg-white border-gray-200"} border-b`}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={goToPreviousMonth}
            className="p-2"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
          </Pressable>
          <Text
            className={`text-lg font-semibold ${isDark ? "text-white" : "text-cheddar-dark"}`}
          >
            {monthYear}
          </Text>
          <View className="flex-row items-center">
            <Pressable
              onPress={goToNextMonth}
              className="p-2"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ChevronRight size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
            </Pressable>
          </View>
        </View>
        <Pressable
          className="p-2 ml-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Search size={22} color={isDark ? "#9CA3AF" : "#6B7280"} />
        </Pressable>
      </View>

      {/* Totals Bar */}
      <View
        className={`flex-row px-4 py-3 ${isDark ? "bg-[#26282D] border-gray-700" : "bg-white border-gray-200"} border-b`}
      >
        <View className="flex-1 items-center">
          <Text className="text-cheddar-income font-semibold text-lg">
            {currencySymbol} {totalIncome.toFixed(2)}
          </Text>
          <Text
            className={`${isDark ? "text-gray-400" : "text-gray-500"} text-sm`}
          >
            {t("transactions.income")}
          </Text>
        </View>
        <View className="flex-1 items-center">
          <Text className="text-cheddar-expense font-semibold text-lg">
            {currencySymbol} {totalExpense.toFixed(2)}
          </Text>
          <Text
            className={`${isDark ? "text-gray-400" : "text-gray-500"} text-sm`}
          >
            {t("transactions.expenses")}
          </Text>
        </View>
        <View className="flex-1 items-center">
          <Text
            className={`font-semibold text-lg ${total >= 0 ? "text-cheddar-income" : "text-cheddar-expense"}`}
          >
            {currencySymbol} {total.toFixed(2)}
          </Text>
          <Text
            className={`${isDark ? "text-gray-400" : "text-gray-500"} text-sm`}
          >
            {t("transactions.total")}
          </Text>
        </View>
      </View>
      <FlatList
        data={groupedTransactions}
        keyExtractor={(item) => item.dateLabel}
        renderItem={({ item }) => (
          <TransactionGroup group={item} isDark={isDark} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#FFB800"]}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text
              className={`text-lg ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
            >
              {t("transactions.noTransactions")}
            </Text>
          </View>
        }
      />
      <FAB isDark={isDark} />
    </SafeAreaView>
  );
}
