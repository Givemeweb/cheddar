import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View, useWindowDimensions, StyleSheet } from "react-native";
import { DatabaseProvider } from "../src/components/DatabaseProvider";
import { ThemeProvider, useTheme } from "../src/components/ThemeProvider";
import { PremiumProvider } from "../src/components/PremiumProvider";
import { PasscodeProvider, usePasscode } from "../src/components/PasscodeProvider";
import { LockScreen } from "../src/components/LockScreen";
import { SideNav } from "../src/components/SideNav";
import "../src/i18n";

function ThemedApp() {
  const { isDark } = useTheme();
  const { needsAuthentication } = usePasscode();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  if (needsAuthentication) {
    return (
      <View className={`flex-1 ${isDark ? 'dark bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <LockScreen />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  // On large screens, always show side navigation
  if (isLargeScreen) {
    return (
      <View style={[styles.desktopContainer, isDark && styles.desktopContainerDark]}>
        <SideNav />
        <View style={styles.contentContainer}>
          <Stack screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'none' : 'default' }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="paywall"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
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
                animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="passcode"
              options={{
                animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="backup"
              options={{
                animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="backup-device"
              options={{
                animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="backup-export"
              options={{
                animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="backup-import"
              options={{
                animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="backup-reset"
              options={{
                animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
              }}
            />
          </Stack>
        </View>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <View className={`flex-1 ${isDark ? 'dark bg-cheddar-dark' : 'bg-cheddar-light'}`}>
      <Stack screenOptions={{ headerShown: false, animation: Platform.OS === 'android' ? 'none' : 'default' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
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
            animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="passcode"
          options={{
            animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="backup"
          options={{
            animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="backup-device"
          options={{
            animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="backup-export"
          options={{
            animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="backup-import"
          options={{
            animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="backup-reset"
          options={{
            animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
          }}
        />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
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

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <ThemeProvider>
        <PremiumProvider>
          <PasscodeProvider>
            <ThemedApp />
          </PasscodeProvider>
        </PremiumProvider>
      </ThemeProvider>
    </DatabaseProvider>
  );
}
