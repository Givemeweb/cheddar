import { createContext, ReactNode, useContext } from 'react';

/**
 * The display data the paywall reads from a purchasable item. RevenueCat
 * passes its package through unchanged; another provider only needs the
 * price string.
 */
export type PaymentPackage = {
  product: {
    priceString: string;
  };
};

export type PaymentContextValue = {
  isPremium: boolean;
  isLoading: boolean;
  /**
   * True once the cached entitlement has been read. The provider sync may
   * still be running, so `isLoading` can stay true for longer.
   */
  isEntitlementLoaded: boolean;
  lifetimePackage: PaymentPackage | null;
  /**
   * Reloads the price/offerings. Rejects with the provider's own error when
   * the store cannot be reached.
   */
  refreshOfferings: () => Promise<void>;
  /**
   * Starts the lifetime purchase. Resolves true when the entitlement is
   * active and false when the user cancels. Rejects with
   * `PremiumNotGrantedError` when the purchase completes without an active
   * entitlement, and with the provider error otherwise.
   */
  purchaseLifetime: () => Promise<boolean>;
  /**
   * Restores previous purchases. Resolves with the resulting entitlement
   * state; rejects when the provider call fails.
   */
  restorePurchases: () => Promise<boolean>;
};

export class PremiumNotGrantedError extends Error {
  constructor() {
    super('The purchase completed but the premium entitlement is not active');
    this.name = 'PremiumNotGrantedError';
  }
}

export const PaymentContext = createContext<PaymentContextValue>({
  isPremium: false,
  isLoading: true,
  isEntitlementLoaded: false,
  lifetimePackage: null,
  refreshOfferings: async () => {},
  purchaseLifetime: async () => false,
  restorePurchases: async () => false,
});

export interface PaymentProviderProps {
  children: ReactNode;
}

export function usePremium() {
  return useContext(PaymentContext);
}
