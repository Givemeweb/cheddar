import React, { StrictMode } from 'react';
import { AppState, AppStateStatus, Linking, Share } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  PaymentContext,
  type CryptoInvoice,
  type CryptoPaymentValue,
  type CryptoStatus,
  type PaymentContextValue,
} from '../PaymentContext';
import {
  CryptoPaymentModal,
  CryptoPaywallAction,
  CryptoPaywallLegal,
  CryptoRestoreForm,
  formatCountdown,
} from './CryptoPayment';
import { SatSaleApiError } from './api';

jest.mock('../../components/ThemeProvider', () => ({
  useTheme: () => ({ isDark: false }),
}));

const LICENSE = 'ABCDEFGHJKMNPQRSTVWX';
const LICENSE_FORMATTED = 'ABCDE-FGHJK-MNPQR-STVWX';
const ADDRESS = 'bc1qtestaddress';
const URI = `bitcoin:${ADDRESS}?amount=0.00042`;

function makeInvoice(overrides: Partial<CryptoInvoice> = {}): CryptoInvoice {
  return {
    license: LICENSE,
    licenseFormatted: LICENSE_FORMATTED,
    address: ADDRESS,
    btcValue: 0.00042,
    uri: URI,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    ...overrides,
  };
}

function makeStatus(
  status: CryptoStatus['status'],
  overrides: Partial<CryptoStatus> = {},
): CryptoStatus {
  return {
    ...makeInvoice(),
    status,
    confirmedPaid: status === 'paid' ? 0.00042 : 0,
    unconfirmedPaid: status === 'detected' ? 0.00042 : 0,
    secondsRemaining: 600,
    ...overrides,
  };
}

function makePayment(
  overrides: Partial<CryptoPaymentValue> = {},
): CryptoPaymentValue {
  return {
    price: { amount: 20, currency: 'USD' },
    supportEmail: 'support@example.com',
    pendingInvoice: null,
    createInvoice: jest.fn(),
    checkStatus: jest.fn(),
    restoreLicense: jest.fn(),
    ...overrides,
  };
}

function paymentContext(payment: CryptoPaymentValue): PaymentContextValue {
  return {
    isPremium: false,
    isLoading: false,
    isEntitlementLoaded: true,
    lifetimePackage: null,
    refreshOfferings: jest.fn(),
    purchaseLifetime: jest.fn(),
    restorePurchases: jest.fn(),
    crypto: payment,
  };
}

function renderModal(
  payment: CryptoPaymentValue,
  onClose: () => void = jest.fn(),
) {
  const value = paymentContext(payment);

  return {
    onClose,
    ...render(
      <PaymentContext.Provider value={value}>
        <CryptoPaymentModal onClose={onClose} />
      </PaymentContext.Provider>,
    ),
  };
}

