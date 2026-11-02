import { selectPaymentProvider } from '../payments/selectPaymentProvider';

export {
  PremiumNotGrantedError,
  usePremium,
} from '../payments/PaymentContext';

/**
 * Compatibility entry point for the screens. Renders whichever payment
 * provider the selector picks, RevenueCat by default.
 */
export const PremiumProvider = selectPaymentProvider();
