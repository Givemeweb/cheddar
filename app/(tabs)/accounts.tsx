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
import { getAccounts, Account } from "../../src/db/storage";
import { useTheme } from "../../src/components/ThemeProvider";

export default function AccountsScreen() {
  const router = useRouter();
  const [accountsList, setAccountsList] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const { isDark } = useTheme();
  const { t } = useTranslation();

  useFocusEffect(
    useCallback(() => {
      async function fetchAccounts() {
        try {
          const allAccounts = await getAccounts();
          setAccountsList(allAccounts);
        } catch (error) {
          console.error("Error fetching accounts:", error);
        } finally {
          setLoading(false);
        }
      }
      fetchAccounts();
    }, [])
  );

  const totalAssets = accountsList.reduce((sum, acc) => sum + acc.balance, 0);

  if (loading) {
    return (
      <View className={`flex-1 items-center justify-center ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <ActivityIndicator size="large" color="#FFB800" />
      </View>
    );
  }

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}
      edges={isLargeScreen ? ["top", "right", "bottom"] : undefined}
    >
      {/* Header */}
      <View className="px-4 py-4">
        <View className="flex-row justify-between items-center">
          <Text className={`text-2xl font-bold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>{t('accounts.title')}</Text>
          <Pressable
            onPress={() => setMenuVisible(!menuVisible)}
            className="p-2"
          >
            <Text className={`text-2xl ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>⋮</Text>
          </Pressable>
        </View>
      </View>

      {/* Kebab Menu Dropdown */}
      {menuVisible && (
        <View className={`absolute right-4 top-20 rounded-lg shadow-lg z-10 py-2 ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}>
          <Pressable
            onPress={() => {
              setMenuVisible(false);
              router.push("/configuration/add-account");
            }}
            className="px-4 py-3"
          >
            <Text className={`${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>{t('accounts.addAccount')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuVisible(false);
              router.push("/configuration/delete-account");
            }}
            className="px-4 py-3"
          >
            <Text className={`${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>{t('accounts.deleteAccount')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuVisible(false);
              router.push("/configuration/reorder-accounts");
            }}
            className="px-4 py-3"
          >
            <Text className={`${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>{t('accounts.reorderAccounts')}</Text>
          </Pressable>
        </View>
      )}

      {/* Total Assets */}
      <View className="px-4 mb-4">
        <View className="bg-cheddar-yellow rounded-xl p-6 shadow-sm">
          <Text className="text-cheddar-dark text-sm font-medium">
            {t('accounts.totalAssets')}
          </Text>
          <Text className="text-cheddar-dark text-3xl font-bold mt-1">
            €{totalAssets.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Accounts List */}
      <FlatList
        data={accountsList}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/configuration/edit-account?id=${item.id}`)}
            className={`rounded-xl p-4 mb-3 flex-row items-center shadow-sm ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}
          >
            <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${isDark ? 'bg-gray-700' : 'bg-cheddar-light'}`}>
              <Text className="text-2xl">💰</Text>
            </View>
            <View className="flex-1">
              <Text className={`text-lg font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
                {item.name}
              </Text>
              {item.description && (
                <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-cheddar-gray'}`}>
                  {item.description}
                </Text>
              )}
            </View>
            <Text
              className={`text-lg font-semibold ${item.balance >= 0 ? "text-cheddar-income" : "text-cheddar-expense"}`}
            >
              €{item.balance.toFixed(2)}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text className={`text-lg ${isDark ? 'text-gray-400' : 'text-cheddar-gray'}`}>{t('accounts.noAccounts')}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}