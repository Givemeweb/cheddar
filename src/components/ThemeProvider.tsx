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
import { getMainCurrencyCode, setMainCurrencyCode, getTotalAssetsCurrencyCode, setTotalAssetsCurrencyCode, getCurrencySymbol, DEFAULT_CURRENCY_SYMBOL, DEFAULT_CURRENCY_CODE } from '../db/currency';
import { getSubcategoriesEnabled, setSubcategoriesEnabled as persistSubcategoriesEnabled } from '../db/subcategories';
import { trackEvent } from '../lib/analytics';
import { useDatabase } from './DatabaseProvider';

export type { ThemeMode } from '../db/theme';

type ActiveTheme = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  activeTheme: ActiveTheme;
  isDark: boolean;
  showIcons: boolean;
  subcategoriesEnabled: boolean;
  currencySymbol: string;
  currencyCode: string;
  /** Display currency for the Total Assets card; null means follow currencyCode. */
  totalAssetsCurrencyCode: string | null;
  totalAssetsCurrencySymbol: string;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setShowIconsState: (show: boolean) => Promise<void>;
  setSubcategoriesEnabledState: (enabled: boolean) => Promise<void>;
  setCurrencyState: (code: string) => Promise<void>;
  setTotalAssetsCurrencyState: (code: string | null) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  activeTheme: 'light',
  isDark: false,
  showIcons: false,
  subcategoriesEnabled: false,
  currencySymbol: DEFAULT_CURRENCY_SYMBOL,
  currencyCode: DEFAULT_CURRENCY_CODE,
  totalAssetsCurrencyCode: null,
  totalAssetsCurrencySymbol: DEFAULT_CURRENCY_SYMBOL,
  setThemeMode: async () => {},
  setShowIconsState: async () => {},
  setSubcategoriesEnabledState: async () => {},
  setCurrencyState: async () => {},
  setTotalAssetsCurrencyState: async () => {},
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
  const [subcategoriesEnabled, setSubcategoriesEnabledState] = useState<boolean>(false);
  const [currencySymbol, setCurrencySymbolState] = useState<string>(DEFAULT_CURRENCY_SYMBOL);
  const [currencyCode, setCurrencyCodeState] = useState<string>(DEFAULT_CURRENCY_CODE);
  const [totalAssetsCurrencyCode, setTotalAssetsCurrencyCodeState] = useState<string | null>(null);
  const [totalAssetsCurrencySymbol, setTotalAssetsCurrencySymbolState] = useState<string>(DEFAULT_CURRENCY_SYMBOL);
  const systemColorScheme = useColorScheme();

  // Load saved theme and icons setting on mount
  useEffect(() => {
    if (!isReady) return;

    async function loadSettings() {
      const savedTheme = await getTheme();
      const savedShowIcons = await getShowIcons();
      const savedSubcategoriesEnabled = await getSubcategoriesEnabled();
      const savedCurrencyCode = await getMainCurrencyCode();
      setThemeModeState(savedTheme);
      setShowIconsState(savedShowIcons);
      setSubcategoriesEnabledState(savedSubcategoriesEnabled);
      setCurrencyCodeState(savedCurrencyCode);
      setCurrencySymbolState(getCurrencySymbol(savedCurrencyCode));
      const savedTotalAssetsCurrency = await getTotalAssetsCurrencyCode();
      setTotalAssetsCurrencyCodeState(savedTotalAssetsCurrency);
      setTotalAssetsCurrencySymbolState(getCurrencySymbol(savedTotalAssetsCurrency ?? savedCurrencyCode));
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
    trackEvent('settings.theme_select', { theme: mode });
    await setTheme(mode);
  };

  const handleSetShowIcons = async (show: boolean) => {
    setShowIconsState(show);
    trackEvent('settings.icons_toggle', { enabled: show });
    await setShowIcons(show);
  };

  const handleSetCurrency = async (code: string) => {
    setCurrencyCodeState(code);
    setCurrencySymbolState(getCurrencySymbol(code));
    trackEvent('settings.currency_select', { currency: code });
    await setMainCurrencyCode(code);
    // When the total-assets card follows the main currency, keep its symbol in sync.
    setTotalAssetsCurrencyCodeState((prev) => {
      if (!prev) {
        setTotalAssetsCurrencySymbolState(getCurrencySymbol(code));
      }
      return prev;
    });
  };

  const handleSetTotalAssetsCurrency = async (code: string | null) => {
    setTotalAssetsCurrencyCodeState(code);
    setTotalAssetsCurrencySymbolState(getCurrencySymbol(code ?? currencyCode));
    trackEvent('settings.total_assets_currency_select', {
      currency: code ?? 'main',
    });
    await setTotalAssetsCurrencyCode(code);
  };

  const handleSetSubcategoriesEnabled = async (enabled: boolean) => {
    setSubcategoriesEnabledState(enabled);
    trackEvent('settings.subcategories_toggle', { enabled });
    await persistSubcategoriesEnabled(enabled);
  };

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        activeTheme,
        isDark,
        showIcons,
        subcategoriesEnabled,
        currencySymbol,
        currencyCode,
        totalAssetsCurrencyCode,
        totalAssetsCurrencySymbol,
        setThemeMode: handleSetThemeMode,
        setShowIconsState: handleSetShowIcons,
        setSubcategoriesEnabledState: handleSetSubcategoriesEnabled,
        setCurrencyState: handleSetCurrency,
        setTotalAssetsCurrencyState: handleSetTotalAssetsCurrency,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}