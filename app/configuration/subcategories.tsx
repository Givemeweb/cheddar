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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  Plus,
  Trash2,
} from 'lucide-react-native';
import { useTheme } from '@/src/components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { getSubcategoriesEnabled, getSubcategories, addSubcategory, deleteSubcategory, getCategoryById } from '@/src/db';
import { Category } from '@/src/db/storage';
import { trackEvent } from '@/src/lib/analytics';

interface Subcategory {
  id: string;
  name: string;
  categoryId: string;
}

export default function SubcategoriesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const categoryId = params.categoryId as string;
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const [category, setCategory] = useState<Category | null>(null);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [subcategoriesEnabled, setSubcategoriesEnabled] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);

    const enabled = await getSubcategoriesEnabled();
    setSubcategoriesEnabled(enabled);

    if (!enabled) {
      setLoading(false);
      return;
    }

    if (categoryId) {
      const cat = await getCategoryById(categoryId);
      setCategory(cat || null);

      const subs = await getSubcategories(categoryId);
      setSubcategories(subs);
    }

    setLoading(false);
  }, [categoryId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleAddSubcategory = async () => {
    if (!newSubcategoryName.trim() || !categoryId) return;

    await addSubcategory(categoryId, newSubcategoryName.trim());
    trackEvent('subcategories.add');
    setNewSubcategoryName('');
    setShowAddModal(false);

    const subs = await getSubcategories(categoryId);
    setSubcategories(subs);
  };

  const handleDeleteSubcategory = async (subcategory: Subcategory) => {
    if (!categoryId) return;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        t('categories.deleteConfirmMessage', { name: subcategory.name })
      );
      if (confirmed) {
        try {
          await deleteSubcategory(subcategory.id);
          setSubcategories(prev => prev.filter(s => s.id !== subcategory.id));
          trackEvent('subcategories.deleted');
        } catch (error) {
          console.error('Failed to delete subcategory:', error);
        }
      } else {
        trackEvent('subcategories.delete_cancel');
      }
    } else {
      Alert.alert(
        t('categories.deleteConfirmTitle'),
        t('categories.deleteConfirmMessage', { name: subcategory.name }),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
            onPress: () => trackEvent('subcategories.delete_cancel'),
          },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              await deleteSubcategory(subcategory.id);
              setSubcategories(prev => prev.filter(s => s.id !== subcategory.id));
              trackEvent('subcategories.deleted');
            },
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
            {t('categories.subcategories')}
          </Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FFB800" />
        </View>
      </SafeAreaView>
    );
  }

  if (!subcategoriesEnabled) {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <View className={`flex-row items-center px-4 py-3 border-b ${isDark ? 'bg-[#26282D] border-gray-700' : 'bg-white border-gray-200'}`}>
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Text className="text-cheddar-yellow text-lg font-medium">{t('common.back')}</Text>
          </TouchableOpacity>
          <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
            {t('categories.subcategories')}
          </Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('categories.subcategoriesDesc')}
          </Text>
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
          {category?.name || t('categories.subcategories')}
        </Text>
        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          className="p-1"
        >
          <Plus size={24} color="#FFB800" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {subcategories.length === 0 ? (
          <View className="flex-1 items-center justify-center py-12">
            <Text className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('categories.noSubcategories')}
            </Text>
          </View>
        ) : (
          <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}>
            {subcategories.map((subcategory, index) => (
              <View
                key={subcategory.id}
                className={`flex-row items-center justify-between p-4 ${
                  index > 0 ? (isDark ? 'border-t border-gray-700' : 'border-t border-gray-100') : ''
                }`}
              >
                <Text className={`text-lg flex-1 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
                  {subcategory.name}
                </Text>
                <TouchableOpacity
                  onPress={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteSubcategory(subcategory);
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

      {/* Add Subcategory Modal */}
      {showAddModal && (
        <View className="absolute inset-0 bg-black/50 flex-1">
          <Pressable
            className="flex-1"
            onPress={() => setShowAddModal(false)}
          />
          <View className={`absolute bottom-0 left-0 right-0 ${isDark ? 'bg-[#26282D]' : 'bg-white'} rounded-t-2xl p-4`}>
            <Text className={`text-lg font-semibold mb-4 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
              {t('categories.addSubcategory')}
            </Text>
            <TextInput
              className={`p-3 rounded-lg mb-4 ${isDark ? 'bg-[#1a1b1e] text-white' : 'bg-gray-100 text-cheddar-dark'}`}
              placeholder={t('categories.subcategoryName')}
              placeholderTextColor={isDark ? '#9CA3AF' : '#6B7280'}
              value={newSubcategoryName}
              onChangeText={setNewSubcategoryName}
              autoFocus
            />
            <View className="flex-row gap-2">
              <TouchableOpacity
                className={`flex-1 p-3 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}
                onPress={() => setShowAddModal(false)}
              >
                <Text className={`text-center font-medium ${isDark ? 'text-white' : 'text-cheddar-dark'}`}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 p-3 rounded-lg bg-cheddar-yellow"
                onPress={handleAddSubcategory}
              >
                <Text className="text-center font-medium text-cheddar-dark">
                  {t('common.add')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}