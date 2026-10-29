import { getStore, isDatabaseReady, saveStore } from './tinybase';

const PREMIUM_KEY = 'isPremium';

export type LimitedResource = 'accounts' | 'categories';

// Free-tier caps. Seeded defaults count toward them, so a free user must
// delete a default before adding a custom account or category.
export const FREE_LIMITS: Record<LimitedResource, number> = {
  accounts: 3,
  categories: 10,
};

export class LimitReachedError extends Error {
  readonly resource: LimitedResource;
  readonly limit: number;

  constructor(resource: LimitedResource) {
    const limit = FREE_LIMITS[resource];
    super(`The free plan is limited to ${limit} ${resource}`);
    this.name = 'LimitReachedError';
    this.resource = resource;
    this.limit = limit;
  }
}

/**
 * Free-tier guard for bulk imports (backup restore and the Money Manager
 * importer). Imports replace the tables wholesale, so the caps apply to the
 * file's own counts, not to the delta against existing rows. Call this before
 * the first write: a rejection leaves the database untouched.
 */
export async function assertImportWithinFreeCaps(
  counts: Record<LimitedResource, number>,
): Promise<void> {
  if (await getCachedPremium()) return;

  for (const resource of Object.keys(FREE_LIMITS) as LimitedResource[]) {
    if (counts[resource] > FREE_LIMITS[resource]) {
      throw new LimitReachedError(resource);
    }
  }
}

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
