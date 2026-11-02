import type {
  CryptoPaywallActionProps,
  CryptoPaywallLegalProps,
  CryptoPaymentModalProps,
} from './cryptoPaymentContract';

/**
 * Store-build stand-in for the Bitcoin purchase UI. Metro swaps this module
 * for the real one when APP_VARIANT=satsale, so no Bitcoin copy ships in the
 * store bundle.
 */
export type {
  CryptoPaywallActionProps,
  CryptoPaywallLegalProps,
  CryptoPaymentModalProps,
};

export function CryptoPaywallAction(_props: CryptoPaywallActionProps) {
  return null;
}

export function CryptoPaywallLegal(_props: CryptoPaywallLegalProps) {
  return null;
}

export function CryptoPaymentModal(_props: CryptoPaymentModalProps) {
  return null;
}
