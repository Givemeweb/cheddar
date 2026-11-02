import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { usePremium } from '../PaymentContext';
import { SatSaleProvider } from './SatSaleProvider';

let premium: ReturnType<typeof usePremium>;

function Consumer() {
  premium = usePremium();
  return (
    <Text testID="premium-state">{premium.isPremium ? 'premium' : 'free'}</Text>
  );
}

describe('SatSaleProvider placeholder', () => {
  it('settles on the free tier without store purchases', async () => {
    const screen = render(
      <SatSaleProvider>
        <Consumer />
      </SatSaleProvider>,
    );

    expect(screen.getByTestId('premium-state').props.children).toBe('free');
    expect(premium.isLoading).toBe(false);
    expect(premium.isEntitlementLoaded).toBe(true);
    expect(premium.lifetimePackage).toBeNull();
    await expect(premium.refreshOfferings()).resolves.toBeUndefined();
    await expect(premium.purchaseLifetime()).resolves.toBe(false);
    await expect(premium.restorePurchases()).resolves.toBe(false);
  });
});
