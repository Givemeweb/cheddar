import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle } from 'lucide-react-native';
import { useTheme } from '../src/components/ThemeProvider';
import { exportDatabaseToZip } from '../src/utils/backup';
import { trackEvent } from '../src/lib/analytics';

// Previous format selection state (preserved for future restoration)
// type ExportFormat = 'json' | 'sql';

export default function BackupExportScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();

  // const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json');
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExport = async () => {
    trackEvent('backup.export_started');
    setIsExporting(true);
    setExportResult(null);
    setErrorMessage(null);

    try {
      await exportDatabaseToZip();
      setExportResult('success');
      trackEvent('backup.export_success');
    } catch (error) {
      console.error('Export error:', error);
      setExportResult('error');
      setErrorMessage(error instanceof Error ? error.message : t('backup.exportFailed'));
      trackEvent('backup.export_failed');
    } finally {
      setIsExporting(false);
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
          {t('backup.exportBackup')}
        </Text>
      </View>

      <View className="flex-1 px-4 pt-6">
        <View
          className={`${isDark ? 'bg-[#26282D]' : 'bg-white'} rounded-xl p-4`}
        >
          <Text
            className={`text-base ${isDark ? 'text-gray-300' : 'text-gray-600'} leading-6`}
          >
            {t('backup.exportInfo')}
          </Text>
          <Text
            testID="backup-premium-note"
            className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} leading-5`}
          >
            {t('backup.premiumNotIncluded')}
          </Text>
        </View>

        {/* Format Selection — hidden for unified ZIP+SQL export */}
        {/*
        <View className="mt-6">
          <Text
            className={`text-lg font-semibold mb-3 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
          >
            {t('backup.selectFormat')}
          </Text>
          <View className="space-y-3">
            <TouchableOpacity
              className={`flex-row items-center p-4 rounded-xl border-2 ${
                selectedFormat === 'json'
                  ? 'border-cheddar-yellow bg-cheddar-yellow/10'
                  : isDark
                    ? 'border-gray-700 bg-[#26282D]'
                    : 'border-gray-200 bg-white'
              }`}
              onPress={() => setSelectedFormat('json')}
              disabled={isExporting}
            >
              <View className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                selectedFormat === 'json'
                  ? 'border-cheddar-yellow bg-cheddar-yellow'
                  : isDark
                    ? 'border-gray-500'
                    : 'border-gray-300'
              }`}>
                {selectedFormat === 'json' && (
                  <View className="w-2 h-2 rounded-full bg-cheddar-dark" />
                )}
              </View>
              <FileJson size={24} color={selectedFormat === 'json' ? '#FFB800' : (isDark ? '#9CA3AF' : '#6B7280')} />
              <View className="flex-1 ml-3">
                <Text
                  className={`text-base font-medium ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
                >
                  {t('backup.formatJson')}
                </Text>
                <Text
                  className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                >
                  {t('backup.formatJsonDesc')}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              className={`flex-row items-center p-4 rounded-xl border-2 ${
                selectedFormat === 'sql'
                  ? 'border-cheddar-yellow bg-cheddar-yellow/10'
                  : isDark
                    ? 'border-gray-700 bg-[#26282D]'
                    : 'border-gray-200 bg-white'
              }`}
              onPress={() => setSelectedFormat('sql')}
              disabled={isExporting}
            >
              <View className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                selectedFormat === 'sql'
                  ? 'border-cheddar-yellow bg-cheddar-yellow'
                  : isDark
                    ? 'border-gray-500'
                    : 'border-gray-300'
              }`}>
                {selectedFormat === 'sql' && (
                  <View className="w-2 h-2 rounded-full bg-cheddar-dark" />
                )}
              </View>
              <Database size={24} color={selectedFormat === 'sql' ? '#FFB800' : (isDark ? '#9CA3AF' : '#6B7280')} />
              <View className="flex-1 ml-3">
                <Text
                  className={`text-base font-medium ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
                >
                  {t('backup.formatSql')}
                </Text>
                <Text
                  className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                >
                  {t('backup.formatSqlDesc')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
        */}

        <View className="mt-6">
          <TouchableOpacity
            className={`flex-row items-center justify-center p-4 rounded-xl ${
              isExporting
                ? 'bg-cheddar-yellow/50'
                : 'bg-cheddar-yellow'
            }`}
            activeOpacity={0.7}
            onPress={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#212226" />
            ) : (
              <Text className="text-cheddar-dark text-lg font-semibold">
                {t('backup.exportButton')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {exportResult === 'success' && (
          <View
            className={`flex-row items-center mt-4 p-4 rounded-xl ${isDark ? 'bg-green-900/30' : 'bg-green-50'}`}
          >
            <CheckCircle size={22} color={successColor} />
            <Text className={`ml-3 text-base ${isDark ? 'text-green-400' : 'text-green-700'}`}>
              {t('backup.exportSuccess')}
            </Text>
          </View>
        )}

        {exportResult === 'error' && (
          <View
            className={`flex-row items-start mt-4 p-4 rounded-xl ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}
          >
            <XCircle size={22} color={errorColor} />
            <View className="flex-1 ml-3">
              <Text className={`text-base ${isDark ? 'text-red-400' : 'text-red-700'}`}>
                {t('backup.exportError')}
              </Text>
              {errorMessage && (
                <Text className={`mt-1 text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                  {errorMessage}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
