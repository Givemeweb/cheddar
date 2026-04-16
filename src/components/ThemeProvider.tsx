import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { getTheme, setTheme, ThemeMode } from '../db/theme';
import { getShowIcons, setShowIcons } from '../db/icons';
import { getMainCurrencyCode, setMainCurrencyCode, getCurrencySymbol, DEFAULT_CURRENCY_SYMBOL, DEFAULT_CURRENCY_CODE } from '../db/currency';
import { useDatabase } from './DatabaseProvider';

export type { ThemeMode } from '../db/theme';

type ActiveTheme = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  activeTheme: ActiveTheme;
  isDark: boolean;
  showIcons: boolean;
  currencySymbol: string;
  currencyCode: string;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setShowIconsState: (show: boolean) => Promise<void>;
  setCurrencyState: (code: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  activeTheme: 'light',
  isDark: false,
  showIcons: false,
  currencySymbol: DEFAULT_CURRENCY_SYMBOL,
  currencyCode: DEFAULT_CURRENCY_CODE,
  setThemeMode: async () => {},
  setShowIconsState: async () => {},
  setCurrencyState: async () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { isReady } = useDatabase();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [showIcons, setShowIconsState] = useState<boolean>(false);
  const [currencySymbol, setCurrencySymbolState] = useState<string>(DEFAULT_CURRENCY_SYMBOL);
  const [currencyCode, setCurrencyCodeState] = useState<string>(DEFAULT_CURRENCY_CODE);
  const systemColorScheme = useColorScheme();

  // Load saved theme and icons setting on mount
  useEffect(() => {
    if (!isReady) return;

    async function loadSettings() {
      const savedTheme = await getTheme();
      const savedShowIcons = await getShowIcons();
      const savedCurrencyCode = await getMainCurrencyCode();
      setThemeModeState(savedTheme);
      setShowIconsState(savedShowIcons);
      setCurrencyCodeState(savedCurrencyCode);
      setCurrencySymbolState(getCurrencySymbol(savedCurrencyCode));
    }
    loadSettings();
  }, [isReady]);

  const activeTheme: ActiveTheme =
    themeMode === 'system'
      ? (systemColorScheme === 'dark' ? 'dark' : 'light')
      : themeMode;

  const isDark = activeTheme === 'dark';

  const handleSetThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await setTheme(mode);
  };

  const handleSetShowIcons = async (show: boolean) => {
    setShowIconsState(show);
    await setShowIcons(show);
  };

  const handleSetCurrency = async (code: string) => {
    setCurrencyCodeState(code);
    setCurrencySymbolState(getCurrencySymbol(code));
    await setMainCurrencyCode(code);
  };

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        activeTheme,
        isDark,
        showIcons,
        currencySymbol,
        currencyCode,
        setThemeMode: handleSetThemeMode,
        setShowIconsState: handleSetShowIcons,
        setCurrencyState: handleSetCurrency,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}