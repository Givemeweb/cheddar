import { Tabs } from "expo-router";
import { View, Text } from "react-native";

function TabIcon({
  icon,
  label,
  focused,
}: {
  icon: string;
  label?: string;
  focused: boolean;
}) {
  return (
    <View className="items-center justify-center py-2">
      <Text className="text-2xl">{icon}</Text>
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
          height: 80,
          paddingBottom: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Transactions",
          tabBarIcon: ({ focused }) => <TabIcon icon="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: "Accounts",
          tabBarIcon: ({ focused }) => <TabIcon icon="👛" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ focused }) => <TabIcon icon="☰" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
