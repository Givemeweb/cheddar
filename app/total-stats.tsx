import { useState, useCallback } from "react";
import { View, Text, ActivityIndicator, useWindowDimensions, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { getAccounts, getTransactions } from "../src/db/storage";
import { useTheme } from "../src/components/ThemeProvider";
import DotChart from "../src/components/DotChart";

type MonthlyData = {
  month: string;
  value: number;
};

export default function TotalStatsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [totalAssets, setTotalAssets] = useState(0);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
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

      {/* Chart */}
      <View className="px-4 mb-4 flex-1">
        <View
          className={`rounded-xl p-4 shadow-sm flex-1 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
        >
          <Text
            className={`font-semibold mb-4 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
          >
            {t("totalStats.monthlyGrowth")}
          </Text>
          {monthlyData.length > 0 ? (
            <View className="flex-1">
              <DotChart data={monthlyData} height={250} />
            </View>
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text
                className={`text-lg ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
              >
                {t("totalStats.noData")}
              </Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}