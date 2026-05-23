import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LucideIcon } from 'lucide-react-native';
import { addCategory } from '@/src/db/storage';
import { categoryIconOptions } from '@/src/components/categoryIcons';
import { useTheme } from '@/src/components/ThemeProvider';
import { useTranslation } from 'react-i18next';

type IconOption = {
  name: string;
  icon: LucideIcon;
};

export default function AddExpenseCategoryScreen() {
  const router = useRouter();
  const { isDark, showIcons } = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('trending-up');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }

    setSaving(true);
    try {
      await addCategory({
        name: name.trim(),
        icon: selectedIcon,
        type: 'expense',
      });
      router.back();
    } catch (error) {
      console.error('Failed to save category:', error);
    } finally {
      setSaving(false);
    }
  };

  const renderIconOption = (option: IconOption) => {
    const IconComponent = option.icon;
    const isSelected = selectedIcon === option.name;

    return (
      <Pressable
        key={option.name}
        onPress={() => setSelectedIcon(option.name)}
        className={`w-16 h-16 rounded-xl items-center justify-center mr-3 mb-3 ${
          isSelected ? 'bg-cheddar-yellow' : (isDark ? 'bg-gray-700' : 'bg-gray-100')
        }`}
      >
        <IconComponent
          size={28}
          color={isSelected ? '#FFFFFF' : '#6B7280'}
        />
      </Pressable>
    );
  };

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
      <View className={`flex-row items-center justify-between px-4 py-3 border-b ${isDark ? 'bg-[#26282D] border-gray-700' : 'bg-white border-gray-200'}`}>
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
          {t('categories.addExpenseCategory')}
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
        <View className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}>
          <Text className={`text-sm font-medium uppercase mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('categories.name')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('categories.categoryName')}
            className={`text-lg py-2 border-b ${isDark ? 'text-cheddar-light border-gray-700' : 'text-cheddar-dark border-gray-200'}`}
            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
          />
        </View>

        {showIcons && (
          <View className={`rounded-xl p-4 ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}>
            <Text className={`text-sm font-medium uppercase mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('categories.icon')}
            </Text>
            <View className="flex-row flex-wrap">
              {categoryIconOptions.map(renderIconOption)}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}