let appStateHandler: ((state: AppStateStatus) => void) | null = null;
let removeAppState: jest.Mock;
let warnSpy: jest.SpyInstance;
let shareMock: jest.SpyInstance;
let openURLMock: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  shareMock = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: Share.sharedAction });
  openURLMock = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  shareMock.mockClear();
  openURLMock.mockClear();
  appStateHandler = null;
  removeAppState = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(((
      _type: string,
      handler: (state: AppStateStatus) => void,
    ) => {
      appStateHandler = handler;
      return { remove: removeAppState };
    }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  warnSpy.mockRestore();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('CryptoPaymentModal', () => {
  it('shows the creating state until the invoice arrives', async () => {
    let resolveInvoice: (invoice: CryptoInvoice) => void = () => {};
    const createInvoice = jest.fn(
      () => new Promise<CryptoInvoice>((resolve) => {
        resolveInvoice = resolve;
      }),
    );
    const payment = makePayment({ createInvoice });
    const screen = renderModal(payment);

    expect(screen.getByTestId('bitcoin-payment-creating')).toBeTruthy();
    expect(screen.getByTestId('bitcoin-payment-legal')).toHaveTextContent(
      /final/,
    );

    await act(async () => {
      resolveInvoice(makeInvoice());
    });

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-awaiting')).toBeTruthy(),
    );
    expect(screen.getByTestId('bitcoin-payment-amount')).toHaveTextContent(
      '0.00042 BTC',
    );
    expect(screen.getByTestId('bitcoin-payment-address')).toHaveTextContent(
      ADDRESS,
    );
    expect(screen.getByTestId('bitcoin-payment-countdown')).toHaveTextContent(
      /\d{2}:\d{2}/,
    );
    expect(screen.getByTestId('bitcoin-payment-support')).toHaveTextContent(
      /support@example\.com/,
    );
    expect(payment.checkStatus).not.toHaveBeenCalled();
  });

  it('resumes the stored invoice instead of creating a new one', async () => {
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus: jest.fn().mockResolvedValue(makeStatus('pending')),
    });
    const screen = renderModal(payment);

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-awaiting')).toBeTruthy(),
    );
    expect(payment.createInvoice).not.toHaveBeenCalled();
    expect(payment.checkStatus).toHaveBeenCalledWith(LICENSE);
  });

  it('shows the checking state while a manual check runs', async () => {
    let resolveCheck: (status: CryptoStatus) => void = () => {};
    const checkStatus = jest
      .fn()
      .mockResolvedValueOnce(makeStatus('pending'))
      .mockImplementationOnce(
        () =>
          new Promise<CryptoStatus>((resolve) => {
            resolveCheck = resolve;
          }),
      );
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus,
    });
    const screen = renderModal(payment);

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-awaiting')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('bitcoin-payment-check'));
    expect(screen.getByTestId('bitcoin-payment-checking')).toBeTruthy();

    await act(async () => {
      resolveCheck(makeStatus('paid'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-confirmed')).toBeTruthy(),
    );
  });

  it('shows the detected state and keeps polling', async () => {
    jest.useFakeTimers();
    const checkStatus = jest.fn().mockResolvedValue(makeStatus('detected'));
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus,
    });
    const screen = renderModal(payment);

    await act(async () => {});
    expect(screen.getByTestId('bitcoin-payment-detected')).toBeTruthy();
    expect(checkStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(checkStatus).toHaveBeenCalledTimes(2);
  });

  it('reveals the license and warns the user to save it', async () => {
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus: jest.fn().mockResolvedValue(makeStatus('paid')),
    });
    const screen = renderModal(payment);

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-confirmed')).toBeTruthy(),
    );
    expect(screen.getByTestId('bitcoin-payment-license')).toHaveTextContent(
      LICENSE_FORMATTED,
    );
    expect(screen.getByText(/only way to restore Premium/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('bitcoin-payment-share-license'));
    expect(shareMock).toHaveBeenCalledWith({
      message: `Cheddar Premium license: ${LICENSE_FORMATTED}`,
    });
  });

  it('offers a new invoice after expiry', async () => {
    const expired = makeStatus('expired', { secondsRemaining: 0 });
    const createInvoice = jest.fn().mockResolvedValue(makeInvoice());
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus: jest.fn().mockResolvedValue(expired),
      createInvoice,
    });
    const screen = renderModal(payment);

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-expired')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('bitcoin-payment-new-invoice'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-awaiting')).toBeTruthy(),
    );
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it('retries a failed invoice creation', async () => {
    const createInvoice = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(makeInvoice());
    const payment = makePayment({ createInvoice });
    const screen = renderModal(payment);

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-error')).toBeTruthy(),
    );
    expect(screen.getByText('We could not create an invoice.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('bitcoin-payment-retry'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-awaiting')).toBeTruthy(),
    );
    expect(createInvoice).toHaveBeenCalledTimes(2);
  });

  it('retries a failed payment check', async () => {
    const checkStatus = jest
      .fn()
      .mockResolvedValueOnce(makeStatus('pending'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(makeStatus('paid'));
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus,
    });
    const screen = renderModal(payment);

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-awaiting')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('bitcoin-payment-check'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-error')).toBeTruthy(),
    );
    expect(screen.getByText('We could not check the payment.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('bitcoin-payment-retry'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-confirmed')).toBeTruthy(),
    );
  });

  it('shares the payment link and opens a wallet', async () => {
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus: jest.fn().mockResolvedValue(makeStatus('pending')),
    });
    const screen = renderModal(payment);

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-awaiting')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('bitcoin-payment-share'));
    fireEvent.press(screen.getByTestId('bitcoin-payment-open-wallet'));

    expect(shareMock).toHaveBeenCalledWith({ message: URI });
    expect(openURLMock).toHaveBeenCalledWith(URI);
  });

  it('checks immediately when the app returns to the foreground', async () => {
    const checkStatus = jest.fn().mockResolvedValue(makeStatus('pending'));
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus,
    });
    renderModal(payment);

    await waitFor(() => expect(checkStatus).toHaveBeenCalledTimes(1));

    await act(async () => {
      appStateHandler?.('active');
    });

    expect(checkStatus).toHaveBeenCalledTimes(2);
  });

  it('stops polling while the app is backgrounded', async () => {
    jest.useFakeTimers();
    const checkStatus = jest.fn().mockResolvedValue(makeStatus('pending'));
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus,
    });
    renderModal(payment);

    await act(async () => {});
    expect(checkStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(checkStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      appStateHandler?.('background');
    });
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(checkStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      appStateHandler?.('active');
    });
    expect(checkStatus).toHaveBeenCalledTimes(3);
  });

  it('expires the invoice when the countdown reaches zero', async () => {
    jest.useFakeTimers();
    const expiresAt = new Date(Date.now() + 2_000).toISOString();
    const invoice = makeInvoice({ expiresAt });
    const pending = {
      ...invoice,
      status: 'pending' as const,
      confirmedPaid: 0,
      unconfirmedPaid: 0,
      secondsRemaining: 2,
    };
    const expired = {
      ...invoice,
      status: 'expired' as const,
      confirmedPaid: 0,
      unconfirmedPaid: 0,
      secondsRemaining: 0,
    };
    const payment = makePayment({
      pendingInvoice: invoice,
      checkStatus: jest
        .fn()
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(expired),
    });
    const screen = renderModal(payment);

    await act(async () => {});
    expect(screen.getByTestId('bitcoin-payment-countdown')).toHaveTextContent(
      '00:02',
    );

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.getByTestId('bitcoin-payment-countdown')).toHaveTextContent(
      '00:01',
    );

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.getByTestId('bitcoin-payment-expired')).toBeTruthy();
    expect(payment.checkStatus).toHaveBeenCalledTimes(2);
  });

  it('keeps a detected payment after the invoice deadline', async () => {
    jest.useFakeTimers();
    const invoice = makeInvoice({
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const detected = {
      ...invoice,
      status: 'detected' as const,
      confirmedPaid: 0,
      unconfirmedPaid: invoice.btcValue,
      secondsRemaining: 0,
    };
    const checkStatus = jest.fn().mockResolvedValue(detected);
    const payment = makePayment({
      pendingInvoice: invoice,
      checkStatus,
    });
    const screen = renderModal(payment);

    await act(async () => {});
    expect(screen.getByTestId('bitcoin-payment-detected')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('bitcoin-payment-detected')).toBeTruthy();
    expect(screen.queryByTestId('bitcoin-payment-expired')).toBeNull();
    expect(checkStatus.mock.calls.length).toBeGreaterThan(1);
  });

  it('does not replace the confirmed screen when foregrounded later', async () => {
    const checkStatus = jest.fn().mockResolvedValue(makeStatus('paid'));
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus,
    });
    const screen = renderModal(payment);

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-confirmed')).toBeTruthy(),
    );
    expect(checkStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateHandler?.('active');
    });

    expect(checkStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('bitcoin-payment-confirmed')).toBeTruthy();
  });

  it('shows no countdown when the invoice has no usable expiry', async () => {
    jest.useFakeTimers();
    const payment = makePayment({
      createInvoice: jest.fn().mockResolvedValue(makeInvoice({ expiresAt: '' })),
    });
    const screen = renderModal(payment);

    await act(async () => {});
    expect(screen.getByTestId('bitcoin-payment-awaiting')).toBeTruthy();
    expect(screen.getByTestId('bitcoin-payment-countdown')).toHaveTextContent(
      '--:--',
    );

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(screen.getByTestId('bitcoin-payment-awaiting')).toBeTruthy();
  });

  it('creates only one invoice when effects run twice', async () => {
    const createInvoice = jest.fn().mockResolvedValue(makeInvoice());
    const payment = makePayment({ createInvoice });

    render(
      <StrictMode>
        <PaymentContext.Provider value={paymentContext(payment)}>
          <CryptoPaymentModal onClose={jest.fn()} />
        </PaymentContext.Provider>
      </StrictMode>,
    );

    await waitFor(() => expect(createInvoice).toHaveBeenCalled());
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it('refuses to open a non-bitcoin payment link', async () => {
    const invoice = makeInvoice({ uri: 'https://example.com' });
    const payment = makePayment({
      pendingInvoice: invoice,
      checkStatus: jest.fn().mockResolvedValue({
        ...invoice,
        status: 'pending',
        confirmedPaid: 0,
        unconfirmedPaid: 0,
        secondsRemaining: 600,
      }),
    });
    const screen = renderModal(payment);

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-awaiting')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('bitcoin-payment-open-wallet'));

    expect(openURLMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[crypto] Refusing to open a non-bitcoin payment link',
    );
  });

  it('closes from the header and from the confirmed screen', async () => {
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus: jest.fn().mockResolvedValue(makeStatus('paid')),
    });
    const screen = renderModal(payment);

    await waitFor(() =>
      expect(screen.getByTestId('bitcoin-payment-confirmed')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('bitcoin-payment-done'));
    expect(screen.onClose).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('bitcoin-payment-close'));
    expect(screen.onClose).toHaveBeenCalledTimes(2);
  });

  it('removes the app state subscription on unmount', async () => {
    const payment = makePayment({
      pendingInvoice: makeInvoice(),
      checkStatus: jest.fn().mockResolvedValue(makeStatus('pending')),
    });
    const screen = renderModal(payment);
    await waitFor(() => expect(appStateHandler).not.toBeNull());

    screen.unmount();

    expect(removeAppState).toHaveBeenCalled();
  });
});

