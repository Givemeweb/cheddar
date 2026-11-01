import type { Href } from 'expo-router';

export type StatsGateReason = 'statsHistory' | 'totalStats';

export function statsPaywallHref(reason: StatsGateReason): Href {
  return { pathname: '/paywall', params: { reason } };
}

/**
 * Free users can page the stats donut through the current and the previous
 * month only. Premium users get the full history. Callers clamp navigation to
 * the current month themselves, since future months have no data.
 */
export function canBrowseStatsMonth(
  target: Date,
  now: Date,
  isPremium: boolean,
): boolean {
  if (isPremium) return true;

  // Compare calendar months, not exact timestamps, so the 1st and the 31st
  // of the same month behave identically.
  const monthsBack =
    (now.getFullYear() - target.getFullYear()) * 12 +
    now.getMonth() -
    target.getMonth();

  return monthsBack >= 0 && monthsBack <= 1;
}

/** The total-stats screen is premium-only; free taps land on the paywall. */
export function totalStatsDestination(isPremium: boolean): Href {
  return isPremium ? '/total-stats' : statsPaywallHref('totalStats');
}
