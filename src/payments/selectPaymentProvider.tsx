import type { ComponentType } from 'react';
import type { PaymentProviderProps } from './PaymentContext';
import { RevenueCatProvider } from './revenuecat/RevenueCatProvider';

export type PaymentProviderId = 'revenuecat';

const PAYMENT_PROVIDERS: Record<
  PaymentProviderId,
  ComponentType<PaymentProviderProps>
> = {
  revenuecat: RevenueCatProvider,
};

/**
 * Chooses the payment provider for this build. RevenueCat is the default;
 * ticket 02 turns this into the APP_VARIANT-aware selection.
 */
export function selectPaymentProvider(
  id: PaymentProviderId = 'revenuecat',
): ComponentType<PaymentProviderProps> {
  return PAYMENT_PROVIDERS[id];
}
