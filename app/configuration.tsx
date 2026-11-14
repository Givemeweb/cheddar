import { View, Text, TouchableOpacity, ScrollView, Platform, Linking, Alert } from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Lock,
  Bell,
  Palette,
  ChevronRight,
} from "lucide-react-native";
import { useTheme } from "../src/components/ThemeProvider";
import { ToggleSwitch } from "../src/components/ToggleSwitch";
import { isAnalyticsEnabled, setAnalyticsEnabled } from "../src/db/analytics";
import { trackEvent } from "../src/lib/analytics";

type MenuItem = {
  label: string;
  icon: React.ReactNode;
  route: string;
  target:
    | "income-categories"
    | "expense-categories"
    | "currency"
    | "passcode"
    | "alarms"
    | "style";
};

type MenuGroup = {
  title: string;
  items: MenuItem[];
};

export default function ConfigurationScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(() =>
    isAnalyticsEnabled(),
  );
  const dashboardUrl = process.env.EXPO_PUBLIC_UMAMI_DASHBOARD_URL;

  const iconColor = isDark ? "#F9FAFB" : "#212226";

  const handleToggleAnalytics = async (value: boolean) => {
    if (value === analyticsEnabled) return;

    // Send the opt-out while it is still enabled, then stop everything.
    if (!value) trackEvent('settings.analytics_toggle', { enabled: false });

    const previous = analyticsEnabled;
    setAnalyticsEnabledState(value);

    try {
      await setAnalyticsEnabled(value);
      if (value) trackEvent('settings.analytics_toggle', { enabled: true });
    } catch (error) {
      console.warn('[config] Failed to persist the analytics preference', error);
      setAnalyticsEnabledState(previous);
      if (Platform.OS === 'web') {
        window.alert(t('config.analyticsSaveErrorDesc'));
      } else {
        Alert.alert(
          t('config.analyticsSaveError'),
          t('config.analyticsSaveErrorDesc'),
        );
      }
    }
  };

  const openDashboard = () => {
    if (!dashboardUrl) return;
    if (!/^https?:\/\//i.test(dashboardUrl)) {
      console.warn('[config] Ignoring a non-http(s) analytics dashboard URL');
      return;
    }
    trackEvent('settings.analytics_dashboard_open');
    void Linking.openURL(dashboardUrl).catch((error) => {
      console.warn('[config] Failed to open the analytics dashboard', error);
    });
  };

  const menuGroups: MenuGroup[] = [
    {
      title: t('config.category'),
      items: [
        {
          label: t('config.incomeCategories'),
          icon: <TrendingUp size={22} color="#10B981" />,
          route: "/configuration/income-categories",
          target: "income-categories",
        },
        {
          label: t('config.expenseCategories'),
          icon: <TrendingDown size={22} color="#EF4444" />,
          route: "/configuration/expense-categories",
          target: "expense-categories",
        },
      ],
    },
    {
      title: t('config.configuration'),
      items: [
        {
          label: t('config.mainCurrency'),
          icon: <DollarSign size={22} color={iconColor} />,
          route: "/configuration/currency",
          target: "currency",
        },
      ],
    },
    {
      title: t('config.other'),
      items: [
        {
          label: t('config.passcode'),
          icon: <Lock size={22} color={iconColor} />,
          route: "/passcode",
          target: "passcode",
        },
        ...(Platform.OS !== 'web' ? [{
          label: t('config.alarmSettings'),
          icon: <Bell size={22} color={iconColor} />,
          route: "/configuration/alarms",
          target: "alarms" as const,
        }] : []),
        {
          label: t('config.style'),
          icon: <Palette size={22} color={iconColor} />,
          route: "/configuration/style",
          target: "style",
        },
      ],
    },
  ];

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
          {t("config.title")}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {menuGroups.map((group, groupIndex) => (
          <View key={group.title} className={groupIndex > 0 ? "mt-6" : ""}>
            <Text
              className={`text-sm font-medium uppercase mb-2 px-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {group.title}
            </Text>
            <View
              className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl overflow-hidden`}
            >
              {group.items.map((item, index) => (
                <TouchableOpacity
                  key={item.route}
                  className={`flex-row items-center justify-between p-4 ${
                    index > 0
                      ? `${isDark ? "border-gray-700" : "border-gray-100"}`
                      : ""
                  }`}
                  activeOpacity={0.7}
                  onPress={() => {
                    trackEvent('configuration.row_open', { target: item.target });
                    router.push(item.route as never);
                  }}
                >
                  <View className="flex-row items-center">
                    <View className="mr-3">{item.icon}</View>
                    <Text
                      className={`text-lg ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                    >
                      {item.label}
                    </Text>
                  </View>
                  <ChevronRight size={20} color="#9CA3AF" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View className="mt-6">
          <Text
            className={`text-sm font-medium uppercase mb-2 px-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("config.privacy")}
          </Text>
          <View
            className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl px-4 py-4`}
          >
            <View className="flex-row items-center">
              <View className="flex-1 mr-4">
                <Text
                  className={`text-lg ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                >
                  {t("config.analytics")}
                </Text>
                <Text
                  className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                >
                  {t("config.analyticsDesc")}
                </Text>
              </View>
              <ToggleSwitch
                value={analyticsEnabled}
                onValueChange={handleToggleAnalytics}
                accessibilityLabel={t("config.analytics")}
              />
            </View>
            <Text
              className={`text-xs mt-3 leading-5 ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {dashboardUrl
                ? t("config.analyticsNote")
                : t("config.analyticsNoteNoLink")}
              {dashboardUrl ? (
                <>
                  {" "}
                  <Text
                    onPress={openDashboard}
                    accessibilityRole="link"
                    className={`underline font-medium ${isDark ? "text-amber-400" : "text-amber-700"}`}
                  >
                    {t("config.analyticsDashboard")}
                  </Text>
                </>
              ) : null}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}