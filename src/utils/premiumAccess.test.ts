import {
  canBrowseStatsMonth,
  statsPaywallHref,
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
      statsPaywallHref('totalStats'),
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
