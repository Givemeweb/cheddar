import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Check,
  Clock,
  Share2,
  Wallet,
  X,
} from 'lucide-react-native';
import { useTheme } from '../../components/ThemeProvider';
import { usePremium } from '../PaymentContext';
import type { CryptoInvoice, CryptoStatus } from '../PaymentContext';
import { trackEvent } from '../../lib/analytics';
import { SatSaleApiError, normalizeLicense } from './api';
import type {
  CryptoPaywallActionProps,
  CryptoPaywallLegalProps,
  CryptoPaymentModalProps,
  CryptoRestoreFormProps,
} from '../cryptoPaymentContract';

/**
 * Bitcoin purchase UI for the SatSale build. Copy lives here instead of
 * en.json so the store bundle carries no Bitcoin strings; Metro swaps this
 * module for a no-op stub when APP_VARIANT=store.
 */
const POLL_INTERVAL_MS = 5_000;

const COPY = {
  title: 'Bitcoin payment',
  creating: 'Creating your invoice…',
  creatingHint: 'This usually takes a few seconds.',
  amount: 'Amount',
  address: 'Bitcoin address',
  share: 'Share',
  openWallet: 'Open wallet',
  check: 'Check payment',
  checking: 'Checking…',
  detected: 'Payment detected',
  detectedHint: 'Waiting for the network to confirm it.',
  awaitingHint: 'Send the exact amount to the address below.',
  expiresIn: 'Expires in',
  confirmed: 'Payment confirmed',
  licenseTitle: 'Your license code',
  licenseWarning:
    'Save this code. It is the only way to restore Premium and it will not be shown again.',
  shareLicense: 'Share license code',
  done: 'Done',
  expired: 'Invoice expired',
  expiredHint: 'This invoice is no longer valid. Create a new invoice to continue.',
  newInvoice: 'New invoice',
  createError: 'We could not create an invoice.',
  checkError: 'We could not check the payment.',
  errorHint: 'Check your connection and try again.',
  retry: 'Retry',
  legal: 'Bitcoin sales are final and non-refundable.',
  support: 'Questions? Contact {{email}}',
  payWithBitcoin: 'Pay with Bitcoin',
  completePayment: 'Complete payment',
  shareLicenseMessage: 'Cheddar Premium license: {{license}}',
  restoreTitle: 'Restore Premium',
  restoreHint: 'Enter the license code you saved when you paid with Bitcoin.',
  restorePlaceholder: 'ABCDE-FGHJK-MNPQR-STVWX',
  restoreButton: 'Restore Premium',
  restoreSuccess: 'Premium restored.',
  restorePending: 'That license code is valid, but the payment is still pending.',
  restoreDetected:
    'The payment was detected. Wait for the network to confirm it, then try again.',
  restoreExpired: 'That license code has expired.',
  restoreRevoked: 'That license code has been revoked.',
  restoreInvalid: 'That license code is not valid.',
  restoreError:
    'Could not check the license. Check your connection and try again.',
} as const;

type Phase =
  | 'creating'
  | 'awaiting'
  | 'detected'
  | 'checking'
  | 'confirmed'
  | 'expired'
  | 'error';

type ErrorAction = 'create' | 'check';

export type {
  CryptoPaywallActionProps,
  CryptoPaywallLegalProps,
  CryptoPaymentModalProps,
  CryptoRestoreFormProps,
} from '../cryptoPaymentContract';

/** Legal footer; shared by the paywall and the modal invoice screen. */
function LegalFooter({
  testIDPrefix,
  className = '',
}: {
  testIDPrefix: string;
  className?: string;
}) {
  const { crypto } = usePremium();
  const { isDark } = useTheme();
  if (!crypto) return null;

  const muted = isDark ? 'text-gray-500' : 'text-gray-400';

  return (
    <View className={className}>
      <Text
        testID={`${testIDPrefix}-legal`}
        className={`text-center text-xs ${muted}`}
      >
        {COPY.legal}
      </Text>
      {crypto.supportEmail ? (
        <Text
          testID={`${testIDPrefix}-support`}
          className={`mt-2 text-center text-xs ${muted}`}
        >
          {COPY.support.replace('{{email}}', crypto.supportEmail)}
        </Text>
      ) : null}
    </View>
  );
}

