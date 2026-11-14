import { View, Text, TouchableOpacity, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../../src/components/ThemeProvider";
import { ToggleSwitch } from "../../src/components/ToggleSwitch";
import { useTranslation } from "react-i18next";
import { getAlarmSettings, saveAlarmSettings, AlarmSettings } from "../../src/db/storage";
import {
  requestNotificationPermissions,
  scheduleAlarmNotification,
  cancelAlarmNotifications,
} from "../../src/utils/notifications";
import { trackEvent } from "../../src/lib/analytics";

const DAYS = [
  { key: 0, shortKey: "sun" },
  { key: 1, shortKey: "mon" },
  { key: 2, shortKey: "tue" },
  { key: 3, shortKey: "wed" },
  { key: 4, shortKey: "thu" },
  { key: 5, shortKey: "fri" },
  { key: 6, shortKey: "sat" },
];

export default function AlarmSettingsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AlarmSettings>({
    enabled: false,
    time: "21:00",
    days: [0, 1, 2, 3, 4, 5, 6],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showTimePicker, setShowTimePicker] = useState(false);
  // iOS renders the picker inline, so onChange fires on every wheel movement.
  // Debounce the analytics event until the user pauses.
  const timeChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const savedSettings = await getAlarmSettings();
    setSettings(savedSettings);
    setIsLoading(false);
  };

  const handleToggleEnabled = async (value: boolean) => {
    if (value) {
      // Request notification permissions when enabling
      const granted = await requestNotificationPermissions();
      if (!granted) {
        // Show alert that permissions were denied
        trackEvent('alarm.permission_denied');
        return;
      }
    }

    const newSettings = { ...settings, enabled: value };
    setSettings(newSettings);
    await saveAlarmSettings(newSettings);
    trackEvent('alarm.toggle', { enabled: value });

    if (value) {
      // Schedule notifications when enabled
      await scheduleAlarmNotification();
    } else {
      // Cancel notifications when disabled
      await cancelAlarmNotifications();
    }
  };

  const handleTimeChange = async (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === "ios");
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, "0");
      const minutes = selectedTime.getMinutes().toString().padStart(2, "0");
      const newTime = `${hours}:${minutes}`;
      const newSettings = { ...settings, time: newTime };
      setSettings(newSettings);
      await saveAlarmSettings(newSettings);
      if (timeChangeTimer.current) clearTimeout(timeChangeTimer.current);
      timeChangeTimer.current = setTimeout(() => {
        trackEvent('alarm.time_change');
      }, 600);

      if (settings.enabled) {
        // Reschedule notifications with updated time
        await scheduleAlarmNotification();
      }
    }
  };

  const getDisplayTime = (time: string): string => {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  const toggleDay = async (dayKey: number) => {
    const newDays = settings.days.includes(dayKey)
      ? settings.days.filter((d) => d !== dayKey)
      : [...settings.days, dayKey];
    const newSettings = { ...settings, days: newDays };
    setSettings(newSettings);
    await saveAlarmSettings(newSettings);
    trackEvent('alarm.day_toggle', { day: dayKey });

    if (settings.enabled) {
      // Reschedule notifications with updated days
      await scheduleAlarmNotification();
    }
  };

  const iconColor = isDark ? "#F9FAFB" : "#212226";

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
          {t("config.alarmSettings")}
        </Text>
      </View>

      <View className="flex-1 px-4 pt-4">
        {/* Enable/Disable toggle */}
        <Text
          className={`text-sm font-medium uppercase mb-2 px-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}
        >
          {t("config.alarmSettings")}
        </Text>
        <View
          className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl overflow-hidden`}
        >
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-row items-center flex-1">
              <View className="mr-3">
                <Bell size={24} color={iconColor} />
              </View>
              <View className="flex-1">
                <Text
                  className={`text-lg ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                >
                  {t("alarm.enable")}
                </Text>
                <Text
                  className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
                >
                  {t("alarm.enableDesc")}
                </Text>
              </View>
            </View>
            <ToggleSwitch
              value={settings.enabled}
              onValueChange={handleToggleEnabled}
            />
          </View>
        </View>

        {/* Time Selection */}
        <Text
          className={`text-sm font-medium uppercase mb-2 px-2 mt-6 ${isDark ? "text-gray-400" : "text-gray-500"}`}
        >
          {t("alarm.time")}
        </Text>
        <View
          className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl overflow-hidden`}
        >
          <TouchableOpacity
            className="flex-row items-center justify-between p-4"
            onPress={() => setShowTimePicker(true)}
            disabled={!settings.enabled}
          >
            <View className="flex-1">
              <Text
                className={`text-lg ${isDark ? "text-cheddar-light" : "text-cheddar-dark"} ${!settings.enabled ? "opacity-50" : ""}`}
              >
                {getDisplayTime(settings.time)}
              </Text>
              <Text
                className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"} ${!settings.enabled ? "opacity-50" : ""}`}
              >
                {t("alarm.timeDesc")}
              </Text>
            </View>
          </TouchableOpacity>
          {showTimePicker && (
            <DateTimePicker
              value={(() => {
                const [hours, minutes] = settings.time.split(":").map(Number);
                const date = new Date();
                date.setHours(hours, minutes, 0, 0);
                return date;
              })()}
              mode="time"
              is24Hour={true}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleTimeChange}
            />
          )}
        </View>

        {/* Day Selection */}
        <Text
          className={`text-sm font-medium uppercase mb-2 px-2 mt-6 ${isDark ? "text-gray-400" : "text-gray-500"}`}
        >
          {t("alarm.repeat")}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {DAYS.map((day) => {
            const isSelected = settings.days.includes(day.key);
            return (
              <TouchableOpacity
                key={day.key}
                onPress={() => toggleDay(day.key)}
                disabled={!settings.enabled}
                className={`px-3 py-2 rounded-full border ${
                  isSelected
                    ? "bg-cheddar-yellow border-cheddar-yellow"
                    : isDark
                    ? "bg-[#26282D] border-gray-600"
                    : "bg-white border-gray-300"
                } ${!settings.enabled ? "opacity-50" : ""}`}
              >
                <Text
                  className={`text-sm font-medium ${
                    isSelected
                      ? "text-cheddar-dark"
                      : isDark
                      ? "text-cheddar-light"
                      : "text-cheddar-dark"
                  }`}
                >
                  {t(`days.short.${day.shortKey}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}