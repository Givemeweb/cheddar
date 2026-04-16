import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { isPasscodeEnabled, verifyPasscode } from '../db/passcode';
import { useDatabase } from './DatabaseProvider';

interface PasscodeContextType {
  isPasscodeRequired: boolean;
  isAuthenticated: boolean;
  authenticate: (passcode: string) => Promise<boolean>;
  needsAuthentication: boolean;
}

const PasscodeContext = createContext<PasscodeContextType>({
  isPasscodeRequired: false,
  isAuthenticated: false,
  authenticate: async () => false,
  needsAuthentication: false,
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

  return (
    <PasscodeContext.Provider
      value={{
        isPasscodeRequired,
        isAuthenticated,
        authenticate,
        needsAuthentication,
      }}
    >
      {children}
    </PasscodeContext.Provider>
  );
}