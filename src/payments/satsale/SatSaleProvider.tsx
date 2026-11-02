import type { ComponentType } from 'react';
import {
  defaultPaymentContextValue,
  PaymentContext,
  PaymentProviderProps,
} from '../PaymentContext';

/**
 * Placeholder SatSale provider: the build boots without RevenueCat, but no
 * purchase flow is wired yet. Ticket 03 replaces this with the API client,
 * license cache, and entitlement checks.
 */
export function SatSaleProvider({ children }: PaymentProviderProps) {
  return (
    <PaymentContext.Provider
      value={{
        ...defaultPaymentContextValue,
        isLoading: false,
        isEntitlementLoaded: true,
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
}

export const PaymentProvider: ComponentType<PaymentProviderProps> =
  SatSaleProvider;
