import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { isPasscodeEnabled, verifyPasscode, isBiometricEnabled } from '../db/passcode';
import { useDatabase } from './DatabaseProvider';

interface PasscodeContextType {
  isPasscodeRequired: boolean;
  isAuthenticated: boolean;
  authenticate: (passcode: string) => Promise<boolean>;
  needsAuthentication: boolean;
  isBiometricAvailable: boolean;
  isBiometricEnabled: boolean;
  authenticateWithBiometric: () => Promise<boolean>;
}

const PasscodeContext = createContext<PasscodeContextType>({
  isPasscodeRequired: false,
  isAuthenticated: false,
  authenticate: async () => false,
  needsAuthentication: false,
  isBiometricAvailable: false,
  isBiometricEnabled: false,
  authenticateWithBiometric: async () => false,
});

export function usePasscode() {
  return useContext(PasscodeContext);
}

interface PasscodeProviderProps {
  children: ReactNode;
}

export function PasscodeProvider({ children }: PasscodeProviderProps) {
  const { isReady } = useDatabase();
  const [isPasscodeRequired, setIsPasscodeRequired] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [needsAuthentication, setNeedsAuthentication] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

  // Check if passcode is enabled and reset authentication on mount
  useEffect(() => {
    if (!isReady) return;

    async function checkPasscode() {
      const enabled = await isPasscodeEnabled();
      setIsPasscodeRequired(enabled);

      if (enabled) {
        // Require authentication on app start
        setIsAuthenticated(false);
        setNeedsAuthentication(true);
      }

      // Check biometric availability (only on native platforms)
      if (Platform.OS !== 'web') {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsBiometricAvailable(compatible && enrolled);
      }

      const bioEnabled = await isBiometricEnabled();
      setBiometricEnabledState(bioEnabled);
    }
    checkPasscode();
  }, [isReady]);

  // Monitor app state to require re-authentication when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && isPasscodeRequired && !isAuthenticated) {
        setNeedsAuthentication(true);
      } else if (nextAppState === 'active' && isPasscodeRequired) {
        // App came back to foreground - require re-authentication
        setIsAuthenticated(false);
        setNeedsAuthentication(true);
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App went to background - will require auth when coming back
        if (isPasscodeRequired) {
          setIsAuthenticated(false);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isPasscodeRequired, isAuthenticated]);

  const authenticate = async (passcode: string): Promise<boolean> => {
    const isValid = await verifyPasscode(passcode);
    if (isValid) {
      setIsAuthenticated(true);
      setNeedsAuthentication(false);
    }
    return isValid;
  };

  const authenticateWithBiometric = async (): Promise<boolean> => {
    if (Platform.OS === 'web' || !isBiometricAvailable || !biometricEnabled) {
      return false;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to unlock',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsAuthenticated(true);
        setNeedsAuthentication(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <PasscodeContext.Provider
      value={{
        isPasscodeRequired,
        isAuthenticated,
        authenticate,
        needsAuthentication,
        isBiometricAvailable,
        isBiometricEnabled: biometricEnabled,
        authenticateWithBiometric,
      }}
    >
      {children}
    </PasscodeContext.Provider>
  );
}