import React from 'react';
import { Platform, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import Purchases from 'react-native-purchases';
import { getCachedPremium, setCachedPremium } from '../db/premium';
import { PremiumProvider, usePremium } from './PremiumProvider';

jest.mock('./DatabaseProvider', () => ({
  useDatabase: () => ({ isReady: true }),
}));

jest.mock('../db/premium', () => ({
  getCachedPremium: jest.fn(),
  setCachedPremium: jest.fn(),
}));

jest.mock('react-native-purchases', () => {
  const listeners: ((info: unknown) => void)[] = [];
  const purchases = {
    setLogLevel: jest.fn().mockResolvedValue(undefined),
    configure: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(
      (listener: (info: unknown) => void) => {
        listeners.push(listener);
      },
    ),
    removeCustomerInfoUpdateListener: jest.fn(
      (listener: (info: unknown) => void) => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    ),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    __listeners: listeners,
  };

  return {
    __esModule: true,
    default: purchases,
    isPurchasesError: jest.fn(() => false),
    LOG_LEVEL: { DEBUG: 'DEBUG', WARN: 'WARN' },
    PACKAGE_TYPE: { LIFETIME: 'LIFETIME' },
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR' },
  };
});

type MockPurchases = {
  configure: jest.Mock;
  setLogLevel: jest.Mock;
  getCustomerInfo: jest.Mock;
  getOfferings: jest.Mock;
  purchasePackage: jest.Mock;
  restorePurchases: jest.Mock;
  __listeners: ((info: CustomerInfo) => void)[];
};

const purchases = Purchases as unknown as MockPurchases;
const getCachedPremiumMock = getCachedPremium as jest.Mock;
const setCachedPremiumMock = setCachedPremium as jest.Mock;

const LIFETIME_PACKAGE = {
  identifier: '$rc_lifetime',
  packageType: 'LIFETIME',
  product: { priceString: '$14.99' },
} as unknown as PurchasesPackage;

function customerInfo(entitled: boolean): CustomerInfo {
  return {
    entitlements: {
      active: entitled ? { cheddar_pro: { identifier: 'cheddar_pro' } } : {},
      all: {},
    },
  } as unknown as CustomerInfo;
}

let premium: ReturnType<typeof usePremium>;

function Consumer() {
  premium = usePremium();
  return (
    <Text testID="premium-state">{premium.isPremium ? 'premium' : 'free'}</Text>
  );
}

function renderProvider() {
  return render(
    <PremiumProvider>
      <Consumer />
    </PremiumProvider>,
  );
}

function premiumState(screen: ReturnType<typeof render>) {
  return screen.getByTestId('premium-state').props.children;
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.EXPO_PUBLIC_RC_API_KEY_IOS = 'test_ios_key';
  (Platform as unknown as { OS: string }).OS = 'ios';

  getCachedPremiumMock.mockReset();
  getCachedPremiumMock.mockResolvedValue(false);
  setCachedPremiumMock.mockReset();
  setCachedPremiumMock.mockResolvedValue(undefined);

  purchases.configure.mockReset();
  purchases.setLogLevel.mockReset().mockResolvedValue(undefined);
  purchases.getCustomerInfo.mockReset();
  purchases.getOfferings.mockReset();
  purchases.getOfferings.mockResolvedValue({ current: null });
  purchases.purchasePackage.mockReset();
  purchases.restorePurchases.mockReset();
  purchases.__listeners.length = 0;
});

afterEach(() => {
  warnSpy.mockRestore();
  (Platform as unknown as { OS: string }).OS = 'ios';
});

