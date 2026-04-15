import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { Receipt, BarChart3, Wallet, Settings } from "lucide-react-native";

function TabIcon({
  icon: Icon,
  label,
  focused,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label?: string;
  focused: boolean;
}) {
  return (
    <View className="items-center justify-center pt-2 pb-1">
      <Icon size={24} color={focused ? "#FFB800" : "#6B7280"} />
      {label && (
        <Text
          className={`text-xs mt-1 ${focused ? "text-cheddar-yellow font-semibold" : "text-cheddar-gray"}`}
        >
          {label}
        </Text>
      )}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
          height: 70,
          paddingBottom: 12,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Transactions",
          tabBarIcon: ({ focused }) => <TabIcon icon={Receipt} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ focused }) => <TabIcon icon={BarChart3} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: "Accounts",
          tabBarIcon: ({ focused }) => <TabIcon icon={Wallet} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ focused }) => <TabIcon icon={Settings} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
