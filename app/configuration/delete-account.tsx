import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getAccounts, deleteAccount, Account } from '@/src/db/storage';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const accs = await getAccounts();
    setAccounts(accs);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAccounts();
    }, [loadAccounts])
  );

  const performDelete = async (account: Account) => {
    try {
      await deleteAccount(account.id);
      setAccounts(prev => prev.filter(a => a.id !== account.id));
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  };

  const handleDelete = (account: Account) => {
    if (Platform.OS === 'web') {
      // Use browser confirm on web
      const confirmed = window.confirm(
        `Are you sure you want to delete "${account.name}"?\n\nExisting transactions with this account will not be affected.`
      );
      if (confirmed) {
        performDelete(account);
      }
    } else {
      Alert.alert(
        'Delete Account',
        `Are you sure you want to delete "${account.name}"?\n\nExisting transactions with this account will not be affected. They will still be visible in your transaction history.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => performDelete(account),
          },
        ]
      );
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-cheddar-light">
        <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-200">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-cheddar-yellow text-lg font-medium">Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-cheddar-dark">
            Delete Account
          </Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cheddar-light">
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">Back</Text>
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-cheddar-dark">
          Delete Account
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {accounts.length === 0 ? (
          <View className="flex-1 items-center justify-center py-12">
            <Text className="text-gray-500 text-center">
              No accounts to delete.
            </Text>
          </View>
        ) : (
          <View className="bg-white rounded-xl overflow-hidden">
            {accounts.map((account, index) => (
              <View
                key={account.id}
                className={`flex-row items-center justify-between p-4 ${
                  index > 0 ? 'border-t border-gray-100' : ''
                }`}
              >
                <View className="flex-row items-center flex-1">
                  <View className="w-10 h-10 bg-cheddar-light rounded-full items-center justify-center mr-3">
                    <Text className="text-xl">💰</Text>
                  </View>
                  <View>
                    <Text className="text-lg text-cheddar-dark">
                      {account.name}
                    </Text>
                    {account.description && (
                      <Text className="text-sm text-gray-500">
                        {account.description}
                      </Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(account)}
                  activeOpacity={0.7}
                  className="bg-red-50 px-4 py-2 rounded-lg"
                >
                  <Text className="text-red-500 font-medium">Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <Text className="text-gray-500 text-sm text-center mt-4 px-4">
          Transactions associated with deleted accounts will remain in your history.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}