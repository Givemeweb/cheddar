import { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Upload, FileJson } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../src/components/ThemeProvider';
import { LimitReachedError } from '../src/db/storage';
import type { MMBakImportResult } from '../src/utils/mmbakImport';

// Platform-specific imports
// Note: We use require() directly as Metro bundler handles platform resolution
// Native (.native.ts) reads SQLite via expo-sqlite with URI strings
// Web (.web.ts) reads SQLite via sql.js with File objects

export default function BackupMMBakScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<'success' | 'error' | null>(null);
  const [importData, setImportData] = useState<MMBakImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showImportError = (error: unknown) => {
    if (error instanceof LimitReachedError) {
      router.push({ pathname: '/paywall', params: { reason: 'import' } });
      return;
    }
    setImportResult('error');
    setErrorMessage(error instanceof Error ? error.message : t('backup.importFailed'));
  };

  const handleImport = async () => {
    try {
      if (Platform.OS === 'web') {
        // Web: Use hidden file input
        if (fileInputRef.current) {
          fileInputRef.current.click();
        }
        return;
      }

      // Native: Use DocumentPicker
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset.uri) {
        throw new Error('No file selected');
      }

      setIsImporting(true);
      setImportResult(null);
      setImportData(null);
      setErrorMessage(null);

      // Validate file (throws with detailed error message)
      // @ts-ignore - Platform-specific module
      const { validateMMBakFile, importFromMMBak } = require('../src/utils/mmbakImport.native');
      await validateMMBakFile(asset.uri);

      // Import data
      const importResult = await importFromMMBak(asset.uri);
      setImportData(importResult);
      setImportResult('success');
    } catch (error) {
      console.error('Import error:', error);
      showImportError(error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleWebFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);
    setImportData(null);
    setErrorMessage(null);

    try {
      // Validate file (throws with detailed error message)
      // @ts-ignore - Platform-specific module
      const { validateMMBakFile, importFromMMBak } = require('../src/utils/mmbakImport.web');
      await validateMMBakFile(file);

      // Import data
      const importResult = await importFromMMBak(file);
      setImportData(importResult);
      setImportResult('success');
    } catch (error) {
      console.error('Import error:', error);
      showImportError(error);
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const successColor = '#10B981';
  const errorColor = '#EF4444';

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}
    >
      <View
        className={`flex-row items-center px-4 py-3 ${isDark ? 'bg-[#26282D] border-gray-700' : 'bg-white border-gray-200'} border-b`}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">
            {t('common.back')}
          </Text>
        </TouchableOpacity>
        <Text
          className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
        >
          {t('backup.importMMBak')}
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="px-4 pt-6 pb-6">
        <View
          className={`${isDark ? 'bg-[#26282D]' : 'bg-white'} rounded-xl p-4`}
        >
          <Text
            className={`text-base ${isDark ? 'text-gray-300' : 'text-gray-600'} leading-6`}
          >
            {t('backup.mmbakInfo')}
          </Text>
        </View>

        <View className="mt-4">
          <View
            className={`${isDark ? 'bg-[#26282D]' : 'bg-white'} rounded-xl p-4`}
          >
            <View className="flex-row items-center mb-2">
              <FileJson size={20} color={isDark ? '#F9FAFB' : '#212226'} />
              <Text
                className={`text-lg font-semibold ml-2 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
              >
                {t('backup.mmbakFormat')}
              </Text>
            </View>
            <Text
              className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} leading-5`}
            >
              {t('backup.mmbakFormatDesc')}
            </Text>
          </View>
        </View>

        {/* Web: Hidden file input */}
        {Platform.OS === 'web' && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".mmbak,.db,.sqlite,.sqlite3"
            style={{ display: 'none' }}
            onChange={handleWebFileSelect}
          />
        )}

        <View className="mt-6">
          <TouchableOpacity
            className={`flex-row items-center justify-center p-4 rounded-xl ${
              isImporting
                ? 'bg-cheddar-yellow/50'
                : 'bg-cheddar-yellow'
            }`}
            activeOpacity={0.7}
            onPress={handleImport}
            disabled={isImporting}
          >
            {isImporting ? (
              <ActivityIndicator size="small" color="#212226" />
            ) : (
              <>
                <Upload size={20} color="#212226" />
                <Text className="text-cheddar-dark text-lg font-semibold ml-2">
                  {t('backup.importMMBakButton')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {importResult === 'success' && importData && (
          <View
            className={`flex-row items-start mt-4 p-4 rounded-xl ${isDark ? 'bg-green-900/30' : 'bg-green-50'}`}
          >
            <CheckCircle size={22} color={successColor} />
            <View className="flex-1 ml-3">
              <Text className={`text-base font-medium ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                {t('backup.importSuccess')}
              </Text>
              <Text className={`mt-2 text-sm ${isDark ? 'text-green-300' : 'text-green-600'}`}>
                {t('backup.mmbakSummary', {
                  categories: importData.categories,
                  accounts: importData.accounts,
                  transactions: importData.transactions,
                })}
              </Text>
            </View>
          </View>
        )}

        {importResult === 'error' && (
          <View
            className={`flex-row items-start mt-4 p-4 rounded-xl ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}
          >
            <XCircle size={22} color={errorColor} />
            <View className="flex-1 ml-3">
              <Text className={`text-base ${isDark ? 'text-red-400' : 'text-red-700'}`}>
                {t('backup.importError')}
              </Text>
              {errorMessage && (
                <Text className={`mt-1 text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                  {errorMessage}
                </Text>
              )}
            </View>
          </View>
        )}

        <View className="mt-6">
          <View
            className={`${isDark ? 'bg-[#26282D]' : 'bg-white'} rounded-xl p-4`}
          >
            <Text
              className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} leading-5`}
            >
              {t('backup.mmbakWarning')}
            </Text>
          </View>
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}