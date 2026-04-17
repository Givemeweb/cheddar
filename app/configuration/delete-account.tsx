import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  Wallet,
  PiggyBank,
  CreditCard,
  Landmark,
  Building2,
  CircleDollarSign,
  Banknote,
  LucideIcon,
} from 'lucide-react-native';
import { getAccounts, deleteAccount, Account } from '@/src/db/storage';
import { useTheme } from '@/src/components/ThemeProvider';
import { useTranslation } from 'react-i18next';

const iconMap: Record<string, LucideIcon> = {
  'wallet': Wallet,
  'piggy-bank': PiggyBank,
  'credit-card': CreditCard,
  'landmark': Landmark,
  'building-2': Building2,
  'circle-dollar-sign': CircleDollarSign,
  'banknote': Banknote,
};

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { isDark, showIcons } = useTheme();
  const { t } = useTranslation();
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
        t('accounts.deleteWebConfirm', { name: account.name })
      );
      if (confirmed) {
        performDelete(account);
      }
    } else {
      Alert.alert(
        t('accounts.deleteConfirmTitle'),
        t('accounts.deleteConfirmMessage', { name: account.name }),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => performDelete(account),
          },
        ]
      );
    }
  };

  if (loading) {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <View className={`flex-row items-center px-4 py-3 border-b ${isDark ? 'bg-[#26282D] border-gray-700' : 'bg-white border-gray-200'}`}>
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-cheddar-yellow text-lg font-medium">{t('common.back')}</Text>
          </TouchableOpacity>
          <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
            {t('accounts.deleteAccount')}
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
      <View className={`flex-row items-center justify-between px-4 py-3 border-b ${isDark ? 'bg-[#26282D] border-gray-700' : 'bg-white border-gray-200'}`}>
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
          {t('accounts.deleteAccount')}
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {accounts.length === 0 ? (
          <View className="flex-1 items-center justify-center py-12">
            <Text className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('accounts.noAccountsDelete')}
            </Text>
          </View>
        ) : (
          <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}>
            {accounts.map((account, index) => (
              <View
                key={account.id}
                className={`flex-row items-center justify-between p-4 ${
                  index > 0 ? (isDark ? 'border-t border-gray-700' : 'border-t border-gray-100') : ''
                }`}
              >
                <View className="flex-row items-center flex-1">
                  {showIcons && (
                    <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${isDark ? 'bg-gray-700' : 'bg-cheddar-light'}`}>
                      {(() => {
                        const IconComponent = iconMap[account.icon || 'wallet'];
                        return IconComponent ? (
                          <IconComponent size={20} color={isDark ? "#F9FAFB" : "#212226"} />
                        ) : null;
                      })()}
                    </View>
                  )}
                  <View>
                    <Text className={`text-lg ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
                      {account.name}
                    </Text>
                    {account.description && (
                      <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {account.description}
                      </Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(account)}
                  activeOpacity={0.7}
                  className={`px-4 py-2 rounded-lg ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}
                >
                  <Text className="text-red-500 font-medium">{t('common.delete')}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <Text className={`text-sm text-center mt-4 px-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {t('accounts.deleteInfo')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}