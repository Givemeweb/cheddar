/**
 * Connect flow for a Mercury API token.
 *
 * The token is validated against Mercury (`GET /accounts`) before anything is
 * stored, then kept only in the device secure store. The local database gets
 * a single connection row without the token; the per-table cell whitelist in
 * src/db/mercury.ts is what keeps the token out of every backup too. A
 * rejected token therefore leaves no token and no connection behind: both
 * writes happen strictly after a successful validation, and a failed row
 * write rolls the just-stored token back out again.
 */
import * as SecureStore from 'expo-secure-store';
import { isDatabaseReady } from '../db/tinybase';
import { upsertMercuryConnection } from '../db/mercury';
import { fetchMercuryAccounts } from './mercuryApi';

const TOKEN_KEY = 'mercuryApiToken';

/**
 * Validates the token and persists a working connection.
 * @returns how many Mercury accounts the token can read.
 * @throws {MercuryApiError} before any write when validation fails.
 */
export async function connectMercury(token: string): Promise<number> {
  const trimmed = token.trim();
  const accounts = await fetchMercuryAccounts(trimmed);
  // The mercury.ts helpers silently no-op while the database is not ready,
  // which would orphan the token stored below. Refuse before any write.
  if (!isDatabaseReady()) {
    throw new Error('Cannot connect while the local database is not ready.');
  }
  await SecureStore.setItemAsync(TOKEN_KEY, trimmed);
  try {
    await upsertMercuryConnection({ tokenStatus: 'active', createdAt: Date.now() });
  } catch (error) {
    // Roll the just-stored token back out: a failed row write must not leave
    // a live token with no connection row behind. A failed rollback cannot be
    // retried from here, so the original error is what reaches the caller.
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    throw error;
  }
  return accounts.length;
}

/**
 * Best-effort removal of the stored token (used by the reset flow; the full
 * disconnect action is ticket 04). Never throws: SecureStore is unavailable
 * on web, where there is nothing to delete anyway.
 */
export async function deleteStoredMercuryToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.warn('[mercury] Could not delete the stored token', error);
  }
}
