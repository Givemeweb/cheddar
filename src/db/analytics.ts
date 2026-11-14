import { uuid } from 'expo-modules-core';
import { getStore, isDatabaseReady, saveStore } from './tinybase';

const ANALYTICS_ID_KEY = 'analyticsId';
const ANALYTICS_ENABLED_KEY = 'analyticsEnabled';

/** Anonymous per-install id sent as Umami's visitor distinct ID (`payload.id`). */
export function getAnalyticsId(): string | null {
  if (!isDatabaseReady()) return null;

  const store = getStore();
  const existing = store.getValue(ANALYTICS_ID_KEY);
  if (typeof existing === 'string' && existing) {
    return existing;
  }

  const id = uuid.v4();
  store.setValue(ANALYTICS_ID_KEY, id);
  void saveStore().catch((error) => {
    console.warn('[analytics] Failed to persist the anonymous id', error);
  });
  return id;
}

/** Analytics is opt-out; an absent value means enabled. */
export function isAnalyticsEnabled(): boolean {
  if (!isDatabaseReady()) return false;
  return getStore().getValue(ANALYTICS_ENABLED_KEY) !== 'false';
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready; analytics preference was not saved');
  }

  const store = getStore();
  const previous = store.getValue(ANALYTICS_ENABLED_KEY);
  const next = enabled ? 'true' : 'false';
  store.setValue(ANALYTICS_ENABLED_KEY, next);
  try {
    await saveStore();
  } catch (error) {
    // Keep memory and disk in sync when persistence fails, but only if no
    // newer write has landed in the meantime.
    if (store.getValue(ANALYTICS_ENABLED_KEY) === next) {
      if (previous === undefined) {
        store.delValue(ANALYTICS_ENABLED_KEY);
      } else {
        store.setValue(ANALYTICS_ENABLED_KEY, previous);
      }
    }
    console.warn('[analytics] Failed to persist the opt-out flag', error);
    throw error;
  }
}
