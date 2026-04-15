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
import {
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
  LucideIcon,
} from 'lucide-react-native';
import { addCategory } from '@/src/db/storage';
import { useTheme } from '@/src/components/ThemeProvider';

type IconOption = {
  name: string;
  icon: LucideIcon;
};

// All available icons for categories
const iconOptions: IconOption[] = [
  { name: 'trending-up', icon: TrendingUp },
  { name: 'gift', icon: Gift },
  { name: 'briefcase', icon: Briefcase },
  { name: 'wallet', icon: Wallet },
  { name: 'piggy-bank', icon: PiggyBank },
  { name: 'utensils', icon: Utensils },
  { name: 'car', icon: Car },
  { name: 'shopping-cart', icon: ShoppingCart },
  { name: 'film', icon: Film },
  { name: 'receipt', icon: Receipt },
  { name: 'heart-pulse', icon: HeartPulse },
  { name: 'laptop', icon: Laptop },
];

export default function AddExpenseCategoryScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
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
      <View className={`flex-row items-center justify-between px-4 py-3 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">Cancel</Text>
        </TouchableOpacity>
        <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
          Add Expense Category
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
            Save
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        <View className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <Text className={`text-sm font-medium uppercase mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Category name"
            className={`text-lg py-2 border-b ${isDark ? 'text-cheddar-light border-gray-700' : 'text-cheddar-dark border-gray-200'}`}
            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
          />
        </View>

        <View className={`rounded-xl p-4 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <Text className={`text-sm font-medium uppercase mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Icon
          </Text>
          <View className="flex-row flex-wrap">
            {iconOptions.map(renderIconOption)}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}