import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  Plus,
  Trash2,
  Circle,
  TrendingUp,
  Gift,
  Briefcase,
  Wallet,
  PiggyBank,
  Utensils,
  Car,
  ShoppingCart,
  Film,
  Receipt,
  HeartPulse,
  Laptop,
} from 'lucide-react-native';
import {
  getCategoriesByType,
  deleteCategory,
  Category,
} from '@/src/db/storage';
import { useTheme } from '@/src/components/ThemeProvider';
import { useTranslation } from 'react-i18next';

// Map icon names to Lucide components
const iconMap: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  'trending-up': TrendingUp,
  'gift': Gift,
  'briefcase': Briefcase,
  'wallet': Wallet,
  'piggy-bank': PiggyBank,
  'utensils': Utensils,
  'car': Car,
  'shopping-cart': ShoppingCart,
  'film': Film,
  'receipt': Receipt,
  'heart-pulse': HeartPulse,
  'laptop': Laptop,
};

export default function IncomeCategoriesScreen() {
  const router = useRouter();
  const { isDark, showIcons } = useTheme();
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    const cats = await getCategoriesByType('income');
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

  const renderIcon = (iconName: string, color: string = "#10B981") => {
    if (!showIcons) return null;
    const IconComponent = iconMap[iconName];
    if (IconComponent) {
      return <IconComponent size={22} color={color} />;
    }
    return <Circle size={22} color={color} />;
  };

  if (loading) {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <View className={`flex-row items-center px-4 py-3 border-b ${isDark ? 'bg-[#26282D] border-gray-700' : 'bg-white border-gray-200'}`}>
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-cheddar-yellow text-lg font-medium">{t('common.back')}</Text>
          </TouchableOpacity>
          <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
            {t('categories.incomeCategories')}
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
          {t('categories.incomeCategories')}
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/configuration/add-income-category' as never)}
          className="p-1"
        >
          <Plus size={24} color="#FFB800" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {categories.length === 0 ? (
          <View className="flex-1 items-center justify-center py-12">
            <Text className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('categories.noIncomeCategories')}
            </Text>
          </View>
        ) : (
          <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}>
            {categories.map((category, index) => (
              <View
                key={category.id}
                className={`flex-row items-center justify-between p-4 ${
                  index > 0 ? (isDark ? 'border-t border-gray-700' : 'border-t border-gray-100') : ''
                }`}
              >
                <Pressable
                  onPress={() => router.push(`/configuration/edit-category?id=${category.id}` as never)}
                  className="flex-row items-center flex-1"
                >
                  <View className="mr-3">
                    {renderIcon(category.icon)}
                  </View>
                  <Text className={`text-lg ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
                    {category.name}
                  </Text>
                </Pressable>
                <TouchableOpacity
                  onPress={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete(category);
                  }}
                  className="p-2"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Trash2 size={22} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}