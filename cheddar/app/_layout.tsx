import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { DatabaseProvider } from "../src/components/DatabaseProvider";

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <View className="flex-1 bg-cheddar-light">
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
        <StatusBar style="auto" />
      </View>
    </DatabaseProvider>
  );
}
