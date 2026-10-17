import {
  convertWithRates,
} from './exchangeRates';

// EUR-based rate table, matching frankfurter.dev's response shape
const RATES = {
  USD: 1.1206,
  GBP: 0.84763,
  JPY: 177.34,
  SEK: 11.1675,
};
const BASE = 'EUR';

describe('convertWithRates', () => {
  it('returns the amount unchanged when currencies match', () => {
    expect(convertWithRates(100, 'EUR', 'EUR', RATES, BASE)).toBe(100);
    expect(convertWithRates(100, 'USD', 'USD', RATES, BASE)).toBe(100);
  });

  it('converts from the base currency to another currency', () => {
    // 100 EUR -> USD at 1.1206
    expect(convertWithRates(100, 'EUR', 'USD', RATES, BASE)).toBeCloseTo(112.06, 6);
  });

  it('converts from another currency back to the base currency', () => {
    // 112.06 USD -> EUR should round-trip to 100
    expect(convertWithRates(112.06, 'USD', 'EUR', RATES, BASE)).toBeCloseTo(100, 4);
  });

  it('converts between two non-base currencies through the pivot', () => {
    // 100 USD -> GBP: (100 / 1.1206) * 0.84763
    const expected = (100 / RATES.USD) * RATES.GBP;
    expect(convertWithRates(100, 'USD', 'GBP', RATES, BASE)).toBeCloseTo(expected, 6);
  });

  it('round-trips through the pivot without losing value', () => {
    const original = 250;
    const toUsd = convertWithRates(original, 'SEK', 'USD', RATES, BASE);
    const backToSek = convertWithRates(toUsd, 'USD', 'SEK', RATES, BASE);
    expect(backToSek).toBeCloseTo(original, 6);
  });

  it('handles negative amounts (expenses/transfers)', () => {
    expect(convertWithRates(-50, 'EUR', 'USD', RATES, BASE)).toBeCloseTo(-56.03, 6);
  });

  it('returns the amount unchanged when a currency is unknown', () => {
    expect(convertWithRates(100, 'EUR', 'XYZ', RATES, BASE)).toBe(100);
    expect(convertWithRates(100, 'XYZ', 'EUR', RATES, BASE)).toBe(100);
  });

  it('returns the amount unchanged for empty currency codes', () => {
    expect(convertWithRates(100, '', 'USD', RATES, BASE)).toBe(100);
    expect(convertWithRates(100, 'EUR', '', RATES, BASE)).toBe(100);
  });
});
