import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import PieChart from "../../src/components/PieChart";
import {
  getCategories,
  getTransactions,
  getAccounts,
} from "../../src/db/storage";
import { renderIcon } from "../../src/components/TransactionItem";
import { renderAccountIcon } from "../../src/components/accountIcons";
import { useTheme } from "../../src/components/ThemeProvider";
import { formatNumber } from "../../src/utils/formatNumber";

type CategoryStat = {
  id: string;
  name: string;
  icon: string;
  total: number;
  color: string;
};

type Account = {
  id: string;
  name: string;
  icon: string;
};

const COLORS = [
  "#FFB800",
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
];

export default function StatsScreen() {
  const [activeTab, setActiveTab] = useState<"income" | "expense">("expense");
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [chartSize, setChartSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const { isDark, showIcons, currencySymbol } = useTheme();
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

  useFocusEffect(
    useCallback(() => {
      async function fetchStats() {
        try {
          const allCategories = await getCategories();
          const allTransactions = await getTransactions();
          const allAccounts = await getAccounts();

          setAccounts(
            allAccounts.map((acc) => ({
              id: acc.id,
              name: acc.name,
              icon: acc.icon,
            }))
          );

          const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

          // Filter by selected month
          const startOfMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            1
          );
          const endOfMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            0,
            23,
            59,
            59,
            999
          );

          let monthTransactions = allTransactions.filter((tx) => {
            const txDate = new Date(tx.date);
            return txDate >= startOfMonth && txDate <= endOfMonth;
          });

          // Filter by selected account if not "all"
          if (selectedAccountId) {
            monthTransactions = monthTransactions.filter((tx) => {
              if (tx.type === "transfer") {
                return (
                  tx.accountId === selectedAccountId ||
                  tx.toAccountId === selectedAccountId
                );
              }
              return tx.accountId === selectedAccountId;
            });
          }

          // Filter by income or expense (exclude transfers which have no category)
          const filteredTransactions = monthTransactions.filter((tx) => {
            if (!tx.categoryId) return false;
            const cat = categoryMap.get(tx.categoryId);
            return cat?.type === activeTab;
          });

          // Calculate totals per category
          const categoryTotals = new Map<string, number>();
          filteredTransactions.forEach((tx) => {
            if (!tx.categoryId) return;
            const current = categoryTotals.get(tx.categoryId) || 0;
            categoryTotals.set(tx.categoryId, current + Math.abs(tx.amount));
          });

          // Build stats with colors
          const stats: CategoryStat[] = [];
          let totalAmount = 0;
          let colorIndex = 0;

          categoryTotals.forEach((amount, categoryId) => {
            const cat = categoryMap.get(categoryId);
            if (cat && amount > 0) {
              stats.push({
                id: categoryId,
                name: cat.name,
                icon: cat.icon,
                total: amount,
                color: COLORS[colorIndex % COLORS.length],
              });
              totalAmount += amount;
              colorIndex++;
            }
          });

          // Sort by total descending
          stats.sort((a, b) => b.total - a.total);
          setCategoryStats(stats);
          setTotal(totalAmount);
        } catch (error) {
          console.error("Error fetching stats:", error);
        } finally {
          setLoading(false);
        }
      }

      setLoading(true);
      fetchStats();
    }, [activeTab, currentDate, selectedAccountId])
  );

  const isAccountSelected = (accountId: string | null) =>
    selectedAccountId === accountId;

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"}`}
      edges={isLargeScreen ? ["top", "right", "bottom"] : undefined}
    >
      <View className="px-4 py-4">
        {/* Month Navigation */}
        <View className="flex-row items-center mb-3">
          <Pressable
            onPress={goToPreviousMonth}
            className="p-1"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={20} color={isDark ? "#9CA3AF" : "#6B7280"} />
          </Pressable>
          <Text
            className={`text-base font-semibold mx-2 ${isDark ? "text-white" : "text-cheddar-dark"}`}
          >
            {monthYear}
          </Text>
          <Pressable
            onPress={goToNextMonth}
            className="p-1"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronRight size={20} color={isDark ? "#9CA3AF" : "#6B7280"} />
          </Pressable>
        </View>

        {/* Account Filter */}
        {accounts.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-3"
            contentContainerStyle={{ paddingRight: 16 }}
          >
            <Pressable
              onPress={() => setSelectedAccountId(null)}
              className={`flex-row items-center mr-2 px-3 py-2 rounded-full border ${
                isAccountSelected(null)
                  ? "bg-cheddar-yellow border-cheddar-yellow"
                  : isDark
                    ? "bg-[#26282D] border-gray-600"
                    : "bg-white border-gray-200"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  isAccountSelected(null)
                    ? "text-cheddar-dark"
                    : isDark
                      ? "text-gray-300"
                      : "text-cheddar-gray"
                }`}
              >
                {t("common.all")}
              </Text>
            </Pressable>
            {accounts.map((account) => (
              <Pressable
                key={account.id}
                onPress={() => setSelectedAccountId(account.id)}
                className={`flex-row items-center mr-2 px-3 py-2 rounded-full border ${
                  isAccountSelected(account.id)
                    ? "bg-cheddar-yellow border-cheddar-yellow"
                    : isDark
                      ? "bg-[#26282D] border-gray-600"
                      : "bg-white border-gray-200"
                }`}
              >
                {showIcons && (
                  <View className="mr-1.5">
                    {renderAccountIcon(
                      account.icon,
                      14,
                      isAccountSelected(account.id)
                        ? "#212226"
                        : isDark
                          ? "#9CA3AF"
                          : "#6B7280",
                      true
                    )}
                  </View>
                )}
                <Text
                  className={`text-sm font-medium ${
                    isAccountSelected(account.id)
                      ? "text-cheddar-dark"
                      : isDark
                        ? "text-gray-300"
                        : "text-cheddar-gray"
                  }`}
                  numberOfLines={1}
                >
                  {account.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Tab Buttons */}
        <View
          className={`flex-row ${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl p-1 shadow-sm`}
        >
          <Pressable
            onPress={() => setActiveTab("income")}
            className={`flex-1 py-3 rounded-lg ${activeTab === "income" ? "bg-cheddar-yellow" : ""}`}
          >
            <Text
              className={`text-center font-semibold ${activeTab === "income" ? "text-cheddar-dark" : `${isDark ? "text-gray-400" : "text-cheddar-gray"}`}`}
            >
              {t("stats.income")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("expense")}
            className={`flex-1 py-3 rounded-lg ${activeTab === "expense" ? "bg-cheddar-yellow" : ""}`}
          >
            <Text
              className={`text-center font-semibold ${activeTab === "expense" ? "text-cheddar-dark" : `${isDark ? "text-gray-400" : "text-cheddar-gray"}`}`}
            >
              {t("stats.expenses")}
            </Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FFB800" />
        </View>
      ) : (
        <View className="flex-1 px-4">
          {categoryStats.length > 0 ? (
            <>
              {/* Pie Chart */}
              <View
                className={`rounded-xl p-4 shadow-sm mb-4 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
              >
                <View
                  className="h-64"
                  onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;
                    if (width > 0 && height > 0) {
                      setChartSize({ width, height });
                    }
                  }}
                >
                  {chartSize && (
                    <PieChart
                      data={categoryStats.map((stat) => ({
                        key: stat.id,
                        value: stat.total,
                        color: stat.color,
                      }))}
                      innerRadius={20}
                      width={chartSize.width}
                      height={chartSize.height}
                    />
                  )}
                </View>
                <Text
                  className={`text-center text-2xl font-bold mt-2 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                >
                  {currencySymbol} {formatNumber(total)}
                </Text>
              </View>

              {/* Legend */}
              <View
                className={`rounded-xl p-4 shadow-sm ${isDark ? "bg-[#26282D]" : "bg-white"}`}
              >
                <Text
                  className={`font-semibold mb-3 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                >
                  {t("stats.categories")}
                </Text>
                {categoryStats.map((stat) => (
                  <View key={stat.id} className="flex-row items-center py-2">
                    <View
                      className="px-2 py-0.5 rounded-full mr-3"
                      style={{ backgroundColor: stat.color }}
                    >
                      <Text className="text-xs font-medium text-cheddar-dark">
                        {formatNumber((stat.total / total) * 100, 0)}%
                      </Text>
                    </View>
                    <View className="mr-2">
                      {renderIcon(
                        stat.icon,
                        18,
                        isDark ? "#F9FAFB" : "#212226",
                        showIcons
                      )}
                    </View>
                    <View className="flex-1">
                      <Text
                        className={`font-medium ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                      >
                        {stat.name}
                      </Text>
                    </View>
                    <Text
                      className={`font-medium ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
                    >
                      {currencySymbol} {formatNumber(stat.total)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View className="flex-1 items-center justify-center py-20">
              <Text
                className={`text-lg ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
              >
                {t("stats.noTransactions", {
                  tab:
                    activeTab === "income"
                      ? t("stats.income").toLowerCase()
                      : t("stats.expenses").toLowerCase(),
                })}
              </Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
