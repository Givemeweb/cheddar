import {
  bankConnectionsDestination,
  bankConnectionsGate,
  bankConnectionsPress,
  canBrowseStatsMonth,
  paywallHref,
  totalStatsDestination,
} from './premiumAccess';

// Mid-month "today" so day-of-month never affects the boundary assertions.
const NOW = new Date(2026, 9, 15);

describe('free stats month paging', () => {
  it('lets free users browse the current and the previous month', () => {
    expect(canBrowseStatsMonth(new Date(2026, 9, 1), NOW, false)).toBe(true);
    expect(canBrowseStatsMonth(new Date(2026, 8, 1), NOW, false)).toBe(true);
  });

  it('blocks free users from older months and from the future', () => {
    expect(canBrowseStatsMonth(new Date(2026, 7, 1), NOW, false)).toBe(false);
    expect(canBrowseStatsMonth(new Date(2026, 10, 1), NOW, false)).toBe(false);
  });

  it('keeps the two-month window across a year boundary', () => {
    const january = new Date(2027, 0, 10);
    expect(canBrowseStatsMonth(new Date(2026, 11, 1), january, false)).toBe(
      true,
    );
    expect(canBrowseStatsMonth(new Date(2026, 10, 1), january, false)).toBe(
      false,
    );
  });

  it('lets premium users browse any past month', () => {
    expect(canBrowseStatsMonth(new Date(2020, 0, 1), NOW, true)).toBe(true);
    expect(canBrowseStatsMonth(new Date(2026, 8, 1), NOW, true)).toBe(true);
  });
});

describe('total stats gate', () => {
  it('sends free users to the paywall', () => {
    expect(totalStatsDestination(false)).toEqual(
      paywallHref('totalStats'),
    );
    expect(totalStatsDestination(false)).toEqual({
      pathname: '/paywall',
      params: { reason: 'totalStats' },
    });
  });

  it('opens total stats for premium users', () => {
    expect(totalStatsDestination(true)).toBe('/total-stats');
  });
});

describe('bank connections gate', () => {
  it('sends free users to the paywall with the bank-connections reason', () => {
    expect(bankConnectionsDestination(false)).toEqual({
      pathname: '/paywall',
      params: { reason: 'bankConnections' },
    });
  });

  it('opens the connect screen for premium users', () => {
    expect(bankConnectionsDestination(true)).toBe(
      '/configuration/bank-connections',
    );
  });
});

describe('bank connections screen gate', () => {
  it('makes the screen wait while the cached entitlement has not loaded', () => {
    expect(bankConnectionsGate(false, false)).toBe('wait');
    expect(bankConnectionsGate(false, true)).toBe('wait');
  });

  it('redirects free users to the paywall from the screen itself', () => {
    expect(bankConnectionsGate(true, false)).toEqual({
      pathname: '/paywall',
      params: { reason: 'bankConnections' },
    });
  });

  it('lets premium users through the screen gate', () => {
    expect(bankConnectionsGate(true, true)).toBeNull();
  });
});

describe('bank connections row press gate', () => {
  it('ignores taps while the entitlement is still loading', () => {
    expect(bankConnectionsPress(false, false)).toBeNull();
    expect(bankConnectionsPress(false, true)).toBeNull();
  });

  it('routes loaded taps to the paywall or the connect screen', () => {
    expect(bankConnectionsPress(true, false)).toEqual({
      pathname: '/paywall',
      params: { reason: 'bankConnections' },
    });
    expect(bankConnectionsPress(true, true)).toBe(
      '/configuration/bank-connections',
    );
  });
});
