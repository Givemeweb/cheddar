import "../global.css";
import { useEffect } from "react";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppState, Platform, View, useWindowDimensions, StyleSheet } from "react-native";
import { DatabaseProvider } from "../src/components/DatabaseProvider";
import { ThemeProvider, useTheme } from "../src/components/ThemeProvider";
import { PremiumProvider } from "../src/components/PremiumProvider";
import { PasscodeProvider, usePasscode } from "../src/components/PasscodeProvider";
import { LockScreen } from "../src/components/LockScreen";
import { SideNav } from "../src/components/SideNav";
import { trackScreenView } from "../src/lib/analytics";
import { syncMercuryAccounts } from "../src/services/mercurySync";
import "../src/i18n";

function ThemedApp() {
  const { isDark } = useTheme();
  const { needsAuthentication } = usePasscode();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const pathname = usePathname();

  // One page view per route change, after the database (and the anonymous
  // analytics id) is ready. The home tab shows as `/transactions`.
  useEffect(() => {
    trackScreenView(pathname === '/' ? '/transactions' : pathname);
  }, [pathname]);

  // Ticket 06: debounced automatic sync on app open. Fire-and-forget so the
  // first render never waits on the network; the service itself no-ops
  // silently without premium, a connection, or enabled accounts.
  useEffect(() => {
    syncMercuryAccounts().catch((error) => {
      console.warn("[mercury] Startup sync failed", error);
    });
    // Resume from background re-attempts the same debounced sync; the
    // persisted debounce and backoff make a quick active/active flicker safe.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      syncMercuryAccounts().catch((error) => {
        console.warn("[mercury] Resume sync failed", error);
      });
    });
    return () => subscription.remove();
  }, []);

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
