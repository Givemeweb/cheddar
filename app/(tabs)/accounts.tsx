import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { getAccounts, Account } from "../../src/db/storage";

export default function AccountsScreen() {
  const router = useRouter();
  const [accountsList, setAccountsList] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

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
      <View className="flex-1 items-center justify-center bg-cheddar-light">
        <ActivityIndicator size="large" color="#FFB800" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cheddar-light">
      {/* Header */}
      <View className="px-4 py-4">
        <View className="flex-row justify-between items-center">
          <Text className="text-2xl font-bold text-cheddar-dark">Accounts</Text>
          <Pressable
            onPress={() => setMenuVisible(!menuVisible)}
            className="p-2"
          >
            <Text className="text-2xl">⋮</Text>
          </Pressable>
        </View>
      </View>

      {/* Kebab Menu Dropdown */}
      {menuVisible && (
        <View className="absolute right-4 top-20 bg-white rounded-lg shadow-lg z-10 py-2">
          <Pressable
            onPress={() => {
              setMenuVisible(false);
              router.push("/configuration/add-account");
            }}
            className="px-4 py-3"
          >
            <Text className="text-cheddar-dark">Add Account</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuVisible(false);
              router.push("/configuration/delete-account");
            }}
            className="px-4 py-3"
          >
            <Text className="text-cheddar-dark">Delete Account</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuVisible(false);
              router.push("/configuration/reorder-accounts");
            }}
            className="px-4 py-3"
          >
            <Text className="text-cheddar-dark">Reorder Accounts</Text>
          </Pressable>
        </View>
      )}

      {/* Total Assets */}
      <View className="px-4 mb-4">
        <View className="bg-cheddar-yellow rounded-xl p-6 shadow-sm">
          <Text className="text-cheddar-dark text-sm font-medium">
            Total Assets
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
          <View className="bg-white rounded-xl p-4 mb-3 flex-row items-center shadow-sm">
            <View className="w-12 h-12 bg-cheddar-light rounded-full items-center justify-center mr-4">
              <Text className="text-2xl">💰</Text>
            </View>
            <View className="flex-1">
              <Text className="text-lg font-semibold text-cheddar-dark">
                {item.name}
              </Text>
              {item.description && (
                <Text className="text-sm text-cheddar-gray">
                  {item.description}
                </Text>
              )}
            </View>
            <Text
              className={`text-lg font-semibold ${item.balance >= 0 ? "text-cheddar-income" : "text-cheddar-expense"}`}
            >
              €{item.balance.toFixed(2)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-cheddar-gray text-lg">No accounts yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}