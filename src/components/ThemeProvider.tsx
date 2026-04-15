import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { getTheme, setTheme, ThemeMode } from '../db/theme';
import { useDatabase } from './DatabaseProvider';

export type { ThemeMode } from '../db/theme';

type ActiveTheme = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  activeTheme: ActiveTheme;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  activeTheme: 'light',
  isDark: false,
  setThemeMode: async () => {},
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
  const systemColorScheme = useColorScheme();

  // Load saved theme on mount
  useEffect(() => {
    if (!isReady) return;

    async function loadTheme() {
      const savedTheme = await getTheme();
      setThemeModeState(savedTheme);
    }
    loadTheme();
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

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        activeTheme,
        isDark,
        setThemeMode: handleSetThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}