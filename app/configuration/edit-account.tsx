import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getAccountById, updateAccount } from '@/src/db/storage';

export default function EditAccountScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAccount() {
      if (!id) return;
      const account = await getAccountById(id);
      if (account) {
        setName(account.name);
        setDescription(account.description || '');
      }
      setLoading(false);
    }
    loadAccount();
  }, [id]);

  const handleSave = async () => {
    if (!name.trim() || !id) {
      return;
    }

    setSaving(true);
    try {
      await updateAccount(id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      router.back();
    } catch (error) {
      console.error('Failed to update account:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cheddar-light">
        <ActivityIndicator size="large" color="#FFB800" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cheddar-light">
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">Cancel</Text>
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-cheddar-dark">
          Edit Account
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