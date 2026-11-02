import { PaymentProvider } from '@payment-provider';

export {
  PremiumNotGrantedError,
  usePremium,
} from '../payments/PaymentContext';

/**
 * Compatibility entry point for the screens. Renders whichever payment
 * provider Metro selected for the build variant (RevenueCat for store,
 * SatSale for the Bitcoin build).
 */
export const PremiumProvider = PaymentProvider;
