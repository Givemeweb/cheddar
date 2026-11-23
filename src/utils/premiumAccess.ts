import type { Href } from 'expo-router';

export type StatsGateReason = 'statsHistory' | 'totalStats';

export type PaywallReason = StatsGateReason | 'bankConnections';

export function paywallHref(reason: PaywallReason): Href {
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
  return isPremium ? '/total-stats' : paywallHref('totalStats');
}

/**
 * Bank connections are premium-only: free taps land on the paywall with the
 * bank-connections reason, premium taps open the connect screen.
 */
export function bankConnectionsDestination(isPremium: boolean): Href {
  return isPremium
    ? '/configuration/bank-connections'
    : paywallHref('bankConnections');
}

/**
 * The connect screen re-checks the entitlement itself so deep links cannot
 * bypass the entry-point gate. 'wait' means the cached entitlement has not
 * resolved yet, an href is a paywall redirect, null lets a premium user in.
 */
export function bankConnectionsGate(
  isEntitlementLoaded: boolean,
  isPremium: boolean,
): Href | 'wait' | null {
  if (!isEntitlementLoaded) return 'wait';
  return isPremium ? null : paywallHref('bankConnections');
}

/**
 * Press gate for the configuration row: a null return ignores the tap while
 * the cached entitlement is still loading, so a premium user on a cold start
 * is never sent to the paywall by mistake.
 */
export function bankConnectionsPress(
  isEntitlementLoaded: boolean,
  isPremium: boolean,
): Href | null {
  if (!isEntitlementLoaded) return null;
  return bankConnectionsDestination(isPremium);
}
