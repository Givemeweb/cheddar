import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Lock, Check, Eraser, Fingerprint } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '../src/components/ThemeProvider';
import {
  getPasscode,
  setPasscode,
  isPasscodeEnabled,
  setPasscodeEnabled,
  isBiometricEnabled,
  setBiometricEnabled,
} from '../src/db/passcode';

type Mode = 'disabled' | 'enable_step1' | 'enable_step2' | 'change_verify' | 'change_step1' | 'change_step2' | 'disable_verify';

export default function PasscodeScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const [mode, setMode] = useState<Mode>('disabled');
  const [passcodeEnabled, setPasscodeEnabledState] = useState(false);
  const [biometricEnabledState, setBiometricEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [input, setInput] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadState() {
      const enabled = await isPasscodeEnabled();
      setPasscodeEnabledState(enabled);
      const bioEnabled = await isBiometricEnabled();
      setBiometricEnabledState(bioEnabled);
      // Check if biometric is available (only on native platforms)
      if (Platform.OS !== 'web') {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricAvailable(compatible && enrolled);
      }
    }
    loadState();
  }, []);

  const passcodeLength = 4;

  const handleTogglePasscode = async () => {
    if (passcodeEnabled) {
      // Ask for current passcode to disable
      setMode('disable_verify');
      setInput('');
    } else {
      // Enable passcode - first step
      setMode('enable_step1');
      setInput('');
    }
  };

  const handleKeypadPress = async (digit: string) => {
    // Clear error when user starts typing
    if (error) setError('');

    if (mode === 'enable_step1' || mode === 'change_step1') {
      if (input.length < passcodeLength) {
        const newInput = input + digit;
        setInput(newInput);
        if (newInput.length === passcodeLength) {
          setNewPasscode(newInput);
          setError('');
          if (mode === 'enable_step1') {
            setMode('enable_step2');
          } else {
            setMode('change_step2');
          }
          setInput('');
        }
      }
    } else if (mode === 'enable_step2' || mode === 'change_step2') {
      if (input.length < passcodeLength) {
        const newInput = input + digit;
        setInput(newInput);
        if (newInput.length === passcodeLength) {
          // Verify matching passcodes
          if (newInput === newPasscode) {
            // Save passcode
            await setPasscode(newInput);
            await setPasscodeEnabled(true);
            setPasscodeEnabledState(true);
            setMode('disabled');
            setInput('');
            setNewPasscode('');
            setError('');
          } else {
            // Passcodes don't match - show error and stay on confirm screen
            setError(t('passcode.mismatch'));
            setInput('');
          }
        }
      }
    } else if (mode === 'disable_verify') {
      if (input.length < passcodeLength) {
        const newInput = input + digit;
        setInput(newInput);
        if (newInput.length === passcodeLength) {
          // Verify current passcode
          const storedPasscode = await getPasscode();
          if (newInput === storedPasscode) {
            await setPasscodeEnabled(false);
            setPasscodeEnabledState(false);
            setMode('disabled');
            setInput('');
            setError('');
          } else {
            setError(t('passcode.incorrect'));
            setInput('');
          }
        }
      }
    } else if (mode === 'change_verify') {
      if (input.length < passcodeLength) {
        const newInput = input + digit;
        setInput(newInput);
        if (newInput.length === passcodeLength) {
          // Verify current passcode
          const storedPasscode = await getPasscode();
          if (newInput === storedPasscode) {
            setMode('change_step1');
            setInput('');
            setError('');
          } else {
            setError(t('passcode.incorrect'));
            setInput('');
          }
        }
      }
    }
  };

  const handleDelete = () => {
    setInput(input.slice(0, -1));
  };

  const handleCancel = () => {
    setMode('disabled');
    setInput('');
    setNewPasscode('');
    setError('');
  };

  const handleChangePasscode = () => {
    setMode('change_verify');
    setInput('');
  };

  const handleToggleBiometric = async () => {
    if (!biometricAvailable) {
      Alert.alert(
        t('passcode.biometric.notAvailable'),
        t('passcode.biometric.notEnrolled')
      );
      return;
    }

    if (biometricEnabledState) {
      // Disable biometric
      await setBiometricEnabled(false);
      setBiometricEnabledState(false);
    } else {
      // Enable biometric - require authentication first
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('passcode.biometric.unlock'),
        fallbackLabel: t('common.cancel'),
        cancelLabel: t('common.cancel'),
        disableDeviceFallback: true,
      });

      if (result.success) {
        await setBiometricEnabled(true);
        setBiometricEnabledState(true);
      }
    }
  };

  const renderPasscodeDots = (code: string) => {
    return (
      <View className="flex-row justify-center gap-4 my-8">
        {Array.from({ length: passcodeLength }).map((_, i) => (
          <View
            key={i}
            className={`w-4 h-4 rounded-full ${i < code.length ? 'bg-cheddar-yellow' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`}
          />
        ))}
      </View>
    );
  };

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

  const renderDisabledMode = () => (
    <View className="flex-1 px-4 pt-6">
      <TouchableOpacity
        className={`flex-row items-center justify-between p-4 rounded-xl ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}
        onPress={handleTogglePasscode}
        activeOpacity={0.7}
      >
        <View className="flex-row items-center">
          <Lock size={22} color="#FFB800" />
          <Text className={`text-lg ml-3 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
            {t('passcode.enable')}
          </Text>
        </View>
        <View className={`w-12 h-7 rounded-full p-1 ${passcodeEnabled ? 'bg-cheddar-yellow' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`}>
          <View className={`w-5 h-5 rounded-full bg-white ${passcodeEnabled ? 'ml-auto' : ''}`} />
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderPasscodeEntry = () => {
    let title = '';
    let subtitle = '';

    switch (mode) {
      case 'enable_step1':
        title = t('passcode.enterNew');
        subtitle = t('passcode.enterNewDesc');
        break;
      case 'enable_step2':
        title = t('passcode.confirmNew');
        subtitle = t('passcode.confirmNewDesc');
        break;
      case 'change_verify':
        title = t('passcode.enterCurrent');
        subtitle = t('passcode.enterCurrentDesc');
        break;
      case 'change_step1':
        title = t('passcode.enterNew');
        subtitle = t('passcode.enterNewDesc');
        break;
      case 'change_step2':
        title = t('passcode.confirmNew');
        subtitle = t('passcode.confirmNewDesc');
        break;
      case 'disable_verify':
        title = t('passcode.enterCurrent');
        subtitle = t('passcode.enterCurrentDesc');
        break;
    }

    return (
      <View className="flex-1 items-center px-4 pt-16">
        <Text className={`text-2xl font-semibold mb-2 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
          {title}
        </Text>
        <Text className={`text-base mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {subtitle}
        </Text>
        {renderPasscodeDots(input)}
        {error ? (
          <Text className="text-red-500 text-sm mb-2">{error}</Text>
        ) : null}
        {renderKeypad()}
        <TouchableOpacity
          className="mt-6 px-6 py-3"
          onPress={handleCancel}
        >
          <Text className="text-cheddar-yellow text-lg font-medium">
            {t('common.cancel')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderEnabledMode = () => (
    <View className="flex-1 px-4 pt-6">
      <TouchableOpacity
        className={`flex-row items-center justify-between p-4 rounded-xl mb-4 ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}
        onPress={handleTogglePasscode}
        activeOpacity={0.7}
      >
        <View className="flex-row items-center">
          <Lock size={22} color="#10B981" />
          <Text className={`text-lg ml-3 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
            {t('passcode.enabled')}
          </Text>
        </View>
        <View className={`w-12 h-7 rounded-full p-1 ${passcodeEnabled ? 'bg-cheddar-yellow' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`}>
          <View className={`w-5 h-5 rounded-full bg-white ${passcodeEnabled ? 'ml-auto' : ''}`} />
        </View>
      </TouchableOpacity>

      {Platform.OS !== 'web' && biometricAvailable && (
        <TouchableOpacity
          className={`flex-row items-center justify-between p-4 rounded-xl mb-4 ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}
          onPress={handleToggleBiometric}
          activeOpacity={0.7}
        >
          <View className="flex-row items-center">
            <Fingerprint size={22} color={biometricEnabledState ? '#10B981' : '#6B7280'} />
            <Text className={`text-lg ml-3 ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
              {t('passcode.biometric.enable')}
            </Text>
          </View>
          <View className={`w-12 h-7 rounded-full p-1 ${biometricEnabledState ? 'bg-cheddar-yellow' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`}>
            <View className={`w-5 h-5 rounded-full bg-white ${biometricEnabledState ? 'ml-auto' : ''}`} />
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        className={`flex-row items-center p-4 rounded-xl ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}
        onPress={handleChangePasscode}
        activeOpacity={0.7}
      >
        <Text className={`text-lg ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>
          {t('passcode.change')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const isEntryMode = mode !== 'disabled';

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
          {t('passcode.title')}
        </Text>
      </View>

      {passcodeEnabled && !isEntryMode && renderEnabledMode()}
      {!passcodeEnabled && !isEntryMode && renderDisabledMode()}
      {isEntryMode && renderPasscodeEntry()}
    </SafeAreaView>
  );
}