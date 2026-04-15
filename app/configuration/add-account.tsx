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

export default function AddAccountScreen() {
  const router = useRouter();
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
    <SafeAreaView className="flex-1 bg-cheddar-light">
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">Cancel</Text>
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-cheddar-dark">
          Add Account
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
            placeholder="Account name"
            className="text-lg text-cheddar-dark py-2 border-b border-gray-200"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View className="bg-white rounded-xl p-4">
          <Text className="text-sm font-medium text-gray-500 uppercase mb-2">
            Description (optional)
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add a description"
            className="text-lg text-cheddar-dark py-2 border-b border-gray-200"
            placeholderTextColor="#9CA3AF"
            multiline
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}