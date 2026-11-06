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

export const CRYPTO_STATUS_NAMES = [
  'pending',
  'detected',
  'paid',
  'expired',
  'invalid',
  'revoked',
] as const;

export type CryptoStatusName = (typeof CRYPTO_STATUS_NAMES)[number];

/** A SatSale invoice as returned by the purchase API. */
export type CryptoInvoice = {
  license: string;
  licenseFormatted: string;
  address: string;
  btcValue: number;
  uri: string;
  /** ISO timestamp; empty for a status that has no invoice. */
  expiresAt: string;
};

/**
 * The invoice plus the live reconciliation state. Pending and detected
 * responses carry the invoice fields so the payment modal can resume.
 */
export type CryptoStatus = CryptoInvoice & {
  status: CryptoStatusName;
  confirmedPaid: number | null;
  unconfirmedPaid: number | null;
  secondsRemaining: number;
};

export type CryptoPrice = {
  amount: number;
  currency: string;
};

/**
 * The optional Bitcoin purchase flow. RevenueCat reports null; the SatSale
 * build fills it in. Keeping it behind the shared context lets the paywall
 * and the payment modal stay provider-neutral.
 */
export type CryptoPaymentValue = {
  price: CryptoPrice | null;
  supportEmail: string | null;
  pendingInvoice: CryptoInvoice | null;
  createInvoice: () => Promise<CryptoInvoice>;
  /**
   * Checks a license. Defaults to the stored or pending license and rejects
   * when there is none; pass a license only for a code that is not stored.
   */
  checkStatus: (license?: string) => Promise<CryptoStatus>;
  restoreLicense: (license: string) => Promise<CryptoStatus>;
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
  /** Non-null only in the build that sells with Bitcoin. */
  crypto: CryptoPaymentValue | null;
};

export class PremiumNotGrantedError extends Error {
  constructor() {
    super('The purchase completed but the premium entitlement is not active');
    this.name = 'PremiumNotGrantedError';
  }
}

export const defaultPaymentContextValue: PaymentContextValue = {
  isPremium: false,
  isLoading: true,
  isEntitlementLoaded: false,
  lifetimePackage: null,
  refreshOfferings: async () => {},
  purchaseLifetime: async () => false,
  restorePurchases: async () => false,
  crypto: null,
};

export const PaymentContext = createContext<PaymentContextValue>(
  defaultPaymentContextValue,
);

export interface PaymentProviderProps {
  children: ReactNode;
}

export function usePremium() {
  return useContext(PaymentContext);
}
