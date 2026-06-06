import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";

// Types

type SubscriptionState =
  | { status: "unknown" }
  | { status: "free" }
  | { status: "premium"; expiry: Date; tier: "monthly" | "annual" }
  | { status: "expired"; graceEnd: Date }
  | { status: "offline"; cachedExpiry: Date };

export type SubscriptionTier = "free" | "monthly" | "annual";

interface SubscriptionCache {
  anonymousUserId: string;
  status: "free" | "premium" | "expired";
  tier: "monthly" | "annual" | null;
  expiryDate: string | null; // ISO 8601
  lastCheckedAt: string; // ISO 8601
  receiptToken: string | null;
}

export interface SubscriptionCore {
  initialize(): Promise<void>;
  isPremium(): boolean;
  getExpiryDate(): Date | null;
  getTier(): SubscriptionTier;
  refreshStatus(): Promise<void>;
  getAnonymousUserId(): string | null;
  markRestored(): Promise<void>;
}

// Constants
const SECURE_STORE_KEY_ANON_ID = "cheddar_anonymous_user_id";
const SECURE_STORE_KEY_CACHE = "cheddar_subscription_cache";

const GRACE_PERIOD_HOURS = 24;
const STALE_CACHE_HOURS = 24;

function getGracePeriodMs(): number {
  return GRACE_PERIOD_HOURS * 60 * 60 * 1000;
}

function getStaleCacheMs(): number {
  return STALE_CACHE_HOURS * 60 * 60 * 1000;
}

// Internal State
let _state: SubscriptionState = { status: "unknown" };
let _anonymousUserId: string | null = null;
let _initialized = false;

// Helpers

function isCacheStale(lastCheckedAt: string): boolean {
  const lastChecked = new Date(lastCheckedAt).getTime();
  const now = Date.now();
  return now - lastChecked > getStaleCacheMs();
}

function isPremiumFromState(state: SubscriptionState): boolean {
  switch (state.status) {
    case "unknown":
    case "free":
      return false;
    case "premium":
      return state.expiry.getTime() > Date.now();
    case "expired":
      return state.graceEnd.getTime() > Date.now();
    case "offline":
      return state.cachedExpiry.getTime() > Date.now();
    default:
      return false;
  }
}

function getTierFromState(state: SubscriptionState): SubscriptionTier {
  switch (state.status) {
    case "premium":
      return state.tier;
    case "free":
    case "unknown":
    case "expired":
    case "offline":
      return "free";
    default:
      return "free";
  }
}

function getExpiryFromState(state: SubscriptionState): Date | null {
  switch (state.status) {
    case "premium":
      return state.expiry;
    case "expired":
      return state.graceEnd;
    case "offline":
      return state.cachedExpiry;
    default:
      return null;
  }
}

async function readSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeSecureItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Best-effort secure storage; failures are non-fatal
  }
}

async function loadCache(): Promise<SubscriptionCache | null> {
  const raw = await readSecureItem(SECURE_STORE_KEY_CACHE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SubscriptionCache;
  } catch {
    return null;
  }
}

async function saveCache(cache: SubscriptionCache): Promise<void> {
  await writeSecureItem(SECURE_STORE_KEY_CACHE, JSON.stringify(cache));
}

function buildStateFromCache(cache: SubscriptionCache): SubscriptionState {
  const now = Date.now();

  if (cache.status === "free") {
    return { status: "free" };
  }

  if (cache.status === "expired") {
    const graceEnd = cache.expiryDate
      ? new Date(new Date(cache.expiryDate).getTime() + getGracePeriodMs())
      : new Date(now - 1);
    return { status: "expired", graceEnd };
  }

  // cache.status === 'premium'
  if (cache.expiryDate) {
    const expiry = new Date(cache.expiryDate);
    if (expiry.getTime() > now) {
      return {
        status: "premium",
        expiry,
        tier: cache.tier ?? "monthly",
      };
    }
    // Expired but may be in grace period
    const graceEnd = new Date(expiry.getTime() + getGracePeriodMs());
    return { status: "expired", graceEnd };
  }

  // No expiry date but marked premium — treat as free to be safe
  return { status: "free" };
}

async function fetchSubscriptionStatus(userId: string): Promise<{
  status: "free" | "premium" | "expired";
  tier: "monthly" | "annual" | null;
  expiryDate: string | null;
}> {
  const { data, error } = await supabase.functions.invoke(
    "validate-subscription",
    {
      body: { userId },
    },
  );

  if (error) {
    throw error;
  }

  return {
    status: data?.status ?? "free",
    tier: data?.tier ?? null,
    expiryDate: data?.expiryDate ?? null,
  };
}

