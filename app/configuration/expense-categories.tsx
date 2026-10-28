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
  Plus,
  Circle,
} from 'lucide-react-native';
import { categoryIconMap } from '@/src/components/categoryIcons';
import {
  getCategoriesByType,
  deleteCategory,
  reorderCategories,
  Category,
} from '@/src/db/storage';
import { useTheme } from '@/src/components/ThemeProvider';
import { ToggleSwitch } from '@/src/components/ToggleSwitch';
import { DraggableCategoryList } from '@/src/components/DraggableCategoryList';
import { useTranslation } from 'react-i18next';

export default function ExpenseCategoriesScreen() {
  const router = useRouter();
  const { isDark, showIcons, subcategoriesEnabled, setSubcategoriesEnabledState } = useTheme();
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    const cats = await getCategoriesByType('expense');
    setCategories(cats);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );

  const handleDelete = (category: Category) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        t('categories.deleteConfirmMessage', { name: category.name })
      );
      if (confirmed) {
        deleteCategory(category.id);
        setCategories(prev => prev.filter(c => c.id !== category.id));
      }
    } else {
      Alert.alert(
        t('categories.deleteConfirmTitle'),
        t('categories.deleteConfirmMessage', { name: category.name }),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              await deleteCategory(category.id);
              setCategories(prev => prev.filter(c => c.id !== category.id));
            },
          },
        ]
      );
    }
  };

  const renderIcon = (iconName: string, color: string = "#EF4444") => {
    if (!showIcons) return null;
    const IconComponent = categoryIconMap[iconName];
    if (IconComponent) {
      return <IconComponent size={22} color={color} />;
    }
    return <Circle size={22} color={color} />;
  };

  const handleToggleSubcategories = async (value: boolean) => {
    await setSubcategoriesEnabledState(value);
  };

  if (loading) {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <View className={`flex-row items-center px-4 py-3 border-b ${isDark ? 'bg-[#26282D] border-gray-700' : 'bg-white border-gray-200'}`}>
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-cheddar-yellow text-lg font-medium">{t('common.back')}</Text>
          </TouchableOpacity>
          <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
            {t('categories.expenseCategories')}
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
          {t('categories.expenseCategories')}
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/configuration/add-expense-category' as never)}
          className="p-1"
        >
          <Plus size={24} color="#FFB800" />
        </TouchableOpacity>
      </View>

      {/* Subcategories Toggle */}
      <View className={`mx-4 mt-4 rounded-xl ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}>
        <View className="flex-row items-center justify-between p-4">
          <View className="flex-1 mr-4">
            <Text className={`text-base font-medium ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
              {t('categories.subcategories')}
            </Text>
            <Text className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('categories.subcategoriesDesc')}
            </Text>
          </View>
          <ToggleSwitch
            value={subcategoriesEnabled}
            onValueChange={handleToggleSubcategories}
          />
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {categories.length === 0 ? (
          <View className="flex-1 items-center justify-center py-12">
            <Text className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('categories.noExpenseCategories')}
            </Text>
          </View>
        ) : (
          <DraggableCategoryList
            categories={categories}
            isDark={isDark}
            subcategoriesEnabled={subcategoriesEnabled}
            renderIcon={renderIcon}
            onPressCategory={(category) => {
              if (subcategoriesEnabled) {
                router.push(`/configuration/subcategories?categoryId=${category.id}` as never);
              } else {
                router.push(`/configuration/edit-category?id=${category.id}` as never);
              }
            }}
            onDeleteCategory={handleDelete}
            onReorder={(next) => {
              setCategories(next);
              reorderCategories(next.map(c => c.id));
            }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}