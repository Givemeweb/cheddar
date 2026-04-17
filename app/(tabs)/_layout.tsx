import { Tabs } from "expo-router";
import { View, Text, useWindowDimensions, StyleSheet } from "react-native";
import { Receipt, BarChart3, Wallet, Settings } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../src/components/ThemeProvider";

function TabIcon({
  icon: Icon,
  label,
  focused,
  isDark,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label?: string;
  focused: boolean;
  isDark: boolean;
}) {
  const inactiveColor = isDark ? "#9CA3AF" : "#6B7280";

  return (
    <View className="items-center justify-center pt-2 pb-3">
      <Icon size={24} color={focused ? "#FFB800" : inactiveColor} />
      {label && (
        <Text
          className={`text-xs mt-1 ${focused ? "text-cheddar-yellow font-semibold" : isDark ? "text-gray-400" : "text-cheddar-gray"}`}
        >
          {label}
        </Text>
      )}
    </View>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const isLargeScreen = width >= 768;

  // On large screens, hide tab bar (side nav is handled by root layout)
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#FFB800",
        tabBarInactiveTintColor: isDark ? "#9CA3AF" : "#6B7280",
        tabBarStyle: isLargeScreen
          ? { display: "none" }
          : {
              backgroundColor: isDark ? "#26282D" : "#FFFFFF",
              borderTopWidth: 1,
              borderTopColor: isDark ? "#374151" : "#E5E7EB",
              height: 80,
              paddingBottom: 12,
              paddingTop: 8,
            },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.transactions"),
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={Receipt} focused={focused} isDark={isDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t("tabs.stats"),
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={BarChart3} focused={focused} isDark={isDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: t("tabs.accounts"),
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={Wallet} focused={focused} isDark={isDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("tabs.more"),
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={Settings} focused={focused} isDark={isDark} />
          ),
        }}
      />
    </Tabs>
  );
}