import { getStore, isDatabaseReady, saveStore } from './tinybase';

const PREMIUM_KEY = 'isPremium';

export type LimitedResource = 'accounts' | 'categories';

// Free-tier caps. Seeded defaults count toward them, so a free user must
// delete a default before adding a custom account or category.
export const FREE_LIMITS: Record<LimitedResource, number> = {
  accounts: 3,
  categories: 10,
};

export async function getCachedPremium(): Promise<boolean> {
  if (!isDatabaseReady()) return false;
  return getStore().getValue(PREMIUM_KEY) === 'true';
}

export async function setCachedPremium(isPremium: boolean): Promise<void> {
  if (!isDatabaseReady()) return;
  getStore().setValue(PREMIUM_KEY, isPremium ? 'true' : 'false');
  try {
    await saveStore();
  } catch (error) {
    // The entitlement is already applied in memory; caching is best-effort.
    console.warn('[premium] Failed to persist entitlement', error);
  }
}
