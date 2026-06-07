import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Star, RefreshCw, ExternalLink, AlertCircle } from "lucide-react-native";
import { useTheme } from "../src/components/ThemeProvider";
import { useSubscription } from "../src/components/SubscriptionProvider";

export default function SubscriptionScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const {
    isPremium,
    tier,
    expiryDate,
    isRestoring,
    restoreError,
    restoreSuccess,
    restorePurchases,
    clearRestoreState,
  } = useSubscription();

  const handleRestore = async () => {
    clearRestoreState();
    await restorePurchases();
  };

  const handleManageSubscription = () => {
    if (Platform.OS === "ios") {
      // iOS deep-link to App Store subscription management
      const url = "https://apps.apple.com/account/subscriptions";
      // In a real app, use Linking.openURL(url)
    } else if (Platform.OS === "android") {
      // Android deep-link to Google Play subscriptions
      const url = "https://play.google.com/store/account/subscriptions";
      // In a real app, use Linking.openURL(url)
    }
  };

  const getStatusLabel = () => {
    if (isPremium) return t("subscription.screen.status.active");
    return t("subscription.screen.status.free");
  };

  const getStatusColor = () => {
    if (isPremium) return "#10B981"; // green
    return "#9CA3AF"; // gray
  };

  const getErrorMessage = () => {
    if (!restoreError) return null;
    switch (restoreError) {
      case "NO_PURCHASES_FOUND":
        return t("subscription.error.noPurchases");
      case "ALREADY_LINKED":
        return t("subscription.error.alreadyLinked");
      case "INVALID_RECEIPT":
        return t("subscription.error.invalidReceipt");
      case "NETWORK_ERROR":
        return t("subscription.error.networkError");
      default:
        return t("subscription.error.unknownError");
    }
  };

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"}`}
    >
      {/* Header */}
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
          {t("subscription.screen.title")}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {/* Status Card */}
        <View
          className={`rounded-xl p-5 mb-4 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
        >
          <View className="flex-row items-center mb-3">
            <View
              className="w-3 h-3 rounded-full mr-2"
              style={{ backgroundColor: getStatusColor() }}
            />
            <Text
              className={`text-lg font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            >
              {getStatusLabel()}
            </Text>
          </View>

          {isPremium && tier && (
            <Text
              className={`text-base mb-1 ${isDark ? "text-gray-300" : "text-gray-600"}`}
            >
              {tier === "annual"
                ? t("subscription.screen.annualPlan")
                : t("subscription.screen.monthlyPlan")}
            </Text>
          )}

          {isPremium && expiryDate && (
            <Text
              className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("subscription.screen.expiryLabel")}:{" "}
              {expiryDate.toLocaleDateString()}
            </Text>
          )}

          {!isPremium && (
            <Text
              className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("subscription.screen.upgradeDesc")}
            </Text>
          )}
        </View>

        {/* Premium Benefits (shown for free users) */}
        {!isPremium && (
          <View
            className={`rounded-xl p-5 mb-4 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          >
            <Text
              className={`text-lg font-semibold mb-3 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            >
              {t("subscription.paywall.title")}
            </Text>
            {(
              [
                "voice",
                "unlimited",
                "stats",
                "backup",
                "subcategories",
                "alarms",
                "passcode",
              ] as const
            ).map((benefit) => (
              <View key={benefit} className="flex-row items-center mb-2">
                <View className="mr-2">
                  <Star
                    size={16}
                    color="#FBBF24"
                    fill="#FBBF24"
                  />
                </View>
                <Text
                  className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}
                >
                  {t(`subscription.paywall.benefits.${benefit}`)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Restore Purchases */}
        <TouchableOpacity
          onPress={handleRestore}
          disabled={isRestoring}
          className={`flex-row items-center justify-center rounded-xl p-4 mb-4 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          activeOpacity={0.7}
        >
          {isRestoring ? (
            <ActivityIndicator
              size="small"
              color={isDark ? "#F9FAFB" : "#212226"}
            />
          ) : (
            <>
              <View className="mr-2">
                <RefreshCw
                  size={20}
                  color={isDark ? "#F9FAFB" : "#212226"}
                />
              </View>
              <Text
                className={`text-base font-medium ml-2 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              >
                {t("subscription.screen.restoreButton")}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Restore Error */}
        {restoreError && (
          <View className="flex-row items-start mb-4 px-1">
            <View className="mr-2 mt-0.5">
              <AlertCircle
                size={18}
                color="#EF4444"
              />
            </View>
            <Text className="text-red-500 text-sm flex-1">
              {getErrorMessage()}
            </Text>
          </View>
        )}

        {/* Restore Success */}
        {restoreSuccess && (
          <View className="flex-row items-center mb-4 px-1">
            <View className="mr-2">
              <Star size={18} color="#10B981" />
            </View>
            <Text className="text-green-500 text-sm">
              {t("subscription.screen.status.active")}
            </Text>
          </View>
        )}

        {/* Retry button for errors */}
        {restoreError && restoreError !== "ALREADY_LINKED" && (
          <TouchableOpacity
            onPress={handleRestore}
            className="mb-4"
          >
            <Text className="text-cheddar-yellow text-base font-medium text-center">
              {t("subscription.error.retry")}
            </Text>
          </TouchableOpacity>
        )}

        {/* Manage Subscription (for premium users) */}
        {isPremium && (
          <TouchableOpacity
            onPress={handleManageSubscription}
            className={`flex-row items-center justify-center rounded-xl p-4 mb-4 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
            activeOpacity={0.7}
          >
            <View className="mr-2">
              <ExternalLink
                size={20}
                color={isDark ? "#F9FAFB" : "#212226"}
              />
            </View>
            <Text
              className={`text-base font-medium ml-2 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            >
              {t("subscription.screen.manageSubscription")}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
