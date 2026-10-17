import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useTheme } from "../../src/components/ThemeProvider";
import { CURRENCIES } from "../../src/db/currency";
import { useTranslation } from "react-i18next";

export default function TotalAssetsCurrencyScreen() {
  const router = useRouter();
  const { isDark, currencyCode, totalAssetsCurrencyCode, setTotalAssetsCurrencyState } = useTheme();
  const { t } = useTranslation();

  // null means the card follows the app's main currency
  const effectiveCode = totalAssetsCurrencyCode ?? currencyCode;

  const renderRow = (
    key: string,
    symbol: string,
    name: string,
    subtitle: string,
    selected: boolean,
    onPress: () => void,
    index: number
  ) => (
    <TouchableOpacity
      key={key}
      className={`flex-row items-center justify-between p-4 ${
        index > 0
          ? `${isDark ? "border-gray-700" : "border-gray-100"} border-t`
          : ""
      }`}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View className="flex-row items-center flex-1">
        <Text
          className={`text-2xl font-semibold mr-4 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
        >
          {symbol}
        </Text>
        <View className="flex-1">
          <Text
            className={`text-lg ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
          >
            {name}
          </Text>
          <Text
            className={`text-sm ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      {selected && <Check size={24} color="#FFB800" />}
    </TouchableOpacity>
  );

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
          {t("accounts.totalAssetsCurrency")}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        <View
          className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl overflow-hidden`}
        >
          {renderRow(
            "follow-main",
            "",
            t("accounts.totalAssetsFollowMain"),
            t("config.mainCurrency"),
            totalAssetsCurrencyCode === null,
            () => setTotalAssetsCurrencyState(null),
            0
          )}
          {CURRENCIES.map((curr, index) =>
            renderRow(
              curr.code,
              curr.symbol,
              curr.name,
              curr.code,
              totalAssetsCurrencyCode !== null && effectiveCode === curr.code,
              () => setTotalAssetsCurrencyState(curr.code),
              index + 1
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
