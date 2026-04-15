import { Tabs } from "expo-router";
import { View, Text, useWindowDimensions, StyleSheet } from "react-native";
import { Receipt, BarChart3, Wallet, Settings } from "lucide-react-native";
import { SideNav } from "../../src/components/SideNav";
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
  const isLargeScreen = width >= 768;

  // On large screens, we use side navigation instead of tabs
  if (isLargeScreen) {
    return (
      <View style={[styles.desktopContainer, isDark && styles.desktopContainerDark]}>
        <SideNav />
        <View style={styles.contentContainer}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: "none" },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: "Transactions",
                tabBarIcon: ({ focused }) => (
                  <TabIcon icon={Receipt} focused={focused} isDark={isDark} />
                ),
              }}
            />
            <Tabs.Screen
              name="stats"
              options={{
                title: "Stats",
                tabBarIcon: ({ focused }) => (
                  <TabIcon icon={BarChart3} focused={focused} isDark={isDark} />
                ),
              }}
            />
            <Tabs.Screen
              name="accounts"
              options={{
                title: "Accounts",
                tabBarIcon: ({ focused }) => (
                  <TabIcon icon={Wallet} focused={focused} isDark={isDark} />
                ),
              }}
            />
            <Tabs.Screen
              name="more"
              options={{
                title: "More",
                tabBarIcon: ({ focused }) => (
                  <TabIcon icon={Settings} focused={focused} isDark={isDark} />
                ),
              }}
            />
          </Tabs>
        </View>
      </View>
    );
  }

  // On small screens, use regular bottom tabs
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#FFB800",
        tabBarInactiveTintColor: isDark ? "#9CA3AF" : "#6B7280",
        tabBarStyle: {
          backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
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
          title: "Transactions",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={Receipt} focused={focused} isDark={isDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={BarChart3} focused={focused} isDark={isDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: "Accounts",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={Wallet} focused={focused} isDark={isDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={Settings} focused={focused} isDark={isDark} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  desktopContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
  },
  desktopContainerDark: {
    backgroundColor: "#111827",
  },
  contentContainer: {
    flex: 1,
  },
});