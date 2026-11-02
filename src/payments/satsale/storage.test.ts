import { getStore } from '../../db/tinybase';
import {
  clearPendingInvoice,
  clearPurchaseState,
  getPendingInvoice,
  getStoredLicense,
  storeLicense,
  storePendingInvoice,
} from './storage';

jest.mock('../../db/tinybase', () => ({
  isDatabaseReady: jest.fn(() => true),
  getStore: jest.fn(),
  saveStore: jest.fn(async () => {}),
}));

// TinyBase ships ESM only, which the test transform does not handle; the
// values API this module uses is small enough to stand in for.
class FakeStore {
  private values: Record<string, unknown> = {};

  getValue(key: string) {
    return this.values[key];
  }

  setValue(key: string, value: unknown) {
    this.values[key] = value;
  }

  delValue(key: string) {
    delete this.values[key];
  }
}

const getStoreMock = getStore as jest.Mock;
const INVOICE = {
  license: 'ABCDEFGHJKMNPQRSTVWX',
  licenseFormatted: 'ABCDE-FGHJK-MNPQR-STVWX',
  address: 'bc1qtestaddress',
  btcValue: 0.00042,
  uri: 'bitcoin:bc1qtestaddress?amount=0.00042',
  expiresAt: '2026-11-02T18:00:00.000Z',
};

let store: FakeStore;

beforeEach(() => {
  store = new FakeStore();
  getStoreMock.mockReturnValue(store);
});

describe('SatSale purchase storage', () => {
  it('round-trips the license and the pending invoice', async () => {
    await storeLicense(INVOICE.license);
    await storePendingInvoice(INVOICE);

    expect(await getStoredLicense()).toBe(INVOICE.license);
    expect(await getPendingInvoice()).toEqual(INVOICE);
  });

  it('clears only the invoice when the payment is still unresolved', async () => {
    await storeLicense(INVOICE.license);
    await storePendingInvoice(INVOICE);

    await clearPendingInvoice();

    expect(await getStoredLicense()).toBe(INVOICE.license);
    expect(await getPendingInvoice()).toBeNull();
  });

  it('clears both on an expired or revoked purchase', async () => {
    await storeLicense(INVOICE.license);
    await storePendingInvoice(INVOICE);

    await clearPurchaseState();

    expect(await getStoredLicense()).toBeNull();
    expect(await getPendingInvoice()).toBeNull();
  });

  it('ignores a corrupt stored invoice', async () => {
    store.setValue('satsalePendingInvoice', '{not json');

    expect(await getPendingInvoice()).toBeNull();
  });
});
