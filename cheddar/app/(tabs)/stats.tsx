import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PieChart } from "react-native-svg-charts";
import { getCategories, getTransactions } from "../../src/db/storage";

type CategoryStat = {
  id: number;
  name: string;
  icon: string;
  total: number;
  color: string;
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

  useEffect(() => {
    async function fetchStats() {
      try {
        const allCategories = await getCategories();
        const allTransactions = await getTransactions();

        const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

        // Filter by income or expense
        const filteredTransactions = allTransactions.filter((tx) => {
          const cat = categoryMap.get(tx.categoryId);
          return cat?.type === activeTab;
        });

        // Calculate totals per category
        const categoryTotals = new Map<number, number>();
        filteredTransactions.forEach((tx) => {
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
  }, [activeTab]);

  return (
    <SafeAreaView className="flex-1 bg-cheddar-light">
      <View className="px-4 py-4">
        {/* Tab Buttons */}
        <View className="flex-row bg-white rounded-xl p-1 shadow-sm">
          <Pressable
            onPress={() => setActiveTab("income")}
            className={`flex-1 py-3 rounded-lg ${activeTab === "income" ? "bg-cheddar-yellow" : ""}`}
          >
            <Text
              className={`text-center font-semibold ${activeTab === "income" ? "text-cheddar-dark" : "text-cheddar-gray"}`}
            >
              Income
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("expense")}
            className={`flex-1 py-3 rounded-lg ${activeTab === "expense" ? "bg-cheddar-yellow" : ""}`}
          >
            <Text
              className={`text-center font-semibold ${activeTab === "expense" ? "text-cheddar-dark" : "text-cheddar-gray"}`}
            >
              Expenses
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
              <View className="bg-white rounded-xl p-4 shadow-sm mb-4">
                <View className="h-64">
                  <PieChart
                    data={categoryStats.map((stat, index) => ({
                      key: stat.id.toString(),
                      value: stat.total,
                      svg: { fill: stat.color },
                    }))}
                    innerRadius="20%"
                    padAngle={0.02}
                  />
                </View>
                <Text className="text-center text-2xl font-bold text-cheddar-dark mt-2">
                  €{total.toFixed(2)}
                </Text>
              </View>

              {/* Legend */}
              <View className="bg-white rounded-xl p-4 shadow-sm">
                <Text className="font-semibold text-cheddar-dark mb-3">
                  Categories
                </Text>
                {categoryStats.map((stat) => (
                  <View key={stat.id} className="flex-row items-center py-2">
                    <View
                      className="w-4 h-4 rounded-full mr-3"
                      style={{ backgroundColor: stat.color }}
                    />
                    <Text className="text-lg mr-2">{stat.icon}</Text>
                    <View className="flex-1">
                      <Text className="text-cheddar-dark font-medium">
                        {stat.name}
                      </Text>
                    </View>
                    <Text className="text-cheddar-gray font-medium">
                      €{stat.total.toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-cheddar-gray text-lg">
                No {activeTab} transactions this month
              </Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
