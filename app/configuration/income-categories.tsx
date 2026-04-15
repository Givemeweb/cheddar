import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, StopCircle, LucideIcon } from 'lucide-react-native';
import {
  getCategoriesByType,
  deleteCategory,
  Category,
} from '@/src/db/storage';

// Available icons for categories
const categoryIcons: Record<string, LucideIcon> = {
  'trending-up': require('lucide-react-native').TrendingUp,
  'gift': require('lucide-react-native').Gift,
  'briefcase': require('lucide-react-native').Briefcase,
  'wallet': require('lucide-react-native').Wallet,
  'piggy-bank': require('lucide-react-native').PiggyBank,
};

export default function IncomeCategoriesScreen() {
  const router = useRouter();
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

  const renderIcon = (iconName: string) => {
    const IconComponent = categoryIcons[iconName];
    if (IconComponent) {
      return <IconComponent size={22} color="#10B981" />;
    }
    return <StopCircle size={22} color="#10B981" />;
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-cheddar-light">
        <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-200">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-cheddar-yellow text-lg font-medium">Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-cheddar-dark">
            Income Categories
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
            <Text className="text-gray-500 text-center">
              No income categories yet.{'\n'}Tap the + button to add one.
            </Text>
          </View>
        ) : (
          <View className="bg-white rounded-xl overflow-hidden">
            {categories.map((category, index) => (
              <Pressable
                key={category.id}
                className={`flex-row items-center justify-between p-4 ${
                  index > 0 ? 'border-t border-gray-100' : ''
                }`}
                style={({ pressed }) => [
                  pressed && { backgroundColor: '#F3F4F6' },
                ]}
              >
                <View className="flex-row items-center flex-1">
                  <View className="mr-3">
                    {renderIcon(category.icon)}
                  </View>
                  <Text className="text-lg text-cheddar-dark">
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