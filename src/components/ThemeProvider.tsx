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
import { useDatabase } from './DatabaseProvider';

export type { ThemeMode } from '../db/theme';

type ActiveTheme = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  activeTheme: ActiveTheme;
  isDark: boolean;
  showIcons: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setShowIconsState: (show: boolean) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  activeTheme: 'light',
  isDark: false,
  showIcons: false,
  setThemeMode: async () => {},
  setShowIconsState: async () => {},
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
  const systemColorScheme = useColorScheme();

  // Load saved theme and icons setting on mount
  useEffect(() => {
    if (!isReady) return;

    async function loadSettings() {
      const savedTheme = await getTheme();
      const savedShowIcons = await getShowIcons();
      setThemeModeState(savedTheme);
      setShowIconsState(savedShowIcons);
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

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        activeTheme,
        isDark,
        showIcons,
        setThemeMode: handleSetThemeMode,
        setShowIconsState: handleSetShowIcons,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}