import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useTheme } from "../../src/components/ThemeProvider";
import { CURRENCIES } from "../../src/db/currency";
import { useTranslation } from "react-i18next";

export default function CurrencyScreen() {
  const router = useRouter();
  const { isDark, currencyCode, setCurrencyState } = useTheme();
  const { t } = useTranslation();

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
          {t("config.mainCurrency")}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        <View
          className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl overflow-hidden`}
        >
          {CURRENCIES.map((curr, index) => {
            const isSelected = currencyCode === curr.code;
            return (
              <TouchableOpacity
                key={curr.code}
                className={`flex-row items-center justify-between p-4 ${
                  index > 0
                    ? `${isDark ? "border-gray-700" : "border-gray-100"} border-t`
                    : ""
                }`}
                activeOpacity={0.7}
                onPress={() => setCurrencyState(curr.code)}
              >
                <View className="flex-row items-center flex-1">
                  <Text
                    className={`text-2xl font-semibold mr-4 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                  >
                    {curr.symbol}
                  </Text>
                  <View className="flex-1">
                    <Text
                      className={`text-lg ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                    >
                      {curr.name}
                    </Text>
                    <Text
                      className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
                    >
                      {curr.code}
                    </Text>
                  </View>
                </View>
                {isSelected && <Check size={20} color="#FFB800" />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}