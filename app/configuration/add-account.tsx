import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { addAccount } from '@/src/db/storage';
import { useTheme } from '@/src/components/ThemeProvider';
import { useTranslation } from 'react-i18next';

export default function AddAccountScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }

    setSaving(true);
    try {
      await addAccount({
        name: name.trim(),
        description: description.trim() || null,
      });
      router.back();
    } catch (error) {
      console.error('Failed to save account:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
      <View className={`flex-row items-center justify-between px-4 py-3 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
          {t('accounts.addAccount')}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!name.trim() || saving}
          className="px-2"
        >
          <Text
            className={`text-lg font-medium ${
              name.trim() && !saving ? 'text-cheddar-yellow' : 'text-gray-300'
            }`}
          >
            {t('common.save')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        <View className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <Text className={`text-sm font-medium uppercase mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('accounts.name')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('accounts.accountName')}
            className={`text-lg py-2 border-b ${isDark ? 'text-cheddar-light border-gray-700' : 'text-cheddar-dark border-gray-200'}`}
            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
          />
        </View>

        <View className={`rounded-xl p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <Text className={`text-sm font-medium uppercase mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('accounts.descriptionOptional')}
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('accounts.addDescriptionPlaceholder')}
            className={`text-lg py-2 border-b ${isDark ? 'text-cheddar-light border-gray-700' : 'text-cheddar-dark border-gray-200'}`}
            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
            multiline
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}