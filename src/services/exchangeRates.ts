/**
 * Exchange rate service powered by frankfurter.dev (free, no API key).
 *
 * Rates are quoted against the app's default currency (EUR) which acts as
 * the pivot: converting between any two currencies goes through EUR.
 * Rates are cached in AsyncStorage with a TTL to keep the app usable offline
 * and to avoid hammering the API.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const RATES_CACHE_KEY = 'exchangeRatesCache';
const RATES_TTL_MS = 12 * 60 * 60 * 1000; // refresh at most twice a day

export interface RatesCache {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number; // epoch ms
  date: string; // rate date reported by the API (YYYY-MM-DD)
}

let memoryCache: RatesCache | null = null;

async function readCache(): Promise<RatesCache | null> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RatesCache;
    memoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(cache: RatesCache): Promise<void> {
  memoryCache = cache;
  try {
    await AsyncStorage.setItem(RATES_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable: memory cache still covers this session.
  }
}

/**
 * Fetch latest rates (base EUR) from frankfurter.dev.
 * Uses the cache when it is fresh; falls back to a stale cache when offline.
 * Returns null when no rates are available at all.
 */
export async function getLatestRates(forceRefresh = false): Promise<RatesCache | null> {
  const cached = await readCache();
  const isFresh = cached && Date.now() - cached.fetchedAt < RATES_TTL_MS;

  if (!forceRefresh && isFresh && cached) {
    return cached;
  }

  try {
    const response = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR');
    if (!response.ok) throw new Error(`Frankfurter responded ${response.status}`);
    const data = (await response.json()) as {
      base: string;
      rates: Record<string, number>;
      date: string;
    };
    const cache: RatesCache = {
      base: data.base,
      rates: data.rates,
      fetchedAt: Date.now(),
      date: data.date,
    };
    await writeCache(cache);
    return cache;
  } catch (error) {
    console.warn('[exchangeRates] fetch failed, using cached rates:', error);
    return cached;
  }
}

/**
 * Convert an amount from one currency to another via the EUR pivot.
 * Returns the original amount when currencies match or rates are unavailable.
 */
export async function convertAmount(
  amount: number,
  from: string,
  to: string,
): Promise<number> {
  if (!from || !to || from === to) return amount;
  const cache = await getLatestRates();
  if (!cache) return amount;

  return convertWithRates(amount, from, to, cache.rates, cache.base);
}

/** Pure conversion helper (synchronous, testable). */
export function convertWithRates(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
  base: string,
): number {
  if (!from || !to || from === to) return amount;

  const rateOf = (code: string): number => (code === base ? 1 : rates[code]);

  const fromRate = rateOf(from);
  const toRate = rateOf(to);
  if (fromRate === undefined || toRate === undefined || !fromRate || !toRate) {
    return amount; // unknown currency: leave untouched rather than corrupt data
  }

  // amount in `from` -> base -> `to`
  return (amount / fromRate) * toRate;
}

/** Epoch timestamp of the last successful rate fetch (null if never). */
export async function getRatesTimestamp(): Promise<number | null> {
  const cache = await readCache();
  return cache ? cache.fetchedAt : null;
}

/** Rate date (YYYY-MM-DD) used by the current cache, null if never fetched. */
export async function getRatesDate(): Promise<string | null> {
  const cache = await readCache();
  return cache ? cache.date : null;
}
