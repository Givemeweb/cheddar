import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PaywallScreen from '../../app/paywall';
import {
  PaymentContext,
  type PaymentContextValue,
} from '../payments/PaymentContext';

// The store build resolves @crypto-payment to the no-op stub in metro.config.js.
jest.mock('@crypto-payment', () => require('./cryptoDisabled'));

// Render the screen with a supplied context instead of booting the native
// RevenueCat provider.
jest.mock('../components/PremiumProvider', () => {
  const context = jest.requireActual('../payments/PaymentContext');
  return {
    PremiumNotGrantedError: context.PremiumNotGrantedError,
    usePremium: context.usePremium,
  };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
}));

jest.mock('../components/ThemeProvider', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('../db/premium', () => ({
  FREE_LIMITS: { accounts: 3, categories: 5 },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { price?: string }) =>
      options?.price ? `${key} ${options.price}` : key,
  }),
}));

function paymentContext(): PaymentContextValue {
  return {
    isPremium: false,
    isLoading: false,
    isEntitlementLoaded: true,
    lifetimePackage: { product: { priceString: '$14.99' } },
    refreshOfferings: jest.fn(),
    purchaseLifetime: jest.fn().mockResolvedValue(true),
    restorePurchases: jest.fn().mockResolvedValue(true),
    crypto: null,
  };
}

function renderPaywall(value: PaymentContextValue) {
  return render(
    <PaymentContext.Provider value={value}>
      <PaywallScreen />
    </PaymentContext.Provider>,
  );
}

describe('store paywall', () => {
  it('shows the RevenueCat price, buy, and restore actions', async () => {
    const value = paymentContext();
    const screen = renderPaywall(value);

    expect(screen.getByTestId('paywall-price')).toHaveTextContent('$14.99');
    expect(screen.getByTestId('paywall-buy')).toHaveTextContent(
      'premium.buy $14.99',
    );
    expect(screen.getByTestId('paywall-restore')).toHaveTextContent(
      'premium.restore',
    );
    expect(screen.queryByTestId('paywall-bitcoin')).toBeNull();
    expect(screen.queryByTestId('paywall-restore-license')).toBeNull();

    fireEvent.press(screen.getByTestId('paywall-buy'));
    await waitFor(() => expect(value.purchaseLifetime).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('paywall-restore'));
    await waitFor(() => expect(value.restorePurchases).toHaveBeenCalled());
  });
});
