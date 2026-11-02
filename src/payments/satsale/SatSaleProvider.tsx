import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { AppState } from 'react-native';
import { useDatabase } from '../../components/DatabaseProvider';
import { getCachedPremium, setCachedPremium } from '../../db/premium';
import {
  PaymentContext,
  PaymentProviderProps,
  type CryptoInvoice,
  type CryptoPaymentValue,
  type CryptoPrice,
  type CryptoStatus,
  type PaymentPackage,
} from '../PaymentContext';
import {
  createSatSaleInvoice,
  fetchSatSaleConfig,
  fetchSatSaleStatus,
  normalizeLicense,
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

/** The paywall shows this next to the shared RevenueCat price slot. */
export function formatPrice(amount: number, currency: string): string {
  try {
    return amount.toLocaleString('en-US', { style: 'currency', currency });
  } catch {
    return `${currency} ${amount}`;
  }
}

export function SatSaleProvider({ children }: PaymentProviderProps) {
  const { isReady } = useDatabase();
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isEntitlementLoaded, setIsEntitlementLoaded] = useState(false);
  const [lifetimePackage, setLifetimePackage] =
    useState<PaymentPackage | null>(null);
  const [price, setPrice] = useState<CryptoPrice | null>(null);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);
  const [pendingInvoice, setPendingInvoice] =
    useState<CryptoInvoice | null>(null);

  // Refs mirror the stored values for the AppState listener and for the
  // callbacks that must not be recreated on every state change.
  const licenseRef = useRef<string | null>(null);
  const pendingRef = useRef<CryptoInvoice | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyPremium = useCallback(async (active: boolean) => {
    if (mountedRef.current) setIsPremium(active);
    // The existing free-tier guards read this aggregate key.
    await setCachedPremium(active);
  }, []);

  const applyPendingInvoice = useCallback(
    async (invoice: CryptoInvoice | null) => {
      pendingRef.current = invoice;
      if (mountedRef.current) setPendingInvoice(invoice);
      if (invoice) {
        await storePendingInvoice(invoice);
      } else {
        await clearPendingInvoice();
      }
    },
    [],
  );

  /**
   * Applies a reconciled status. A failed request never reaches this point,
   * so an offline launch keeps the cached premium.
   */
  const recordStatus = useCallback(
    async (status: CryptoStatus): Promise<CryptoStatus> => {
      if (status.status === 'paid') {
        licenseRef.current = status.license;
        await storeLicense(status.license);
        await applyPendingInvoice(null);
        await applyPremium(true);
        return status;
      }

      if (
        status.status === 'expired' ||
        status.status === 'revoked' ||
        status.status === 'invalid'
      ) {
        // A wrong code typed in the restore field must not revoke a license
        // that is already active; only the stored license can clear itself.
        if (licenseRef.current === status.license) {
          licenseRef.current = null;
          pendingRef.current = null;
          if (mountedRef.current) setPendingInvoice(null);
          await clearPurchaseState();
          await applyPremium(false);
        }
        return status;
      }

      // pending or detected: keep the invoice so the modal can resume it.
      if (status.license) {
        licenseRef.current = status.license;
        await storeLicense(status.license);
        if (status.address) {
          await applyPendingInvoice({
            license: status.license,
            licenseFormatted: status.licenseFormatted,
            address: status.address,
            btcValue: status.btcValue,
            uri: status.uri,
            expiresAt: status.expiresAt,
          });
        }
      }
      return status;
    },
    [applyPendingInvoice, applyPremium],
  );

  const checkStatus = useCallback(
    async (license?: string): Promise<CryptoStatus> => {
      const target =
        license ?? licenseRef.current ?? pendingRef.current?.license;
      if (!target) {
        throw new Error('There is no license to check');
      }

      const status = await fetchSatSaleStatus(target);
      return recordStatus(status);
    },
    [recordStatus],
  );

  const refreshOfferings = useCallback(async () => {
    const config = await fetchSatSaleConfig();
    if (!mountedRef.current) return;

    setPrice({ amount: config.price, currency: config.currency });
    setSupportEmail(config.supportEmail || null);
    setLifetimePackage({
      product: {
        priceString: formatPrice(config.price, config.currency),
      },
    });
  }, []);

  const createInvoice = useCallback(async (): Promise<CryptoInvoice> => {
    // A still-pending license is reused by the backend instead of burning a
    // second invoice.
    const invoice = await createSatSaleInvoice(pendingRef.current?.license);
    licenseRef.current = invoice.license;
    await storeLicense(invoice.license);
    await applyPendingInvoice(invoice);
    return invoice;
  }, [applyPendingInvoice]);

  const restoreLicense = useCallback(
    async (code: string): Promise<CryptoStatus> => {
      const license = normalizeLicense(code);
      if (!license) {
        throw new SatSaleApiError(
          'invalid_license',
          'The license code is not valid',
        );
      }

      const status = await fetchSatSaleStatus(license);
      return recordStatus(status);
    },
    [recordStatus],
  );

  useEffect(() => {
    if (!isReady) return;

    let cancelled = false;

    async function loadPurchaseState() {
      let cached = false;
      try {
        cached = await getCachedPremium();
      } catch (error) {
        // A failed read must not leave the tier unknown forever.
        console.warn('[satsale] Failed to read cached premium', error);
      }
      if (cancelled) return;
      setIsPremium(cached);
      setIsEntitlementLoaded(true);

      const [license, invoice] = await Promise.all([
        getStoredLicense(),
        getPendingInvoice(),
      ]);
      if (cancelled) return;
      licenseRef.current = license;
      pendingRef.current = invoice;
      setPendingInvoice(invoice);

      const work: Promise<unknown>[] = [refreshOfferings()];
      if (license) work.push(checkStatus(license));

      const results = await Promise.allSettled(work);
      if (cancelled) return;
      for (const result of results) {
        if (result.status === 'rejected') {
          // Offline: the cached entitlement and license stay untouched.
          console.warn('[satsale] Startup check failed', result.reason);
        }
      }
      setIsLoading(false);
    }

    loadPurchaseState();

    return () => {
      cancelled = true;
    };
  }, [isReady, refreshOfferings, checkStatus]);

  useEffect(() => {
    if (!isReady) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const license = licenseRef.current;
      if (!license) return;

      void checkStatus(license).catch((error) => {
        console.warn('[satsale] Failed to refresh the license', error);
      });
    });

    return () => subscription.remove();
  }, [isReady, checkStatus]);

  // The Bitcoin flow uses createInvoice/checkStatus; the shared lifetime
  // purchase methods have no store to call in this build.
  const purchaseLifetime = useCallback(async () => false, []);
  const restorePurchases = useCallback(async () => false, []);

  const crypto: CryptoPaymentValue = {
    price,
    supportEmail,
    pendingInvoice,
    createInvoice,
    checkStatus,
    restoreLicense,
  };

  return (
    <PaymentContext.Provider
      value={{
        isPremium,
        isLoading,
        isEntitlementLoaded,
        lifetimePackage,
        refreshOfferings,
        purchaseLifetime,
        restorePurchases,
        crypto,
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
}

export const PaymentProvider: ComponentType<PaymentProviderProps> =
  SatSaleProvider;
