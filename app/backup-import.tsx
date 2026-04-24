import { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Upload, FileArchive, Database, FileJson } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useTheme } from '../src/components/ThemeProvider';
import { importDatabaseFromZip, importDatabaseFromJson, ImportResult } from '../src/utils/backup';
import type { SqlImportResult } from '../src/utils/sqlImport';

// Platform-specific imports
// Note: We use require() directly as Metro bundler handles platform resolution
// Native (.native.ts) reads SQLite via expo-sqlite with URI strings
// Web (.web.ts) reads SQLite via sql.js with File objects

type ImportFormat = 'zip' | 'sql' | 'json';

interface FormatOption {
  value: ImportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
  accept: string;
}

export default function BackupImportScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const [selectedFormat, setSelectedFormat] = useState<ImportFormat>('zip');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<'success' | 'error' | null>(null);
  const [importData, setImportData] = useState<ImportResult | SqlImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const iconColor = isDark ? '#F9FAFB' : '#212226';

  const formatOptions: FormatOption[] = [
    {
      value: 'zip',
      label: t('backup.formatZip'),
      description: t('backup.formatZipDesc'),
      icon: <FileArchive size={24} color={selectedFormat === 'zip' ? '#FFB800' : (isDark ? '#9CA3AF' : '#6B7280')} />,
      accept: '.zip',
    },
    {
      value: 'json',
      label: t('backup.formatJsonImport'),
      description: t('backup.formatJsonImportDesc'),
      icon: <FileJson size={24} color={selectedFormat === 'json' ? '#FFB800' : (isDark ? '#9CA3AF' : '#6B7280')} />,
      accept: '.json',
    },
    {
      value: 'sql',
      label: t('backup.formatSqlImport'),
      description: t('backup.formatSqlImportDesc'),
      icon: <Database size={24} color={selectedFormat === 'sql' ? '#FFB800' : (isDark ? '#9CA3AF' : '#6B7280')} />,
      accept: Platform.OS === 'web' ? '.sql,.db,.sqlite,.sqlite3' : '.db,.sqlite,.sqlite3',
    },
  ];

  const handleImport = async () => {
    if (Platform.OS === 'web') {
      // On web, trigger file input
      if (fileInputRef.current) {
        fileInputRef.current.accept = formatOptions.find(f => f.value === selectedFormat)?.accept || '*';
        fileInputRef.current.click();
      }
    } else {
      // On native, use document picker
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: selectedFormat === 'zip' ? 'application/zip' : '*/*',
          copyToCacheDirectory: true,
        });

        if (result.canceled) return;

        const asset = result.assets[0];
        if (!asset.uri) {
          throw new Error('No file selected');
        }

        await processFileNative(asset.uri, asset.name);
      } catch (error) {
        console.error('Import error:', error);
        setImportResult('error');
        setErrorMessage(error instanceof Error ? error.message : t('backup.importFailed'));
      }
    }
  };

  const processFileNative = async (uri: string, fileName?: string) => {
    setIsImporting(true);
    setImportResult(null);
    setImportData(null);
    setErrorMessage(null);

    try {
      let result: ImportResult | SqlImportResult;

      if (selectedFormat === 'zip') {
        // Read the file as base64 using the File API
        const file = new File(uri);
        const base64 = await file.base64();
        result = await importDatabaseFromZip(base64);
      } else if (selectedFormat === 'sql') {
        // Validate and import SQLite database (native)
        // @ts-ignore - Platform-specific module
        const { validateSqlFile, importFromSql } = require('../src/utils/sqlImport.native');
        await validateSqlFile(uri);
        result = await importFromSql(uri);
      } else {
        // JSON format - read as text
        const file = new File(uri);
        const text = await file.text();
        result = await importDatabaseFromJson(text);
      }

      setImportData(result);
      setImportResult('success');
    } catch (error) {
      console.error('Import error:', error);
      setImportResult('error');
      setErrorMessage(error instanceof Error ? error.message : t('backup.importFailed'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);
    setImportData(null);
    setErrorMessage(null);

    try {
      let result: ImportResult | SqlImportResult;

      if (selectedFormat === 'zip') {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        result = await importDatabaseFromZip(base64);
      } else if (selectedFormat === 'sql') {
        // For web, use sql.js with File object
        // @ts-ignore - Platform-specific module
        const { importFromSql } = require('../src/utils/sqlImport.web');
        result = await importFromSql(file);
      } else {
        // JSON format
        const text = await file.text();
        result = await importDatabaseFromJson(text);
      }

      setImportData(result);
      setImportResult('success');
    } catch (error) {
      console.error('Import error:', error);
      setImportResult('error');
      setErrorMessage(error instanceof Error ? error.message : t('backup.importFailed'));
    } finally {
      setIsImporting(false);
      // Reset file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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
          {t('backup.importBackup')}
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
            {t('backup.importInfoMulti')}
          </Text>
        </View>

        {/* Format Selection */}
        <View className="mt-6">
          <Text
            className={`text-lg font-semibold mb-3 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
          >
            {t('backup.selectImportFormat')}
          </Text>
          <View className="space-y-3">
            {formatOptions.map((format) => (
              <TouchableOpacity
                key={format.value}
                className={`flex-row items-center p-4 rounded-xl border-2 ${
                  selectedFormat === format.value
                    ? 'border-cheddar-yellow bg-cheddar-yellow/10'
                    : isDark
                      ? 'border-gray-700 bg-[#26282D]'
                      : 'border-gray-200 bg-white'
                }`}
                onPress={() => setSelectedFormat(format.value)}
                disabled={isImporting}
              >
                <View className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                  selectedFormat === format.value
                    ? 'border-cheddar-yellow bg-cheddar-yellow'
                    : isDark
                      ? 'border-gray-500'
                      : 'border-gray-300'
                }`}>
                  {selectedFormat === format.value && (
                    <View className="w-2 h-2 rounded-full bg-cheddar-dark" />
                  )}
                </View>
                {format.icon}
                <View className="flex-1 ml-3">
                  <Text
                    className={`text-base font-medium ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
                  >
                    {format.label}
                  </Text>
                  <Text
                    className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                  >
                    {format.description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

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
                  {t('backup.importButton')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Hidden file input for web */}
          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef as React.RefObject<HTMLInputElement>}
              type="file"
              accept={formatOptions.find(f => f.value === selectedFormat)?.accept}
              style={{ display: 'none' }}
              onChange={handleFileSelect as unknown as React.ChangeEventHandler<HTMLInputElement>}
            />
          )}
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
                {t('backup.importSummary', {
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
              {t('backup.importWarning')}
            </Text>
          </View>
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}