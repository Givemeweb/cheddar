import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import PaywallScreen from '../../app/paywall';
import {
  PaymentContext,
  type CryptoPaymentValue,
  type PaymentContextValue,
} from '../payments/PaymentContext';

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

function cryptoPayment(): CryptoPaymentValue {
  return {
    price: { amount: 19, currency: 'USD' },
    supportEmail: 'support@example.com',
    pendingInvoice: null,
    createInvoice: jest.fn(() => new Promise(() => {})),
    checkStatus: jest.fn(),
    restoreLicense: jest.fn(),
  };
}

function paymentContext(payment: CryptoPaymentValue): PaymentContextValue {
  return {
    isPremium: false,
    isLoading: false,
    isEntitlementLoaded: true,
    lifetimePackage: { product: { priceString: '$19.00' } },
    refreshOfferings: jest.fn(),
    purchaseLifetime: jest.fn(),
    restorePurchases: jest.fn(),
    crypto: payment,
  };
}

function renderPaywall(value: PaymentContextValue) {
  return render(
    <PaymentContext.Provider value={value}>
      <PaywallScreen />
    </PaymentContext.Provider>,
  );
}

describe('SatSale paywall', () => {
  it('shows the Bitcoin flow and no RevenueCat actions', () => {
    const value = paymentContext(cryptoPayment());
    const screen = renderPaywall(value);

    expect(screen.getByTestId('paywall-bitcoin')).toHaveTextContent(
      'Pay with Bitcoin',
    );
    expect(screen.getByTestId('paywall-restore-license')).toBeTruthy();
    expect(screen.getByTestId('paywall-price')).toHaveTextContent('$19.00');
    expect(screen.queryByTestId('paywall-buy')).toBeNull();
    expect(screen.queryByTestId('paywall-restore')).toBeNull();

    fireEvent.press(screen.getByTestId('paywall-bitcoin'));
    expect(screen.getByTestId('bitcoin-payment-creating')).toBeTruthy();
  });
});
