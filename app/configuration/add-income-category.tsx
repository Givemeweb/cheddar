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
  LucideIcon,
} from 'lucide-react-native';
import { addCategory } from '@/src/db/storage';

type IconOption = {
  name: string;
  icon: LucideIcon;
};

const iconOptions: IconOption[] = [
  { name: 'trending-up', icon: TrendingUp },
  { name: 'gift', icon: Gift },
  { name: 'briefcase', icon: Briefcase },
  { name: 'wallet', icon: Wallet },
  { name: 'piggy-bank', icon: PiggyBank },
];

export default function AddIncomeCategoryScreen() {
  const router = useRouter();
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
        type: 'income',
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
          isSelected ? 'bg-cheddar-yellow' : 'bg-gray-100'
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
    <SafeAreaView className="flex-1 bg-cheddar-light">
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">Cancel</Text>
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-cheddar-dark">
          Add Income Category
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
        <View className="bg-white rounded-xl p-4 mb-4">
          <Text className="text-sm font-medium text-gray-500 uppercase mb-2">
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Category name"
            className="text-lg text-cheddar-dark py-2 border-b border-gray-200"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View className="bg-white rounded-xl p-4">
          <Text className="text-sm font-medium text-gray-500 uppercase mb-3">
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