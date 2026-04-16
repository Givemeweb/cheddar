import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { DatabaseProvider } from "../src/components/DatabaseProvider";
import { ThemeProvider, useTheme } from "../src/components/ThemeProvider";
import { PasscodeProvider, usePasscode } from "../src/components/PasscodeProvider";
import { LockScreen } from "../src/components/LockScreen";
import "../src/i18n";

function ThemedApp() {
  const { isDark } = useTheme();
  const { needsAuthentication } = usePasscode();

  if (needsAuthentication) {
    return (
      <View className={`flex-1 ${isDark ? 'dark bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <LockScreen />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <View className={`flex-1 ${isDark ? 'dark bg-cheddar-dark' : 'bg-cheddar-light'}`}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add-transaction"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="configuration"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="passcode"
          options={{
            animation: 'slide_from_right',
          }}
        />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <ThemeProvider>
        <PasscodeProvider>
          <ThemedApp />
        </PasscodeProvider>
      </ThemeProvider>
    </DatabaseProvider>
  );
}
