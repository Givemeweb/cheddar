import { useState, useCallback } from "react";
import { View, Text, ActivityIndicator, useWindowDimensions, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { getAccounts, getTransactions } from "../src/db/storage";
import { useTheme } from "../src/components/ThemeProvider";
import DotChart from "../src/components/DotChart";
import BarChart from "../src/components/BarChart";

type MonthlyData = {
  month: string;
  value: number;
};

type IncomeExpenseData = {
  month: string;
  income: number;
  expense: number;
};

export default function TotalStatsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [totalAssets, setTotalAssets] = useState(0);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [incomeExpenseData, setIncomeExpenseData] = useState<IncomeExpenseData[]>([]);
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const { isDark, currencySymbol } = useTheme();
  const { t } = useTranslation();

  useFocusEffect(
    useCallback(() => {
      async function fetchData() {
        try {
          const accounts = await getAccounts();
          const transactions = await getTransactions();

          const total = accounts.reduce((sum, acc) => sum + acc.balance, 0);
          setTotalAssets(total);

          // Calculate monthly asset growth for last 6 months
          const now = new Date();
          const months: MonthlyData[] = [];

          for (let i = 5; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = monthDate.toLocaleString('en', { month: 'short' });
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

            // Calculate balance at the end of this month
            // Start from current total and subtract transactions that happened after this month
            let monthBalance = total;

            for (const tx of transactions) {
              const txDate = new Date(tx.date);
              if (txDate > monthEnd) {
                // This transaction happened after this month, reverse its effect
                if (tx.type === 'transfer') {
                  // Transfers: negative amount means money left the account (subtract from total)
                  // Reversing: add the amount back
                  monthBalance -= tx.amount; // amount is negative for outgoing transfers
                } else {
                  // Income/expense: reverse by subtracting
                  monthBalance -= tx.amount;
                }
              }
            }

            months.push({
              month: monthName,
              value: monthBalance,
            });
          }

          setMonthlyData(months);

          // Calculate monthly income and expenses for last 6 months
          const incomeExpenseMonths: IncomeExpenseData[] = [];

          for (let i = 5; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
            const monthName = monthStart.toLocaleString('en', { month: 'short' });

            let monthIncome = 0;
            let monthExpense = 0;

            for (const tx of transactions) {
              const txDate = new Date(tx.date);
              if (txDate >= monthStart && txDate <= monthEnd) {
                if (tx.type === 'income') {
                  monthIncome += Math.abs(tx.amount);
                } else if (tx.type === 'expense') {
                  monthExpense += Math.abs(tx.amount);
                }
              }
            }

            incomeExpenseMonths.push({
              month: monthName,
              income: monthIncome,
              expense: monthExpense,
            });
          }

          setIncomeExpenseData(incomeExpenseMonths);
        } catch (error) {
          console.error("Error fetching data:", error);
        } finally {
          setLoading(false);
        }
      }
      fetchData();
    }, [])
  );

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
      <View
        className={`flex-row items-center px-4 py-3 ${isDark ? "bg-[#26282D] border-gray-700" : "bg-white border-gray-200"} border-b`}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">
            {t("common.back")}
          </Text>
        </TouchableOpacity>
        <Text
          className={`text-xl font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
        >
          {t("totalStats.title")}
        </Text>
      </View>

      {/* Total Balance */}
      <View className="px-4 mb-4 mt-4">
        <View className="bg-cheddar-yellow rounded-xl p-6 shadow-sm">
          <Text className="text-cheddar-dark text-sm font-medium">
            {t("totalStats.balance")}
          </Text>
          <Text className="text-cheddar-dark text-3xl font-bold mt-1">
            {currencySymbol} {totalAssets.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Asset Growth Chart */}
        <View className="px-4 mb-4">
          <View
            className={`rounded-xl p-4 shadow-sm ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          >
            <Text
              className={`font-semibold mb-4 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            >
              {t("totalStats.monthlyGrowth")}
            </Text>
            {monthlyData.length > 0 ? (
              <View style={{ height: 250 }}>
                <DotChart data={monthlyData} height={250} />
              </View>
            ) : (
              <View className="items-center justify-center" style={{ height: 250 }}>
                <Text
                  className={`text-lg ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
                >
                  {t("totalStats.noData")}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Income vs Expense Chart */}
        <View className="px-4 mb-4">
          <View
            className={`rounded-xl p-4 shadow-sm ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          >
            <Text
              className={`font-semibold mb-4 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            >
              {t("totalStats.incomeExpense")}
            </Text>
            {incomeExpenseData.length > 0 ? (
              <View style={{ height: 250 }}>
                <BarChart data={incomeExpenseData} height={250} />
              </View>
            ) : (
              <View className="items-center justify-center" style={{ height: 250 }}>
                <Text
                  className={`text-lg ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
                >
                  {t("totalStats.noData")}
                </Text>
              </View>
            )}
            {/* Legend */}
            <View className="flex-row justify-center mt-4">
              <View className="flex-row items-center mr-6">
                <View className="w-4 h-4 rounded-sm mr-2" style={{ backgroundColor: 'rgba(59, 130, 246, 0.5)' }} />
                <Text className={`text-sm ${isDark ? "text-gray-300" : "text-cheddar-gray"}`}>
                  {t("totalStats.income")}
                </Text>
              </View>
              <View className="flex-row items-center">
                <View className="w-4 h-4 rounded-sm mr-2" style={{ backgroundColor: 'rgba(239, 68, 68, 0.5)' }} />
                <Text className={`text-sm ${isDark ? "text-gray-300" : "text-cheddar-gray"}`}>
                  {t("totalStats.expense")}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}