describe('PremiumProvider', () => {
  it('skips the SDK on web and reports not premium', async () => {
    (Platform as unknown as { OS: string }).OS = 'web';
    getCachedPremiumMock.mockResolvedValue(true);

    const screen = renderProvider();

    await waitFor(() => expect(premium.isLoading).toBe(false));
    expect(premiumState(screen)).toBe('free');
    expect(getCachedPremiumMock).not.toHaveBeenCalled();
    expect(purchases.configure).not.toHaveBeenCalled();
    expect(purchases.__listeners).toHaveLength(0);
  });

  it('initializes the SDK and caches the live entitlement on launch', async () => {
    purchases.getCustomerInfo.mockResolvedValue(customerInfo(true));

    const screen = renderProvider();

    await waitFor(() => expect(premiumState(screen)).toBe('premium'));

    expect(purchases.configure).toHaveBeenCalledTimes(1);
    expect(purchases.configure).toHaveBeenCalledWith({ apiKey: 'test_ios_key' });
    expect(setCachedPremiumMock).toHaveBeenCalledWith(true);
    expect(purchases.__listeners).toHaveLength(1);
  });

  it('keeps the cached entitlement when the network is unavailable', async () => {
    getCachedPremiumMock.mockResolvedValue(true);
    purchases.getCustomerInfo.mockRejectedValue(new Error('offline'));
    purchases.getOfferings.mockRejectedValue(new Error('offline'));

    const screen = renderProvider();

    await waitFor(() => expect(premium.isLoading).toBe(false));
    expect(premiumState(screen)).toBe('premium');
    expect(setCachedPremiumMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[premium] Failed to load RevenueCat state',
      expect.any(Error),
    );
  });

  it('applies the live entitlement even when offerings fail', async () => {
    purchases.getCustomerInfo.mockResolvedValue(customerInfo(true));
    purchases.getOfferings.mockRejectedValue(new Error('offerings unavailable'));

    const screen = renderProvider();

    await waitFor(() => expect(premiumState(screen)).toBe('premium'));
    expect(premium.lifetimePackage).toBeNull();
  });

  it('reloads offerings after an initial failure', async () => {
    purchases.getCustomerInfo.mockResolvedValue(customerInfo(false));
    purchases.getOfferings
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        current: { availablePackages: [LIFETIME_PACKAGE] },
      });

    const screen = renderProvider();

    await waitFor(() => expect(premium.isLoading).toBe(false));
    expect(premium.lifetimePackage).toBeNull();

    await act(async () => {
      await premium.refreshOfferings();
    });

    expect(premium.lifetimePackage).toBe(LIFETIME_PACKAGE);
  });

  it('revokes premium when the listener reports a refund', async () => {
    getCachedPremiumMock.mockResolvedValue(true);
    purchases.getCustomerInfo.mockResolvedValue(customerInfo(true));

    const screen = renderProvider();

    await waitFor(() => expect(premiumState(screen)).toBe('premium'));

    await act(async () => {
      purchases.__listeners[0](customerInfo(false));
    });

    await waitFor(() => expect(premiumState(screen)).toBe('free'));
    expect(setCachedPremiumMock).toHaveBeenLastCalledWith(false);
  });

  it('grants premium when the listener reports an active entitlement', async () => {
    purchases.getCustomerInfo.mockResolvedValue(customerInfo(false));

    const screen = renderProvider();

    await waitFor(() => expect(premium.isLoading).toBe(false));
    expect(premiumState(screen)).toBe('free');

    await act(async () => {
      purchases.__listeners[0](customerInfo(true));
    });

    await waitFor(() => expect(premiumState(screen)).toBe('premium'));
    expect(setCachedPremiumMock).toHaveBeenLastCalledWith(true);
  });

  it('flips to premium and caches the purchase result', async () => {
    purchases.getCustomerInfo.mockResolvedValue(customerInfo(false));
    purchases.getOfferings.mockResolvedValue({
      current: { availablePackages: [LIFETIME_PACKAGE] },
    });
    purchases.purchasePackage.mockResolvedValue({
      customerInfo: customerInfo(true),
    });

    const screen = renderProvider();

    await waitFor(() =>
      expect(premium.lifetimePackage).toBe(LIFETIME_PACKAGE),
    );

    let purchased: boolean | undefined;
    await act(async () => {
      purchased = await premium.purchaseLifetime();
    });

    expect(purchased).toBe(true);
    await waitFor(() => expect(premiumState(screen)).toBe('premium'));
    expect(setCachedPremiumMock).toHaveBeenLastCalledWith(true);
  });

  it('restores a previous purchase and caches it', async () => {
    purchases.getCustomerInfo.mockResolvedValue(customerInfo(false));
    purchases.restorePurchases.mockResolvedValue(customerInfo(true));

    const screen = renderProvider();

    await waitFor(() => expect(premium.isLoading).toBe(false));

    let restored: boolean | undefined;
    await act(async () => {
      restored = await premium.restorePurchases();
    });

    expect(restored).toBe(true);
    await waitFor(() => expect(premiumState(screen)).toBe('premium'));
    expect(setCachedPremiumMock).toHaveBeenLastCalledWith(true);
  });

  it('removes the customer info listener on unmount', async () => {
    purchases.getCustomerInfo.mockResolvedValue(customerInfo(false));

    const screen = renderProvider();

    await waitFor(() => expect(purchases.__listeners).toHaveLength(1));

    screen.unmount();

    expect(purchases.__listeners).toHaveLength(0);
  });

});
