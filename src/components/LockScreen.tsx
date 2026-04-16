import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from './ThemeProvider';
import { usePasscode } from './PasscodeProvider';
import { Eraser } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

export function LockScreen() {
  const { isDark } = useTheme();
  const { authenticate } = usePasscode();
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const passcodeLength = 4;

  const handleKeypadPress = async (digit: string) => {
    if (error) setError('');

    if (input.length < passcodeLength) {
      const newInput = input + digit;
      setInput(newInput);

      if (newInput.length === passcodeLength) {
        const isValid = await authenticate(newInput);
        if (!isValid) {
          setError(t('passcode.incorrect'));
          setInput('');
        }
      }
    }
  };

  const handleDelete = () => {
    setInput(input.slice(0, -1));
  };

  const renderPasscodeDots = () => (
    <View className="flex-row justify-center gap-4 my-8">
      {Array.from({ length: passcodeLength }).map((_, i) => (
        <View
          key={i}
          className={`w-4 h-4 rounded-full ${i < input.length ? 'bg-cheddar-yellow' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`}
        />
      ))}
    </View>
  );

  const renderKeypad = () => (
    <View className="w-full max-w-xs">
      <View className="flex-row justify-center gap-3 mb-3">
        {['1', '2', '3'].map((digit) => (
          <TouchableOpacity
            key={digit}
            className={`w-20 h-16 rounded-2xl items-center justify-center ${isDark ? 'bg-[#26282D]' : 'bg-gray-100'}`}
            onPress={() => handleKeypadPress(digit)}
          >
            <Text className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {digit}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View className="flex-row justify-center gap-3 mb-3">
        {['4', '5', '6'].map((digit) => (
          <TouchableOpacity
            key={digit}
            className={`w-20 h-16 rounded-2xl items-center justify-center ${isDark ? 'bg-[#26282D]' : 'bg-gray-100'}`}
            onPress={() => handleKeypadPress(digit)}
          >
            <Text className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {digit}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View className="flex-row justify-center gap-3 mb-3">
        {['7', '8', '9'].map((digit) => (
          <TouchableOpacity
            key={digit}
            className={`w-20 h-16 rounded-2xl items-center justify-center ${isDark ? 'bg-[#26282D]' : 'bg-gray-100'}`}
            onPress={() => handleKeypadPress(digit)}
          >
            <Text className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {digit}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View className="flex-row justify-center gap-3 mb-3">
        <View className="w-20 h-16" />
        <TouchableOpacity
          className={`w-20 h-16 rounded-2xl items-center justify-center ${isDark ? 'bg-[#26282D]' : 'bg-gray-100'}`}
          onPress={() => handleKeypadPress('0')}
        >
          <Text className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            0
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`w-20 h-16 rounded-2xl items-center justify-center ${isDark ? 'bg-[#26282D]' : 'bg-gray-100'}`}
          onPress={handleDelete}
        >
          <Eraser size={24} color={isDark ? '#F9FAFB' : '#212226'} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View className={`flex-1 items-center justify-center ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
      <View className="items-center px-4">
        <Text className={`text-2xl font-semibold mb-2 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
          {t('passcode.enterPasscode')}
        </Text>
        {renderPasscodeDots()}
        {error ? (
          <Text className="text-red-500 text-sm mb-2">{error}</Text>
        ) : null}
        {renderKeypad()}
      </View>
    </View>
  );
}