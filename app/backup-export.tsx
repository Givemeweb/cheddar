import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle } from 'lucide-react-native';
import { useTheme } from '../src/components/ThemeProvider';
import { exportDatabaseToZip } from '../src/utils/backup';

export default function BackupExportScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportResult(null);
    setErrorMessage(null);

    try {
      await exportDatabaseToZip();
      setExportResult('success');
    } catch (error) {
      console.error('Export error:', error);
      setExportResult('error');
      setErrorMessage(error instanceof Error ? error.message : t('backup.exportFailed'));
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
        </View>

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