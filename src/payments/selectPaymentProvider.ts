import type { ComponentType } from 'react';
import type { PaymentProviderProps } from './PaymentContext';
import { RevenueCatProvider } from './revenuecat/RevenueCatProvider';

/**
 * Default (store) payment provider. Metro resolves the `@payment-provider`
 * specifier to the SatSale module when APP_VARIANT=satsale, so only one
 * provider is ever bundled. See metro.config.js.
 */
export const PaymentProvider: ComponentType<PaymentProviderProps> =
  RevenueCatProvider;
