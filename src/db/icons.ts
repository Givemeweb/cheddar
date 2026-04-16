import { getStore, saveStore, isDatabaseReady } from './tinybase';

const SHOW_ICONS_KEY = 'showIcons';

export async function getShowIcons(): Promise<boolean> {
  if (!isDatabaseReady()) return false;
  const store = getStore();
  const value = store.getValue(SHOW_ICONS_KEY) as string | undefined;
  return value === 'true';
}

export async function setShowIcons(showIcons: boolean): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.setValue(SHOW_ICONS_KEY, showIcons ? 'true' : 'false');
  await saveStore();
}