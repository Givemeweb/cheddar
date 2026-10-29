import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { BarChart3 } from "lucide-react-native";
import { getAccounts, Account } from "../../src/db/storage";
import { getCurrencySymbol } from "../../src/db/currency";
import { convertWithRates, getLatestRates, RatesCache } from "../../src/services/exchangeRates";
import { renderAccountIcon } from "../../src/components/accountIcons";
import { useTheme } from "../../src/components/ThemeProvider";
import { usePremium } from "../../src/components/PremiumProvider";
import { formatNumber } from "../../src/utils/formatNumber";
import { totalStatsDestination } from "../../src/utils/premiumAccess";
import { Globe } from "lucide-react-native";

export default function AccountsScreen() {
  const router = useRouter();
  const [accountsList, setAccountsList] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [ratesCache, setRatesCache] = useState<RatesCache | null>(null);
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const { isDark, showIcons, currencySymbol, currencyCode, totalAssetsCurrencyCode, totalAssetsCurrencySymbol } = useTheme();
  const { isPremium, isEntitlementLoaded } = usePremium();
  const { t } = useTranslation();

  useFocusEffect(
    useCallback(() => {
      async function fetchAccounts() {
        try {
          const allAccounts = await getAccounts();
          setAccountsList(allAccounts);
          // Rates load asynchronously; when they arrive the converted
          // total re-renders with correct cross-currency sums.
          const rates = await getLatestRates();
          setRatesCache(rates);
        } catch (error) {
          console.error("Error fetching accounts:", error);
        } finally {
          setLoading(false);
        }
      }
      fetchAccounts();
    }, [])
  );

  // Convert an amount from an account/transaction currency to the app's
  // main currency using the latest cached rates (identity when same code).
  const convertToMain = (amount: number, fromCurrency: string): number => {
    if (!ratesCache || fromCurrency === currencyCode) return amount;
    return convertWithRates(amount, fromCurrency, currencyCode, ratesCache.rates, ratesCache.base);
  };

  // Sum every account in the main currency, converting from each
  // account's own currency at current rates.
  const totalAssetsInMain = accountsList.reduce(
    (sum: number, acc: Account) => sum + convertToMain(acc.balance, acc.currency),
    0,
  );

  // The card can display the total in its own currency; when the override
  // matches the main currency (or is unset) no extra conversion is needed.
  const totalAssets =
    !totalAssetsCurrencyCode || totalAssetsCurrencyCode === currencyCode
      ? totalAssetsInMain
      : (ratesCache
          ? convertWithRates(totalAssetsInMain, currencyCode, totalAssetsCurrencyCode, ratesCache.rates, ratesCache.base)
          : totalAssetsInMain);

  if (loading) {
    return (
      <View className={`flex-1 items-center justify-center ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <ActivityIndicator size="large" color="#FFB800" />
      </View>
    );
  }

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"}`}
      edges={isLargeScreen ? ["top", "right", "bottom"] : undefined}
    >
      {/* Header */}
      <View className="px-4 py-4">
        <View className="flex-row justify-between items-center">
          <Text
            className={`text-2xl font-bold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
          >
            {t("accounts.title")}
          </Text>
          <View className="flex-row items-center">
            <Pressable
              onPress={() => {
                if (!isEntitlementLoaded) return;
                router.push(totalStatsDestination(isPremium));
              }}
              className="p-2 mr-1"
            >
              <BarChart3
                size={24}
                color={isDark ? "#F9FAFB" : "#212226"}
              />
            </Pressable>
            <Pressable
              onPress={() => setMenuVisible(!menuVisible)}
              className="p-2"
            >
              <Text
                className={`text-2xl ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              >
                ⋮
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Kebab Menu Dropdown */}
      {menuVisible && (
        <View
          className={`absolute right-4 top-20 rounded-lg shadow-lg z-10 py-2 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
        >
          <Pressable
            onPress={() => {
              setMenuVisible(false);
              router.push("/configuration/add-account");
            }}
            className="px-4 py-3"
          >
            <Text
              className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            >
              {t("accounts.addAccount")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuVisible(false);
              router.push("/configuration/delete-account");
            }}
            className="px-4 py-3"
          >
            <Text
              className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            >
              {t("accounts.deleteAccount")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuVisible(false);
              router.push("/configuration/reorder-accounts");
            }}
            className="px-4 py-3"
          >
            <Text
              className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
            >
              {t("accounts.reorderAccounts")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuVisible(false);
              router.push("/configuration/total-assets-currency");
            }}
            className="px-4 py-3"
          >
            <View className="flex-row items-center justify-between">
              <Text
                className={`${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              >
                {t("accounts.totalAssetsCurrency")}
              </Text>
              <View className="flex-row items-center ml-3">
                <Text
                  className={`mr-2 ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
                >
                  {getCurrencySymbol(totalAssetsCurrencyCode ?? currencyCode)}
                </Text>
                <Globe size={18} color={isDark ? "#F9FAFB" : "#212226"} />
              </View>
            </View>
          </Pressable>
        </View>
      )}

      {/* Total Assets */}
      <View className="px-4 mb-4">
        <View className="bg-cheddar-yellow rounded-xl p-6 shadow-sm">
          <Text className="text-cheddar-dark text-sm font-medium">
            {t("accounts.totalAssets")}
          </Text>
          <Text className="text-cheddar-dark text-3xl font-bold mt-1">
            {totalAssetsCurrencySymbol} {formatNumber(totalAssets)}
          </Text>
        </View>
      </View>

      {/* Accounts List */}
      <FlatList
        data={accountsList}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4"
        renderItem={({ item }) => {
          return (
            <Pressable
              onPress={() =>
                router.push(`/configuration/edit-account?id=${item.id}`)
              }
              className={`rounded-xl p-4 mb-3 flex-row items-center shadow-sm ${isDark ? "bg-[#26282D]" : "bg-white"}`}
            >
              {showIcons && (
                <View
                  className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${isDark ? "bg-gray-700" : "bg-cheddar-light"}`}
                >
                  {renderAccountIcon(item.icon || "wallet", 24, isDark ? "#F9FAFB" : "#212226", showIcons)}
                </View>
              )}
              <View className="flex-1">
                <Text
                  className={`text-lg font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                >
                  {item.name}
                </Text>
                {item.description && (
                  <Text
                    className={`text-sm ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
                  >
                    {item.description}
                  </Text>
                )}
              </View>
              <Text
                className={`text-lg font-semibold ${item.balance >= 0 ? "text-cheddar-income" : "text-cheddar-expense"}`}
              >
                {getCurrencySymbol(item.currency)} {formatNumber(item.balance)}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text
              className={`text-lg ${isDark ? "text-gray-400" : "text-cheddar-gray"}`}
            >
              {t("accounts.noAccounts")}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}