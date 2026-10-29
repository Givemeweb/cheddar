import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check, Crown } from 'lucide-react-native';
import { useTheme } from '../src/components/ThemeProvider';
import {
  PremiumNotGrantedError,
  usePremium,
} from '../src/components/PremiumProvider';
import { FREE_LIMITS } from '../src/db/premium';

export default function PaywallScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const {
    isPremium,
    isLoading,
    lifetimePackage,
    refreshOfferings,
    purchaseLifetime,
    restorePurchases,
  } = usePremium();
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [retryingOfferings, setRetryingOfferings] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const price = lifetimePackage?.product.priceString;
  const benefits = (
    ['accounts', 'categories', 'stats', 'totalStats'] as const
  ).map((id) => ({
    id,
    label: t(`premium.benefits.${id}`),
  }));
  let limitMessage: string | null = null;
  switch (reason) {
    case 'import':
      limitMessage = t('premium.limit.import', {
        accounts: FREE_LIMITS.accounts,
        categories: FREE_LIMITS.categories,
      });
      break;
    case 'accounts':
    case 'categories':
      limitMessage = t(`premium.limit.${reason}`, {
        limit: FREE_LIMITS[reason],
      });
      break;
    case 'statsHistory':
    case 'totalStats':
      limitMessage = t(`premium.limit.${reason}`);
      break;
  }

  const handleRetryOfferings = async () => {
    if (busy !== null || retryingOfferings) return;
    setError(null);
    setMessage(null);
    setRetryingOfferings(true);
    try {
      await refreshOfferings();
    } catch (offeringsError) {
      console.warn('[premium] Failed to reload offerings', offeringsError);
      setError(t('premium.error'));
    } finally {
      setRetryingOfferings(false);
    }
  };

  const handlePurchase = async () => {
    if (busy !== null || retryingOfferings) return;
    setError(null);
    setMessage(null);
    setBusy('purchase');
    try {
      const active = await purchaseLifetime();
      if (active) {
        setMessage(t('premium.purchased'));
      }
    } catch (purchaseError) {
      if (purchaseError instanceof PremiumNotGrantedError) {
        setError(t('premium.notGranted'));
      } else {
        setError(t('premium.error'));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (busy !== null || retryingOfferings) return;
    setError(null);
    setMessage(null);
    setBusy('restore');
    try {
      const active = await restorePurchases();
      setMessage(active ? t('premium.restored') : t('premium.notRestored'));
    } catch (restoreError) {
      console.warn('[premium] Restore failed', restoreError);
      setError(t('premium.error'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}
    >
      <View
        className={`flex-row items-center px-4 py-3 ${isDark ? 'border-gray-700 bg-[#26282D]' : 'border-gray-200 bg-white'} border-b`}
      >
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="mr-4"
        >
          <Text className="text-cheddar-yellow text-lg font-medium">
            {t('common.back')}
          </Text>
        </TouchableOpacity>
        <Text
          className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
        >
          {t('premium.title')}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingTop: 32, paddingBottom: 40 }}
      >
        <View className="items-center">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-cheddar-yellow">
            <Crown size={38} color="#212226" />
          </View>
          <Text
            className={`mt-5 text-3xl font-bold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
          >
            {t('premium.title')}
          </Text>
          <Text
            className={`mt-2 text-center text-base ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
          >
            {t('premium.subtitle')}
          </Text>
        </View>

        {limitMessage && !isPremium ? (
          <View
            className={`mt-6 rounded-xl px-4 py-3 ${isDark ? 'bg-[#3A3320]' : 'bg-amber-100'}`}
          >
            <Text
              testID="paywall-limit-message"
              className={`text-center text-base ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
            >
              {limitMessage}
            </Text>
          </View>
        ) : null}

        <View
          className={`mt-8 rounded-2xl p-5 ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}
        >
          {benefits.map((benefit) => (
            <View key={benefit.id} className="mb-3 flex-row items-center last:mb-0">
              <View className="mr-3 h-6 w-6 items-center justify-center rounded-full bg-cheddar-yellow">
                <Check size={16} color="#212226" />
              </View>
              <Text
                className={`flex-1 text-base ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
              >
                {benefit.label}
              </Text>
            </View>
          ))}
        </View>

        <View
          className={`mt-6 rounded-2xl p-5 ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}
        >
          <View className="flex-row items-center justify-between">
            <Text
              className={`text-base ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
            >
              {t('premium.lifetime')}
            </Text>
            {isLoading || retryingOfferings ? (
              <ActivityIndicator color="#FFB800" />
            ) : (
              <View className="flex-row items-center">
                <Text
                  testID="paywall-price"
                  className={`text-2xl font-bold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}
                >
                  {price ?? t('premium.priceUnavailable')}
                </Text>
                {!price && Platform.OS !== 'web' ? (
                  <TouchableOpacity
                    testID="paywall-retry-price"
                    className="ml-3"
                    disabled={busy !== null || retryingOfferings}
                    onPress={handleRetryOfferings}
                  >
                    <Text className="text-cheddar-yellow text-base font-medium">
                      {t('premium.retry')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>

          {Platform.OS === 'web' ? (
            <Text
              testID="paywall-web-notice"
              className={`mt-5 text-center text-base ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
            >
              {t('premium.webUnavailable')}
            </Text>
          ) : isPremium ? (
            <View
              testID="paywall-status"
              className="mt-5 flex-row items-center justify-center rounded-xl bg-green-500 px-4 py-4"
            >
              <Check size={20} color="#FFFFFF" />
              <Text className="ml-2 text-base font-semibold text-white">
                {t('premium.active')}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              testID="paywall-buy"
              className={`mt-5 flex-row items-center justify-center rounded-xl px-4 py-4 ${
                busy || isLoading || retryingOfferings || !price
                  ? 'bg-gray-400'
                  : 'bg-cheddar-yellow'
              }`}
              activeOpacity={0.8}
              disabled={
                busy !== null || isLoading || retryingOfferings || !price
              }
              onPress={handlePurchase}
            >
              {busy === 'purchase' ? (
                <ActivityIndicator color="#212226" />
              ) : (
                <Text className="text-base font-bold text-cheddar-dark">
                  {price
                    ? t('premium.buy', { price })
                    : t('premium.priceUnavailable')}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {Platform.OS !== 'web' ? (
            <TouchableOpacity
              testID="paywall-restore"
              className="mt-4 items-center py-3"
              disabled={busy !== null || isLoading || retryingOfferings}
              onPress={handleRestore}
            >
              {busy === 'restore' ? (
                <ActivityIndicator color="#FFB800" />
              ) : (
                <Text className="text-cheddar-yellow text-base font-medium">
                  {t('premium.restore')}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        {message ? (
          <Text
            testID="paywall-message"
            className="mt-5 text-center text-sm text-green-500"
          >
            {message}
          </Text>
        ) : null}
        {error ? (
          <Text
            testID="paywall-error"
            className="mt-5 text-center text-sm text-cheddar-expense"
          >
            {error}
          </Text>
        ) : null}

        <Text
          className={`mt-8 text-center text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
        >
          {t('premium.legal')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
