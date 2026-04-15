import { useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getCategories,
  getAccounts,
  getTransactions,
} from "../../src/db/storage";
import { TransactionGroup } from "../../src/components/TransactionGroup";
import {
  GroupedTransactions,
  TransactionWithDetails,
} from "../../src/components/TransactionItem";
import { FAB } from "../../src/components/FAB";

function formatDateForGroup(date: Date): string {
  const day = date.getDate();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = days[date.getDay()];
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day} (${dayName}) ${month}.${year}`;
}

export default function TransactionsScreen() {
  const [groupedTransactions, setGroupedTransactions] = useState<
    GroupedTransactions[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchTransactions() {
    try {
      const allCategories = await getCategories();
      const allAccounts = await getAccounts();
      const allTransactions = await getTransactions();

      const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
      const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

      const txWithDetails: TransactionWithDetails[] = allTransactions.map(
        (tx) => {
          const category = tx.categoryId ? categoryMap.get(tx.categoryId) : null;
          const account = accountMap.get(tx.accountId)!;
          const toAccount = tx.toAccountId ? accountMap.get(tx.toAccountId) : null;
          return {
            id: tx.id,
            type: tx.type || 'expense',
            categoryId: tx.categoryId,
            accountId: tx.accountId,
            toAccountId: tx.toAccountId,
            note: tx.note,
            description: tx.description,
            amount: tx.amount,
            date: new Date(tx.date),
            category: category ? {
              name: category.name,
              icon: category.icon,
              type: category.type as "income" | "expense",
            } : null,
            account: { name: account.name, type: account.type },
            toAccount: toAccount ? { name: toAccount.name, type: toAccount.type } : null,
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
          .filter((t) => t.type === 'income')
          .reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = Math.abs(
          sortedTxs
            .filter((t) => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0),
        );

        result.push({
          date,
          dateLabel: formatDateForGroup(date),
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
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cheddar-light">
        <ActivityIndicator size="large" color="#FFB800" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cheddar-light">
      <FlatList
        data={groupedTransactions}
        keyExtractor={(item) => item.dateLabel}
        renderItem={({ item }) => <TransactionGroup group={item} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#FFB800"]}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-cheddar-gray text-lg">
              No transactions yet
            </Text>
          </View>
        }
      />
      <FAB />
    </SafeAreaView>
  );
}