export function CryptoPaywallLegal(_props: CryptoPaywallLegalProps) {
  return <LegalFooter testIDPrefix="paywall-bitcoin" className="mt-8" />;
}

function formatBtc(value: number): string {
  return `${value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')} BTC`;
}

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function secondsUntil(expiresAt: string): number | null {
  if (!expiresAt) return null;
  const deadline = new Date(expiresAt).getTime();
  if (!Number.isFinite(deadline)) return null;
  return Math.max(0, Math.floor((deadline - Date.now()) / 1000));
}

/** The paywall action; labels follow the stored pending invoice. */
export function CryptoPaywallAction({
  pending,
  disabled = false,
  onPress,
}: CryptoPaywallActionProps) {
  return (
    <TouchableOpacity
      testID="paywall-bitcoin"
      className={`mt-5 flex-row items-center justify-center rounded-xl px-4 py-4 ${
        disabled ? 'bg-gray-400' : 'bg-cheddar-yellow'
      }`}
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className="text-base font-bold text-cheddar-dark">
        {pending ? COPY.completePayment : COPY.payWithBitcoin}
      </Text>
    </TouchableOpacity>
  );
}

type RestoreMessage = { kind: 'success' | 'info' | 'error'; text: string };

function restoreMessage(status: CryptoStatus['status']): RestoreMessage {
  switch (status) {
    case 'paid':
      return { kind: 'success', text: COPY.restoreSuccess };
    case 'pending':
      return { kind: 'info', text: COPY.restorePending };
    case 'detected':
      return { kind: 'info', text: COPY.restoreDetected };
    case 'expired':
      return { kind: 'error', text: COPY.restoreExpired };
    case 'revoked':
      return { kind: 'error', text: COPY.restoreRevoked };
    case 'invalid':
      return { kind: 'error', text: COPY.restoreInvalid };
  }
}

/**
 * Restores Premium from a saved license. The provider does the network call
 * and the reconciliation, so a paid, revoked, or expired code flips the same
 * cached entitlement as a startup check.
 */
