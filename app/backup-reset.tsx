import { View, Text, TouchableOpacity, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Trash2, AlertTriangle } from "lucide-react-native";
import { useTheme } from "../src/components/ThemeProvider";
import { clearAllData } from "../src/db";
import { initDatabase } from "../src/db/tinybase";
import { trackEvent } from "../src/lib/analytics";

export default function BackupResetScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const resetInfoParts = t("backup.resetInfo").split("export a backup");

  const handleReset = () => {
    trackEvent('backup.reset_pressed');
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `${t("backup.resetConfirmTitle")}\n\n${t("backup.resetConfirmMessage")}`
      );
      if (confirmed) {
        trackEvent('backup.reset_confirmed');
        confirmReset();
      } else {
        trackEvent('backup.reset_cancelled');
      }
    } else {
      Alert.alert(
        t("backup.resetConfirmTitle"),
        t("backup.resetConfirmMessage"),
        [
          {
            text: t("common.cancel"),
            style: "cancel",
            onPress: () => trackEvent('backup.reset_cancelled'),
          },
          {
            text: t("backup.resetButton"),
            style: "destructive",
            onPress: () => {
              trackEvent('backup.reset_confirmed');
              confirmReset();
            },
          },
        ]
      );
    }
  };

  const confirmReset = async () => {
    try {
      await clearAllData();
      // Re-initialize database with default data (force reinit to seed defaults)
      await initDatabase(true);
      trackEvent('backup.reset_success');
      if (Platform.OS === 'web') {
        window.alert(`${t("backup.resetSuccessTitle")}\n\n${t("backup.resetSuccessMessage")}`);
        router.back();
      } else {
        Alert.alert(
          t("backup.resetSuccessTitle"),
          t("backup.resetSuccessMessage"),
          [{ text: "OK", onPress: () => router.back() }]
        );
      }
    } catch (error) {
      console.error("Reset failed:", error);
      trackEvent('backup.reset_failed');
      if (Platform.OS === 'web') {
        window.alert(`${t("backup.resetError")}\n\n${t("backup.resetFailed")}`);
      } else {
        Alert.alert(t("backup.resetError"), t("backup.resetFailed"));
      }
    }
  };

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"}`}
    >
      <View
        className={`flex-row items-center px-4 py-3 ${isDark ? "bg-[#26282D] border-gray-700" : "bg-white border-gray-200"} border-b`}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">
            {t("common.back")}
          </Text>
        </TouchableOpacity>
        <Text
          className={`text-xl font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
        >
          {t("backup.resetData")}
        </Text>
      </View>

      <View className="flex-1 px-4 pt-4">
        <View
          className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl p-4`}
        >
          <View className="flex-row items-center mb-4">
            <AlertTriangle size={24} color="#EF4444" />
            <Text
              className={`text-lg font-semibold ml-2 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            >
              {t("backup.resetWarning")}
            </Text>
          </View>
          <Text
            className={`${isDark ? "text-gray-300" : "text-gray-600"} text-sm leading-5`}
          >
            {resetInfoParts[0]}
            <Text
              className="text-cheddar-yellow"
              onPress={() => router.push("/backup-export")}
            >
              {t("backup.exportBackup")}
            </Text>
            {resetInfoParts[1]}
          </Text>
        </View>

        <TouchableOpacity
          className={`flex-row items-center justify-center p-4 mt-6 rounded-xl ${
            isDark ? "bg-red-600" : "bg-red-500"
          }`}
          activeOpacity={0.7}
          onPress={handleReset}
        >
          <Trash2 size={22} color="white" />
          <Text className="text-white text-lg font-semibold ml-2">
            {t("backup.resetButton")}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}