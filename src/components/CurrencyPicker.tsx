import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { CURRENCIES, DEFAULT_CURRENCY_CODE } from '@/src/db/currency';
import { useTheme } from '@/src/components/ThemeProvider';
import { useTranslation } from 'react-i18next';

type CurrencyPickerProps = {
  selected: string;
  onSelect: (code: string) => void;
  expanded: boolean;
  onToggle: () => void;
};

/**
 * Inline currency picker used on the Add/Edit Account screens.
 * Renders a compact selector row that expands into the currency list.
 */
export function CurrencyPicker({ selected, onSelect, expanded, onToggle }: CurrencyPickerProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const selectedCurrency = CURRENCIES.find(c => c.code === selected) ?? CURRENCIES[0];

  return (
    <View className={`rounded-xl p-4 mb-4 ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}>
      <Text className={`text-sm font-medium uppercase mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        {t('accounts.currency')}
      </Text>
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between py-1"
      >
        <View className="flex-row items-center">
          <Text className={`text-2xl font-semibold mr-3 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
            {selectedCurrency.symbol}
          </Text>
          <View>
            <Text className={`text-lg ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
              {selectedCurrency.name}
            </Text>
            <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {selectedCurrency.code}
            </Text>
          </View>
        </View>
        {expanded ? (
          <ChevronUp size={20} color={isDark ? '#F9FAFB' : '#212226'} />
        ) : (
          <ChevronDown size={20} color={isDark ? '#F9FAFB' : '#212226'} />
        )}
      </Pressable>

      {expanded && (
        <ScrollView
          className="mt-3 max-h-56 rounded-lg"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <View className={`rounded-lg overflow-hidden ${isDark ? 'bg-[#1a1b1e]' : 'bg-gray-50'}`}>
            {CURRENCIES.map((curr, index) => {
              const isSelected = selected === curr.code;
              return (
                <TouchableOpacity
                  key={curr.code}
                  className={`flex-row items-center justify-between p-3 ${
                    index > 0
                      ? `${isDark ? 'border-gray-700' : 'border-gray-100'} border-t`
                      : ''
                  }`}
                  activeOpacity={0.7}
                  onPress={() => {
                    onSelect(curr.code);
                    onToggle();
                  }}
                >
                  <View className="flex-row items-center flex-1">
                    <Text className={`text-xl font-semibold mr-3 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
                      {curr.symbol}
                    </Text>
                    <View className="flex-1">
                      <Text className={`${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
                        {curr.name}
                      </Text>
                      <Text className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {curr.code}
                      </Text>
                    </View>
                  </View>
                  {isSelected && <Check size={18} color="#FFB800" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

export default CurrencyPicker;