describe('CryptoPaywallAction', () => {
  it('says "Pay with Bitcoin" without a pending invoice', () => {
    const onPress = jest.fn();
    const screen = render(
      <CryptoPaywallAction pending={false} onPress={onPress} />,
    );

    expect(screen.getByText('Pay with Bitcoin')).toBeTruthy();
    fireEvent.press(screen.getByTestId('paywall-bitcoin'));
    expect(onPress).toHaveBeenCalled();
  });

  it('says "Complete payment" while an invoice is pending', () => {
    const screen = render(
      <CryptoPaywallAction pending onPress={jest.fn()} />,
    );

    expect(screen.getByText('Complete payment')).toBeTruthy();
  });

  it('is disabled while the provider is still hydrating', () => {
    const onPress = jest.fn();
    const screen = render(
      <CryptoPaywallAction pending={false} disabled onPress={onPress} />,
    );

    fireEvent.press(screen.getByTestId('paywall-bitcoin'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows the final-sale notice and the configured support email', () => {
    const screen = render(
      <PaymentContext.Provider value={paymentContext(makePayment())}>
        <CryptoPaywallLegal />
      </PaymentContext.Provider>,
    );

    expect(screen.getByTestId('paywall-bitcoin-legal')).toHaveTextContent(
      /Bitcoin sales are final and non-refundable/,
    );
    expect(screen.getByTestId('paywall-bitcoin-support')).toHaveTextContent(
      /support@example\.com/,
    );
  });
});

describe('CryptoRestoreForm', () => {
  function renderRestore(payment: CryptoPaymentValue) {
    return render(
      <PaymentContext.Provider value={paymentContext(payment)}>
        <CryptoRestoreForm />
      </PaymentContext.Provider>,
    );
  }

  async function submit(
    screen: ReturnType<typeof render>,
    code: string,
  ): Promise<void> {
    fireEvent.changeText(screen.getByTestId('paywall-license-input'), code);
    await act(async () => {
      fireEvent.press(screen.getByTestId('paywall-license-restore'));
    });
  }

  it('normalizes a formatted code and restores premium', async () => {
    const restoreLicense = jest.fn().mockResolvedValue(makeStatus('paid'));
    const screen = renderRestore(makePayment({ restoreLicense }));

    await submit(screen, 'abcde-fghjk-mnpqr-stvwx');

    expect(restoreLicense).toHaveBeenCalledWith(LICENSE);
    expect(screen.getByTestId('paywall-license-message')).toHaveTextContent(
      'Premium restored.',
    );
  });

  it('rejects a malformed code without calling the provider', async () => {
    const restoreLicense = jest.fn();
    const screen = renderRestore(makePayment({ restoreLicense }));

    await submit(screen, 'not-a-license');

    expect(restoreLicense).not.toHaveBeenCalled();
    expect(screen.getByTestId('paywall-license-message')).toHaveTextContent(
      'That license code is not valid.',
    );
  });

  it.each([
    ['invalid', 'That license code is not valid.'],
    ['expired', 'That license code has expired.'],
    ['revoked', 'That license code has been revoked.'],
    ['pending', 'That license code is valid, but the payment is still pending.'],
    [
      'detected',
      'The payment was detected. Wait for the network to confirm it, then try again.',
    ],
  ] as const)('explains a %s code', async (name, message) => {
    const restoreLicense = jest.fn().mockResolvedValue(makeStatus(name));
    const screen = renderRestore(makePayment({ restoreLicense }));

    await submit(screen, LICENSE_FORMATTED);

    expect(screen.getByTestId('paywall-license-message')).toHaveTextContent(
      message,
    );
  });

  it('reports an invalid response from the provider', async () => {
    const restoreLicense = jest.fn().mockRejectedValue(
      new SatSaleApiError('invalid_license', 'The license code is not valid'),
    );
    const screen = renderRestore(makePayment({ restoreLicense }));

    await submit(screen, LICENSE_FORMATTED);

    expect(screen.getByTestId('paywall-license-message')).toHaveTextContent(
      'That license code is not valid.',
    );
  });

  it('keeps the offline error separate from an invalid code', async () => {
    const restoreLicense = jest
      .fn()
      .mockRejectedValue(new SatSaleApiError('network', 'offline'));
    const screen = renderRestore(makePayment({ restoreLicense }));

    await submit(screen, LICENSE_FORMATTED);

    expect(screen.getByTestId('paywall-license-message')).toHaveTextContent(
      /Could not check the license\./,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[crypto] Failed to restore the license',
      expect.any(SatSaleApiError),
    );
  });
});

describe('formatCountdown', () => {
  it('formats seconds as mm:ss and clamps negatives', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(59)).toBe('00:59');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});
