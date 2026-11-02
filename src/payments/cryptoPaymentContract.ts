/**
 * Shared props for the Bitcoin purchase UI. Both the real SatSale module and
 * the store no-op stub import these so `tsc`, which only sees the stub through
 * the `@crypto-payment` alias, cannot drift from the bundled implementation.
 */
export type CryptoPaywallActionProps = {
  pending: boolean;
  disabled?: boolean;
  /** Synchronous by design: the action only toggles local UI state. */
  onPress: () => void;
};

export type CryptoPaywallLegalProps = Record<string, never>;

export type CryptoPaymentModalProps = {
  onClose: () => void;
};
