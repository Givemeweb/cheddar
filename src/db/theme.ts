import { getStore, saveStore, isDatabaseReady } from './tinybase';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme';

export async function getTheme(): Promise<ThemeMode> {
  if (!isDatabaseReady()) return 'system';
  const store = getStore();
  const theme = store.getValue(THEME_KEY) as string | undefined;
  return (theme as ThemeMode) || 'system';
}

export async function setTheme(theme: ThemeMode): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.setValue(THEME_KEY, theme);
  await saveStore();
}