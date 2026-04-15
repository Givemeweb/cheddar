import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getAccounts, reorderAccounts, Account } from '@/src/db/storage';
import { GripVertical } from 'lucide-react-native';
import { useTheme } from '@/src/components/ThemeProvider';

export default function ReorderAccountsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const accs = await getAccounts();
    setAccounts(accs);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAccounts();
      setHasChanges(false);
    }, [loadAccounts])
  );

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newAccounts = [...accounts];
    [newAccounts[index - 1], newAccounts[index]] = [newAccounts[index], newAccounts[index - 1]];
    setAccounts(newAccounts);
    setHasChanges(true);
  };

  const moveDown = (index: number) => {
    if (index === accounts.length - 1) return;
    const newAccounts = [...accounts];
    [newAccounts[index], newAccounts[index + 1]] = [newAccounts[index + 1], newAccounts[index]];
    setAccounts(newAccounts);
    setHasChanges(true);
  };

  const handleSave = async () => {
    const accountIds = accounts.map(a => a.id);
    await reorderAccounts(accountIds);
    router.back();
  };

  const renderItem = ({ item, index }: { item: Account; index: number }) => (
    <View className={`flex-row items-center px-4 py-3 border-b ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
      <GripVertical size={20} color="#9CA3AF" />
      <View className={`w-10 h-10 rounded-full items-center justify-center mx-3 ${isDark ? 'bg-gray-700' : 'bg-cheddar-light'}`}>
        <Text className="text-xl">💰</Text>
      </View>
      <View className="flex-1">
        <Text className={`text-lg ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>{item.name}</Text>
        {item.description && (
          <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.description}</Text>
        )}
      </View>
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => moveUp(index)}
          disabled={index === 0}
          className={`p-2 rounded ${index === 0 ? 'opacity-30' : ''}`}
        >
          <Text className="text-cheddar-yellow text-lg">↑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => moveDown(index)}
          disabled={index === accounts.length - 1}
          className={`p-2 rounded ${index === accounts.length - 1 ? 'opacity-30' : ''}`}
        >
          <Text className="text-cheddar-yellow text-lg">↓</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <View className={`flex-row items-center px-4 py-3 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-cheddar-yellow text-lg font-medium">Cancel</Text>
          </TouchableOpacity>
          <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
            Reorder Accounts
          </Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FFB800" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
      <View className={`flex-row items-center justify-between px-4 py-3 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-cheddar-yellow text-lg font-medium">Cancel</Text>
        </TouchableOpacity>
        <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
          Reorder Accounts
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!hasChanges}
        >
          <Text
            className={`text-lg font-medium ${
              hasChanges ? 'text-cheddar-yellow' : 'text-gray-300'
            }`}
          >
            Save
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 16 }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-12">
            <Text className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              No accounts to reorder.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}