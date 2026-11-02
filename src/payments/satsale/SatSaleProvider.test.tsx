import React from 'react';
import { AppState, AppStateStatus, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { usePremium } from '../PaymentContext';
import { getCachedPremium, setCachedPremium } from '../../db/premium';
import {
  createSatSaleInvoice,
  fetchSatSaleConfig,
  fetchSatSaleStatus,
  SatSaleApiError,
} from './api';
import {
  clearPendingInvoice,
  clearPurchaseState,
  getPendingInvoice,
  getStoredLicense,
  storeLicense,
  storePendingInvoice,
} from './storage';
import { SatSaleProvider } from './SatSaleProvider';

jest.mock('../../components/DatabaseProvider', () => ({
  useDatabase: () => ({ isReady: true }),
}));

jest.mock('../../db/premium', () => ({
  getCachedPremium: jest.fn(),
  setCachedPremium: jest.fn(),
}));

jest.mock('./api', () => {
  const actual = jest.requireActual('./api');
  return {
    ...actual,
    fetchSatSaleConfig: jest.fn(),
    createSatSaleInvoice: jest.fn(),
    fetchSatSaleStatus: jest.fn(),
  };
});

jest.mock('./storage', () => ({
  getStoredLicense: jest.fn(),
  storeLicense: jest.fn(),
  getPendingInvoice: jest.fn(),
  storePendingInvoice: jest.fn(),
  clearPendingInvoice: jest.fn(),
  clearPurchaseState: jest.fn(),
}));

const LICENSE = 'ABCDEFGHJKMNPQRSTVWX';
const LICENSE_FORMATTED = 'ABCDE-FGHJK-MNPQR-STVWX';
const PAID_LICENSE = 'ZZZZZZZZZZZZZZZZZZZZ';

const INVOICE = {
  license: LICENSE,
  licenseFormatted: LICENSE_FORMATTED,
  address: 'bc1qtestaddress',
  btcValue: 0.00042,
  uri: `bitcoin:bc1qtestaddress?amount=0.00042`,
  expiresAt: '2026-11-02T18:00:00.000Z',
};

function status(
  name: 'pending' | 'detected' | 'paid' | 'expired' | 'invalid' | 'revoked',
  license = LICENSE,
) {
  return {
    ...INVOICE,
    license,
    licenseFormatted: license === LICENSE ? LICENSE_FORMATTED : license,
    status: name,
    confirmedPaid: name === 'paid' ? INVOICE.btcValue : 0,
    unconfirmedPaid: name === 'detected' ? INVOICE.btcValue : 0,
    secondsRemaining: name === 'pending' || name === 'detected' ? 600 : 0,
  };
}

const getCachedPremiumMock = getCachedPremium as jest.Mock;
const setCachedPremiumMock = setCachedPremium as jest.Mock;
const fetchSatSaleConfigMock = fetchSatSaleConfig as jest.Mock;
const createSatSaleInvoiceMock = createSatSaleInvoice as jest.Mock;
const fetchSatSaleStatusMock = fetchSatSaleStatus as jest.Mock;
const getStoredLicenseMock = getStoredLicense as jest.Mock;
const storeLicenseMock = storeLicense as jest.Mock;
const getPendingInvoiceMock = getPendingInvoice as jest.Mock;
const storePendingInvoiceMock = storePendingInvoice as jest.Mock;
const clearPendingInvoiceMock = clearPendingInvoice as jest.Mock;
const clearPurchaseStateMock = clearPurchaseState as jest.Mock;

let premium: ReturnType<typeof usePremium>;

function Consumer() {
  premium = usePremium();
  return (
    <Text testID="premium-state">{premium.isPremium ? 'premium' : 'free'}</Text>
  );
}

function renderProvider() {
  return render(
    <SatSaleProvider>
      <Consumer />
    </SatSaleProvider>,
  );
}

function premiumState(screen: ReturnType<typeof render>) {
  return screen.getByTestId('premium-state').props.children;
}

let appStateHandler: ((state: AppStateStatus) => void) | null = null;
let removeAppState: jest.Mock;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
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

  getCachedPremiumMock.mockReset().mockResolvedValue(false);
  setCachedPremiumMock.mockReset().mockResolvedValue(undefined);
  getStoredLicenseMock.mockReset().mockResolvedValue(null);
  storeLicenseMock.mockReset().mockResolvedValue(undefined);
  getPendingInvoiceMock.mockReset().mockResolvedValue(null);
  storePendingInvoiceMock.mockReset().mockResolvedValue(undefined);
  clearPendingInvoiceMock.mockReset().mockResolvedValue(undefined);
  clearPurchaseStateMock.mockReset().mockResolvedValue(undefined);

  fetchSatSaleConfigMock.mockReset().mockResolvedValue({
    price: 20,
    currency: 'USD',
    supportEmail: 'support@example.com',
  });
  createSatSaleInvoiceMock.mockReset();
  fetchSatSaleStatusMock.mockReset();
});