export function CryptoRestoreForm(_props: CryptoRestoreFormProps) {
  const { crypto } = usePremium();
  const { isDark } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<RestoreMessage | null>(null);

  if (!crypto) return null;

  const strong = isDark ? 'text-cheddar-light' : 'text-cheddar-dark';
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  const handleRestore = async () => {
    if (busy) return;

    const license = normalizeLicense(code);
    if (!license) {
      setMessage({ kind: 'error', text: COPY.restoreInvalid });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const status = await crypto.restoreLicense(license);
      trackEvent('bitcoin.restore_checked', { status: status.status });
      setMessage(restoreMessage(status.status));
    } catch (error) {
      if (
        error instanceof SatSaleApiError &&
        error.code === 'invalid_license'
      ) {
        trackEvent('bitcoin.restore_failed', { reason: 'invalid' });
        setMessage({ kind: 'error', text: COPY.restoreInvalid });
      } else {
        console.warn('[crypto] Failed to restore the license', error);
        trackEvent('bitcoin.restore_failed', { reason: 'error' });
        setMessage({ kind: 'error', text: COPY.restoreError });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      testID="paywall-restore-license"
      className={`mt-6 rounded-2xl p-5 ${isDark ? 'bg-[#26282D]' : 'bg-white'}`}
    >
      <Text className={`text-base font-semibold ${strong}`}>
        {COPY.restoreTitle}
      </Text>
      <Text className={`mt-1 text-sm ${muted}`}>{COPY.restoreHint}</Text>
      <TextInput
        testID="paywall-license-input"
        value={code}
        onChangeText={(value) => {
          setCode(value);
          if (message) setMessage(null);
        }}
        placeholder={COPY.restorePlaceholder}
        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        className={`mt-4 rounded-xl border px-4 py-3 text-base ${isDark ? 'border-gray-700 bg-cheddar-dark text-cheddar-light' : 'border-gray-200 bg-cheddar-light text-cheddar-dark'}`}
      />
      <TouchableOpacity
        testID="paywall-license-restore"
        className={`mt-4 flex-row items-center justify-center rounded-xl px-4 py-3 ${busy ? 'bg-gray-400' : 'bg-cheddar-yellow'}`}
        activeOpacity={0.8}
        disabled={busy}
        onPress={() => void handleRestore()}
      >
        {busy ? (
          <ActivityIndicator color="#212226" />
        ) : (
          <Text className="text-base font-bold text-cheddar-dark">
            {COPY.restoreButton}
          </Text>
        )}
      </TouchableOpacity>
      {message ? (
        <Text
          testID="paywall-license-message"
          className={`mt-3 text-center text-sm ${
            message.kind === 'success'
              ? 'text-green-500'
              : message.kind === 'info'
                ? 'text-amber-500'
                : 'text-cheddar-expense'
          }`}
        >
          {message.text}
        </Text>
      ) : null}
    </View>
  );
}

export function CryptoPaymentModal({ onClose }: CryptoPaymentModalProps) {
  const { crypto } = usePremium();
  const { isDark } = useTheme();

  const [phase, setPhase] = useState<Phase>('creating');
  const [invoice, setInvoice] = useState<CryptoInvoice | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(0);
  const [license, setLicense] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<ErrorAction>('create');
  // The modal only mounts while the app is visible; background/foreground
  // transitions come from the AppState listener below.
  const [isActive, setIsActive] = useState(true);

  // Refs keep the async callbacks stable while they read the latest values.
  const mountedRef = useRef(true);
  const cryptoRef = useRef(crypto);

  const invoiceRef = useRef<CryptoInvoice | null>(null);
  const phaseRef = useRef<Phase>('creating');
  const deadlineRef = useRef(Number.POSITIVE_INFINITY);
  const checkingRef = useRef(false);
  const errorActionRef = useRef<ErrorAction>('create');
  const startedRef = useRef(false);
  const expiryCheckRef = useRef(false);

  const setPhaseSafe = useCallback((next: Phase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhase(next);
  }, []);

  const setErrorActionSafe = useCallback((next: ErrorAction) => {
    errorActionRef.current = next;
    if (mountedRef.current) setErrorAction(next);
  }, []);

  const setRemaining = useCallback((seconds: number) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    deadlineRef.current = Date.now() + safe * 1000;
    if (safe > 0) expiryCheckRef.current = false;
    if (mountedRef.current) setSecondsLeft(Math.floor(safe));
  }, []);

  const clearDeadline = useCallback(() => {
    deadlineRef.current = Number.POSITIVE_INFINITY;
    if (mountedRef.current) setSecondsLeft(null);
  }, []);

  const applyInvoice = useCallback(
    (next: CryptoInvoice) => {
      invoiceRef.current = next;
      if (!mountedRef.current) return;
      setInvoice(next);
      const remaining = secondsUntil(next.expiresAt);
      if (remaining === null) {
        clearDeadline();
      } else {
        setRemaining(remaining);
      }
    },
    [clearDeadline, setRemaining],
  );

  const applyStatus = useCallback(
    (next: CryptoStatus) => {
      if (next.status === 'paid') {
        trackEvent('bitcoin.payment_confirmed');
        setLicense(next.licenseFormatted || next.license);
        setPhaseSafe('confirmed');
        return;
      }

      if (
        next.status === 'expired' ||
        next.status === 'invalid' ||
        next.status === 'revoked'
      ) {
        trackEvent('bitcoin.invoice_closed', { status: next.status });
        setPhaseSafe('expired');
        return;
      }

      applyInvoice({
        license: next.license,
        licenseFormatted: next.licenseFormatted,
        address: next.address,
        btcValue: next.btcValue,
        uri: next.uri,
        expiresAt: next.expiresAt,
      });
      // `expiresAt` is absolute, so it drives the countdown. Only fall back
      // to the server's relative value when the absolute one is unusable.
      if (secondsUntil(next.expiresAt) === null) {
        setRemaining(next.secondsRemaining);
      }
      if (next.secondsRemaining > 0) expiryCheckRef.current = false;

      if (next.status === 'detected') {
        // A detected payment can still confirm after the invoice deadline;
        // keep polling and let the server settle it.
        setPhaseSafe('detected');
      } else if (next.secondsRemaining <= 0) {
        setPhaseSafe('expired');
      } else {
        setPhaseSafe('awaiting');
      }
    },
    [applyInvoice, setPhaseSafe, setRemaining],
  );

  const startInvoice = useCallback(async () => {
    const payment = cryptoRef.current;
    if (!payment) return;

    expiryCheckRef.current = false;
    setPhaseSafe('creating');
    try {
      const created = await payment.createInvoice();
      if (!mountedRef.current) return;
      trackEvent('bitcoin.invoice_created');
      applyInvoice(created);
      setPhaseSafe('awaiting');
    } catch (error) {
      if (!mountedRef.current) return;
      console.warn('[crypto] Failed to create an invoice', error);
      trackEvent('bitcoin.invoice_failed');
      setErrorActionSafe('create');
      setPhaseSafe('error');
    }
  }, [applyInvoice, setErrorActionSafe, setPhaseSafe]);

  const runCheck = useCallback(
    async (manual: boolean) => {
      const payment = cryptoRef.current;
      const current = invoiceRef.current;
      if (!payment || !current) return;

      if (manual) {
        trackEvent('bitcoin.check_pressed');
      }

      if (checkingRef.current) {
        // A poll is already in flight. A manual tap still gets feedback; the
        // in-flight result settles the screen (or restores it on failure).
        if (manual) setPhaseSafe('checking');
        return;
      }

      const previousPhase: Phase =
        phaseRef.current === 'detected' ? 'detected' : 'awaiting';
      checkingRef.current = true;
      if (manual) setPhaseSafe('checking');

      try {
        const next = await payment.checkStatus(current.license);
        if (!mountedRef.current) return;
        applyStatus(next);
      } catch (error) {
        if (!mountedRef.current) return;
        console.warn('[crypto] Failed to check the payment', error);
        if (manual) {
          setErrorActionSafe('check');
          setPhaseSafe('error');
        } else {
          // A manual tap during a poll left the UI on checking.
          if (phaseRef.current === 'checking') setPhaseSafe(previousPhase);
          if (
            phaseRef.current === 'awaiting' &&
            deadlineRef.current <= Date.now()
          ) {
            setPhaseSafe('expired');
          }
        }
      } finally {
        checkingRef.current = false;
      }
    },
    [applyStatus, setErrorActionSafe, setPhaseSafe],
  );

  const handleRetry = useCallback(() => {
    if (errorActionRef.current === 'create') {
      void startInvoice();
    } else {
      void runCheck(true);
    }
  }, [runCheck, startInvoice]);

  useEffect(() => {
    cryptoRef.current = crypto;
  }, [crypto]);

  useEffect(() => {
    mountedRef.current = true;
    // StrictMode and Fast Refresh can run this effect twice; the invoice must
    // be requested exactly once per mounted modal.
    if (!startedRef.current) {
      startedRef.current = true;

      const payment = cryptoRef.current;
      const pending = payment?.pendingInvoice ?? null;

      if (pending) {
        applyInvoice(pending);
        setPhaseSafe('awaiting');
        void runCheck(false);
      } else {
        void startInvoice();
      }
    }

    return () => {
      mountedRef.current = false;
    };
  }, [applyInvoice, runCheck, setPhaseSafe, startInvoice]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setIsActive(active);
      if (
        active &&
        invoiceRef.current &&
        (phaseRef.current === 'awaiting' || phaseRef.current === 'detected')
      ) {
        void runCheck(false);
      }
    });

    return () => subscription.remove();
  }, [runCheck]);

  // Poll only while the modal is open on the awaiting/detected screen. A
  // backgrounded app drops the interval and checks once on foreground.
  useEffect(() => {
    if (!isActive || (phase !== 'awaiting' && phase !== 'detected')) return;

    const id = setInterval(() => {
      void runCheck(false);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [isActive, phase, runCheck]);

  useEffect(() => {
    if (
      !isActive ||
      (phase !== 'awaiting' && phase !== 'detected' && phase !== 'checking')
    ) {
      return;
    }

    const id = setInterval(() => {
      if (!Number.isFinite(deadlineRef.current)) return;
      const remaining = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      // A detected payment may still confirm after the deadline, so only an
      // unpaid invoice expires locally. Check with the server once first so a
      // payment broadcast just before the deadline still gets detected.
      if (
        remaining <= 0 &&
        phase === 'awaiting' &&
        !expiryCheckRef.current
      ) {
        expiryCheckRef.current = true;
        void runCheck(false);
      }
    }, 1_000);

    return () => clearInterval(id);
  }, [isActive, phase, runCheck]);

  const sharePayment = useCallback(() => {
    const current = invoiceRef.current;
    if (!current) return;
    void Share.share({ message: current.uri }).catch((error) => {
      console.warn('[crypto] Failed to share the payment details', error);
    });
  }, []);

  const openWallet = useCallback(() => {
    const current = invoiceRef.current;
    if (!current) return;
    if (!/^bitcoin:/i.test(current.uri)) {
      console.warn('[crypto] Refusing to open a non-bitcoin payment link');
      return;
    }
    void Linking.openURL(current.uri).catch((error) => {
      console.warn('[crypto] No wallet app handled the payment link', error);
    });
  }, []);

  const shareLicense = useCallback(() => {
    if (!license) return;
    void Share.share({
      message: COPY.shareLicenseMessage.replace('{{license}}', license),
    }).catch((error) => {
      console.warn('[crypto] Failed to share the license', error);
    });
  }, [license]);

  if (!crypto) return null;

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  const strong = isDark ? 'text-cheddar-light' : 'text-cheddar-dark';
  const card = isDark ? 'bg-[#26282D]' : 'bg-white';
  const button = 'mt-6 rounded-xl bg-cheddar-yellow px-4 py-4';

  const invoiceDetails = invoice ? (
    <View className={`mt-6 rounded-2xl p-5 ${card}`}>
      <Text className={`text-sm ${muted}`}>{COPY.amount}</Text>
      <Text testID="bitcoin-payment-amount" className={`mt-1 text-2xl font-bold ${strong}`}>
        {formatBtc(invoice.btcValue)}
      </Text>
      <Text className={`mt-5 text-sm ${muted}`}>{COPY.address}</Text>
      <Text
        testID="bitcoin-payment-address"
        selectable
        className={`mt-1 text-base ${strong}`}
      >
        {invoice.address}
      </Text>
      <View className="mt-5 flex-row">
        <TouchableOpacity
          testID="bitcoin-payment-share"
          className="mr-3 flex-1 flex-row items-center justify-center rounded-xl border border-cheddar-yellow px-3 py-3"
          onPress={sharePayment}
        >
          <Share2 size={18} color="#FFB800" />
          <Text className="ml-2 text-base font-medium text-cheddar-yellow">
            {COPY.share}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="bitcoin-payment-open-wallet"
          className="flex-1 flex-row items-center justify-center rounded-xl border border-cheddar-yellow px-3 py-3"
          onPress={openWallet}
        >
          <Wallet size={18} color="#FFB800" />
          <Text className="ml-2 text-base font-medium text-cheddar-yellow">
            {COPY.openWallet}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

  const awaitingBody = (
    <View testID={`bitcoin-payment-${phase}`}>
      {phase === 'detected' ? (
        <View className={`mt-4 rounded-xl px-4 py-3 ${card}`}>
          <Text className={`text-center text-base font-semibold ${strong}`}>
            {COPY.detected}
          </Text>
          <Text className={`mt-1 text-center text-sm ${muted}`}>
            {COPY.detectedHint}
          </Text>
        </View>
      ) : (
        <Text className={`mt-4 text-center text-base ${muted}`}>
          {COPY.awaitingHint}
        </Text>
      )}

      {invoiceDetails}

      <View className="mt-6 flex-row items-center justify-center">
        <Clock size={18} color="#FFB800" />
        <Text className={`ml-2 text-sm ${muted}`}>{COPY.expiresIn}</Text>
        <Text
          testID="bitcoin-payment-countdown"
          className={`ml-2 text-base font-semibold ${strong}`}
        >
          {secondsLeft === null ? '--:--' : formatCountdown(secondsLeft)}
        </Text>
      </View>

      <TouchableOpacity
        testID="bitcoin-payment-check"
        className={button}
        disabled={phase === 'checking'}
        onPress={() => void runCheck(true)}
      >
        {phase === 'checking' ? (
          <View className="flex-row items-center justify-center">
            <ActivityIndicator color="#212226" />
            <Text className="ml-2 text-base font-bold text-cheddar-dark">
              {COPY.checking}
            </Text>
          </View>
        ) : (
          <Text className="text-center text-base font-bold text-cheddar-dark">
            {COPY.check}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      testID="bitcoin-payment-modal"
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
        <View
          className={`flex-row items-center justify-between border-b px-4 py-3 ${isDark ? 'border-gray-700 bg-[#26282D]' : 'border-gray-200 bg-white'}`}
        >
          <Text className={`text-xl font-semibold ${strong}`}>{COPY.title}</Text>
          <TouchableOpacity
            testID="bitcoin-payment-close"
            className="p-1"
            onPress={onClose}
          >
            <X size={24} color={isDark ? '#F9FAFB' : '#212226'} />
          </TouchableOpacity>
        </View>

        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingTop: 32, paddingBottom: 40 }}
        >
          {phase === 'creating' ? (
            <View testID="bitcoin-payment-creating" className="items-center">
              <ActivityIndicator size="large" color="#FFB800" />
              <Text className={`mt-4 text-center text-lg font-semibold ${strong}`}>
                {COPY.creating}
              </Text>
              <Text className={`mt-2 text-center text-sm ${muted}`}>
                {COPY.creatingHint}
              </Text>
            </View>
          ) : null}

          {phase === 'awaiting' || phase === 'detected' || phase === 'checking'
            ? awaitingBody
            : null}

          {phase === 'confirmed' ? (
            <View testID="bitcoin-payment-confirmed" className="items-center">
              <View className="h-20 w-20 items-center justify-center rounded-full bg-green-500">
                <Check size={38} color="#FFFFFF" />
              </View>
              <Text className={`mt-5 text-2xl font-bold ${strong}`}>
                {COPY.confirmed}
              </Text>
              <Text className={`mt-6 text-sm ${muted}`}>{COPY.licenseTitle}</Text>
              <Text
                testID="bitcoin-payment-license"
                selectable
                className={`mt-2 text-center text-xl font-bold tracking-widest ${strong}`}
              >
                {license}
              </Text>
              <Text className={`mt-4 text-center text-sm ${muted}`}>
                {COPY.licenseWarning}
              </Text>
              <TouchableOpacity
                testID="bitcoin-payment-share-license"
                className={button}
                onPress={shareLicense}
              >
                <View className="flex-row items-center justify-center">
                  <Share2 size={18} color="#212226" />
                  <Text className="ml-2 text-base font-bold text-cheddar-dark">
                    {COPY.shareLicense}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                testID="bitcoin-payment-done"
                className="mt-4 items-center py-3"
                onPress={onClose}
              >
                <Text className="text-base font-medium text-cheddar-yellow">
                  {COPY.done}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {phase === 'expired' ? (
            <View testID="bitcoin-payment-expired" className="items-center">
              <View className="h-20 w-20 items-center justify-center rounded-full bg-amber-500">
                <AlertTriangle size={38} color="#FFFFFF" />
              </View>
              <Text className={`mt-5 text-2xl font-bold ${strong}`}>
                {COPY.expired}
              </Text>
              <Text className={`mt-3 text-center text-base ${muted}`}>
                {COPY.expiredHint}
              </Text>
              <TouchableOpacity
                testID="bitcoin-payment-new-invoice"
                className={button}
                onPress={() => void startInvoice()}
              >
                <Text className="text-center text-base font-bold text-cheddar-dark">
                  {COPY.newInvoice}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {phase === 'error' ? (
            <View testID="bitcoin-payment-error" className="items-center">
              <View className="h-20 w-20 items-center justify-center rounded-full bg-cheddar-expense">
                <AlertTriangle size={38} color="#FFFFFF" />
              </View>
              <Text className={`mt-5 text-2xl font-bold ${strong}`}>
                {errorAction === 'create' ? COPY.createError : COPY.checkError}
              </Text>
              <Text className={`mt-3 text-center text-base ${muted}`}>
                {COPY.errorHint}
              </Text>
              <TouchableOpacity
                testID="bitcoin-payment-retry"
                className={button}
                onPress={handleRetry}
              >
                <Text className="text-center text-base font-bold text-cheddar-dark">
                  {COPY.retry}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <LegalFooter
            testIDPrefix="bitcoin-payment"
            className="mt-10"
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