// Core Implementation

async function initialize(): Promise<void> {
  if (_initialized) return;

  // 1. Check for stored anonymous user ID
  let anonId = await readSecureItem(SECURE_STORE_KEY_ANON_ID);

  // 2. If none exists, sign in anonymously
  if (!anonId) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      // If anonymous auth fails, we stay in 'unknown' state
      // The app can still function; premium features will be gated
      _state = { status: "unknown" };
      _initialized = true;
      return;
    }
    anonId = data.user?.id ?? null;
    if (anonId) {
      await writeSecureItem(SECURE_STORE_KEY_ANON_ID, anonId);
    }
  } else {
    // Ensure Supabase session is active for this user
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      // Session expired or missing; try to refresh or re-authenticate
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        // Re-authenticate anonymously
        const { data: newAuthData, error: newAuthError } =
          await supabase.auth.signInAnonymously();
        if (!newAuthError && newAuthData.user?.id) {
          anonId = newAuthData.user.id;
          await writeSecureItem(SECURE_STORE_KEY_ANON_ID, anonId);
        }
      }
    }
  }

  _anonymousUserId = anonId;

  // 3. Read subscription cache
  const cache = await loadCache();

  if (cache && anonId) {
    _state = buildStateFromCache(cache);

    // If cache is stale, trigger a background refresh
    if (isCacheStale(cache.lastCheckedAt)) {
      // Don't await — let initialization complete quickly
      refreshStatus().catch(() => {
        // Swallow errors; cache is already loaded
      });
    }
  } else {
    // No cache yet — default to free
    _state = { status: "free" };

    // Initialize cache with free status
    if (anonId) {
      const newCache: SubscriptionCache = {
        anonymousUserId: anonId,
        status: "free",
        tier: null,
        expiryDate: null,
        lastCheckedAt: new Date().toISOString(),
        receiptToken: null,
      };
      await saveCache(newCache);
    }
  }

  _initialized = true;
}

function isPremium(): boolean {
  return isPremiumFromState(_state);
}

function getExpiryDate(): Date | null {
  return getExpiryFromState(_state);
}

function getTier(): SubscriptionTier {
  return getTierFromState(_state);
}

async function refreshStatus(): Promise<void> {
  if (!_anonymousUserId) {
    // Can't refresh without a user
    return;
  }

  try {
    const result = await fetchSubscriptionStatus(_anonymousUserId);

    const cache: SubscriptionCache = {
      anonymousUserId: _anonymousUserId,
      status: result.status,
      tier: result.tier,
      expiryDate: result.expiryDate,
      lastCheckedAt: new Date().toISOString(),
      receiptToken: null, // Preserved below
    };

    // Preserve existing receipt token if we have one
    const existingCache = await loadCache();
    if (existingCache?.receiptToken) {
      cache.receiptToken = existingCache.receiptToken;
    }

    await saveCache(cache);
    _state = buildStateFromCache(cache);
  } catch {
    // Network or server error — fall back to cached state with offline logic
    const cache = await loadCache();
    if (cache) {
      // Determine if we should grant offline premium based on cached expiry
      if (cache.expiryDate) {
        const expiry = new Date(cache.expiryDate);
        const now = Date.now();
        if (expiry.getTime() > now) {
          _state = { status: "offline", cachedExpiry: expiry };
        } else {
          // Cached expiry is in the past; check grace period
          const graceEnd = new Date(expiry.getTime() + getGracePeriodMs());
          if (graceEnd.getTime() > now) {
            _state = { status: "offline", cachedExpiry: graceEnd };
          } else {
            _state = { status: "free" };
          }
        }
      } else {
        _state = { status: "free" };
      }
    } else {
      _state = { status: "free" };
    }
  }
}

function getAnonymousUserId(): string | null {
  return _anonymousUserId;
}

async function markRestored(): Promise<void> {
  if (!_anonymousUserId) return;

  const cache: SubscriptionCache = {
    anonymousUserId: _anonymousUserId,
    status: "premium",
    tier: null,
    expiryDate: null,
    lastCheckedAt: new Date().toISOString(),
    receiptToken: null,
  };

  await saveCache(cache);
  _state = buildStateFromCache(cache);

  // Trigger a refresh to get accurate data from the server
  await refreshStatus();
}

// Exported Singleton

export const subscriptionCore: SubscriptionCore = {
  initialize,
  isPremium,
  getExpiryDate,
  getTier,
  refreshStatus,
  getAnonymousUserId,
  markRestored,
};