afterEach(() => {
  warnSpy.mockRestore();
  jest.restoreAllMocks();
});

describe('SatSaleProvider', () => {
  it('exposes the configured price and support email', async () => {
    const screen = renderProvider();

    await waitFor(() => expect(premium.isLoading).toBe(false));

    expect(premium.lifetimePackage).toEqual({
      product: { priceString: '$20.00' },
    });
    expect(premium.crypto?.price).toEqual({ amount: 20, currency: 'USD' });
    expect(premium.crypto?.supportEmail).toBe('support@example.com');
    expect(fetchSatSaleStatusMock).not.toHaveBeenCalled();
    expect(premiumState(screen)).toBe('free');
  });

  it('resumes a pending invoice and keeps the free tier', async () => {
    getStoredLicenseMock.mockResolvedValue(LICENSE);
    fetchSatSaleStatusMock.mockResolvedValue(status('pending'));

    const screen = renderProvider();

    await waitFor(() => expect(premium.isLoading).toBe(false));

    expect(fetchSatSaleStatusMock).toHaveBeenCalledWith(LICENSE);
    expect(premiumState(screen)).toBe('free');
    expect(premium.crypto?.pendingInvoice).toEqual(INVOICE);
    expect(storePendingInvoiceMock).toHaveBeenCalledWith(INVOICE);
    expect(storeLicenseMock).toHaveBeenCalledWith(LICENSE);
    expect(setCachedPremiumMock).not.toHaveBeenCalled();
  });

  it('treats a detected payment as still unpaid', async () => {
    getStoredLicenseMock.mockResolvedValue(LICENSE);
    fetchSatSaleStatusMock.mockResolvedValue(status('detected'));

    const screen = renderProvider();

    await waitFor(() => expect(premium.isLoading).toBe(false));

    expect(premiumState(screen)).toBe('free');
    expect(premium.crypto?.pendingInvoice).toEqual(INVOICE);
    expect(setCachedPremiumMock).not.toHaveBeenCalled();
  });

  it('grants premium and caches it when the invoice is paid', async () => {
    getStoredLicenseMock.mockResolvedValue(LICENSE);
    fetchSatSaleStatusMock.mockResolvedValue(status('paid'));

    const screen = renderProvider();

    await waitFor(() => expect(premiumState(screen)).toBe('premium'));
    await waitFor(() => expect(premium.isLoading).toBe(false));

    expect(setCachedPremiumMock).toHaveBeenCalledWith(true);
    expect(storeLicenseMock).toHaveBeenCalledWith(LICENSE);
    expect(clearPendingInvoiceMock).toHaveBeenCalled();
    expect(premium.crypto?.pendingInvoice).toBeNull();
    expect(premium.isEntitlementLoaded).toBe(true);
  });

  it.each(['expired', 'revoked'] as const)(
    'clears premium, license, and invoice when the license is %s',
    async (name) => {
      getStoredLicenseMock.mockResolvedValue(LICENSE);
      getCachedPremiumMock.mockResolvedValue(true);
      fetchSatSaleStatusMock.mockResolvedValue(status(name));

      const screen = renderProvider();

      await waitFor(() => expect(premium.isLoading).toBe(false));

      expect(premiumState(screen)).toBe('free');
      expect(setCachedPremiumMock).toHaveBeenCalledWith(false);
      expect(clearPurchaseStateMock).toHaveBeenCalled();
      expect(premium.crypto?.pendingInvoice).toBeNull();
    },
  );

  it('keeps the cached premium when the status check fails', async () => {
    getCachedPremiumMock.mockResolvedValue(true);
    getStoredLicenseMock.mockResolvedValue(LICENSE);
    fetchSatSaleStatusMock.mockRejectedValue(
      new SatSaleApiError('network', 'offline'),
    );

    const screen = renderProvider();

    await waitFor(() => expect(premium.isLoading).toBe(false));

    expect(premiumState(screen)).toBe('premium');
    expect(setCachedPremiumMock).not.toHaveBeenCalled();
    expect(clearPurchaseStateMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[satsale] Startup check failed',
      expect.any(SatSaleApiError),
    );
  });

  it('restores premium from a formatted license code', async () => {
    fetchSatSaleStatusMock.mockResolvedValue(status('paid'));

    const screen = renderProvider();
    await waitFor(() => expect(premium.isLoading).toBe(false));

    const restored: { status?: string } = {};
    await act(async () => {
      restored.status = (
        await premium.crypto!.restoreLicense('abcde-fghjk-mnpqr-stvwx')
      ).status;
    });

    expect(fetchSatSaleStatusMock).toHaveBeenCalledWith(LICENSE);
    expect(restored.status).toBe('paid');
    expect(premiumState(screen)).toBe('premium');
    expect(storeLicenseMock).toHaveBeenCalledWith(LICENSE);
    expect(setCachedPremiumMock).toHaveBeenCalledWith(true);
  });

  it('rejects a revoked code without touching a different stored license', async () => {
    getStoredLicenseMock.mockResolvedValue('ZZZZZZZZZZZZZZZZZZZZ');
    fetchSatSaleStatusMock.mockResolvedValue(status('revoked'));

    const screen = renderProvider();
    await waitFor(() => expect(premium.isLoading).toBe(false));

    let restoredStatus = '';
    await act(async () => {
      const restored = await premium.crypto!.restoreLicense(LICENSE);
      restoredStatus = restored.status;
    });

    expect(restoredStatus).toBe('revoked');
    expect(premiumState(screen)).toBe('free');
    expect(clearPurchaseStateMock).not.toHaveBeenCalled();
  });

  it('does not replace an active license with a pending restore', async () => {
    getStoredLicenseMock.mockResolvedValue(PAID_LICENSE);
    getCachedPremiumMock.mockResolvedValue(true);
    fetchSatSaleStatusMock
      .mockResolvedValueOnce(status('paid', PAID_LICENSE))
      .mockResolvedValueOnce(status('pending', LICENSE));

    const screen = renderProvider();
    await waitFor(() => expect(premium.isLoading).toBe(false));
    expect(premiumState(screen)).toBe('premium');

    let restoredStatus = '';
    await act(async () => {
      restoredStatus = (await premium.crypto!.restoreLicense(LICENSE)).status;
    });

    expect(restoredStatus).toBe('pending');
    expect(storeLicenseMock).not.toHaveBeenCalledWith(LICENSE);
    expect(storePendingInvoiceMock).not.toHaveBeenCalled();
    expect(premium.crypto?.pendingInvoice).toBeNull();
    expect(premiumState(screen)).toBe('premium');
  });

  it('rejects a malformed license without calling the API', async () => {
    renderProvider();
    await waitFor(() => expect(premium.isLoading).toBe(false));

    await expect(
      premium.crypto!.restoreLicense('not-a-license'),
    ).rejects.toMatchObject({ code: 'invalid_license' });
    expect(fetchSatSaleStatusMock).not.toHaveBeenCalled();
  });

  it('stores a new invoice and its license when creating one', async () => {
    createSatSaleInvoiceMock.mockResolvedValue(INVOICE);

    const screen = renderProvider();
    await waitFor(() => expect(premium.isLoading).toBe(false));

    let created: typeof INVOICE | null = null;
    await act(async () => {
      created = await premium.crypto!.createInvoice();
    });

    expect(createSatSaleInvoiceMock).toHaveBeenCalledWith(undefined);
    expect(created).toEqual(INVOICE);
    expect(storeLicenseMock).toHaveBeenCalledWith(LICENSE);
    expect(storePendingInvoiceMock).toHaveBeenCalledWith(INVOICE);
    expect(premium.crypto?.pendingInvoice).toEqual(INVOICE);
    expect(premiumState(screen)).toBe('free');
  });

  it('checks the stored license when the app returns to the foreground', async () => {
    getStoredLicenseMock.mockResolvedValue(LICENSE);
    fetchSatSaleStatusMock.mockResolvedValue(status('pending'));

    renderProvider();
    await waitFor(() => expect(premium.isLoading).toBe(false));
    expect(fetchSatSaleStatusMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateHandler?.('active');
    });

    await waitFor(() => expect(fetchSatSaleStatusMock).toHaveBeenCalledTimes(2));
    expect(fetchSatSaleStatusMock).toHaveBeenLastCalledWith(LICENSE);
  });

  it('finishes loading when the stored purchase state cannot be read', async () => {
    getStoredLicenseMock.mockRejectedValue(new Error('db broken'));

    const screen = renderProvider();

    await waitFor(() => expect(premium.isLoading).toBe(false));
    expect(premium.isEntitlementLoaded).toBe(true);
    expect(premiumState(screen)).toBe('free');
    expect(warnSpy).toHaveBeenCalledWith(
      '[satsale] Failed to load purchase state',
      expect.any(Error),
    );
  });

  it('removes the AppState listener on unmount', async () => {
    const screen = renderProvider();
    await waitFor(() => expect(premium.isLoading).toBe(false));

    screen.unmount();

    expect(removeAppState).toHaveBeenCalled();
  });
});
