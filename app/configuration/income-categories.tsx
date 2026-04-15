import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  Plus,
  StopCircle,
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
  const { isDark } = useTheme();
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
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${category.name}"?\n\nExisting transactions with this category will not be affected.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCategory(category.id);
            setCategories(prev => prev.filter(c => c.id !== category.id));
          },
        },
      ]
    );
  };

  const renderIcon = (iconName: string, color: string = "#10B981") => {
    const IconComponent = iconMap[iconName];
    if (IconComponent) {
      return <IconComponent size={22} color={color} />;
    }
    return <StopCircle size={22} color={color} />;
  };

  if (loading) {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <View className={`flex-row items-center px-4 py-3 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-cheddar-yellow text-lg font-medium">Back</Text>
          </TouchableOpacity>
          <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
            Income Categories
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
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">Back</Text>
        </TouchableOpacity>
        <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
          Income Categories
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
              No income categories yet.{'\n'}Tap the + button to add one.
            </Text>
          </View>
        ) : (
          <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            {categories.map((category, index) => (
              <Pressable
                key={category.id}
                className={`flex-row items-center justify-between p-4 ${
                  index > 0 ? (isDark ? 'border-t border-gray-700' : 'border-t border-gray-100') : ''
                }`}
              >
                <View className="flex-row items-center flex-1">
                  <View className="mr-3">
                    {renderIcon(category.icon)}
                  </View>
                  <Text className={`text-lg ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
                    {category.name}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(category)}
                  className="p-2"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <StopCircle size={22} color="#EF4444" />
                </TouchableOpacity>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}