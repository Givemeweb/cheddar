import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  isPurchasesError,
  LOG_LEVEL,
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import { getCachedPremium, setCachedPremium } from '../db/premium';
import { useDatabase } from './DatabaseProvider';

const ENTITLEMENT_ID = 'cheddar_pro';
// Development-only override, never honored in release builds.
const FORCE_PREMIUM = __DEV__ && process.env.EXPO_PUBLIC_FORCE_PREMIUM === '1';

let isPurchasesConfigured = false;

function getApiKey(): string | undefined {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_RC_API_KEY_IOS;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID;
  return undefined;
}

export class PremiumNotGrantedError extends Error {
  constructor() {
    super('The purchase completed but the premium entitlement is not active');
    this.name = 'PremiumNotGrantedError';
  }
}

export function hasPremiumEntitlement(customerInfo: CustomerInfo): boolean {
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

function findLifetimePackage(offerings: PurchasesOfferings): PurchasesPackage | null {
  const current = offerings.current;
  if (!current) return null;

  return (
    current.availablePackages.find((pkg) => pkg.packageType === PACKAGE_TYPE.LIFETIME) ??
    current.availablePackages.find((pkg) => pkg.identifier === '$rc_lifetime') ??
    null
  );
}

type PremiumContextType = {
  isPremium: boolean;
  isLoading: boolean;
  lifetimePackage: PurchasesPackage | null;
  purchaseLifetime: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
};

const PremiumContext = createContext<PremiumContextType>({
  isPremium: false,
  isLoading: true,
  lifetimePackage: null,
  purchaseLifetime: async () => false,
  restorePurchases: async () => false,
});

export function usePremium() {
  return useContext(PremiumContext);
}

interface PremiumProviderProps {
  children: ReactNode;
}

export function PremiumProvider({ children }: PremiumProviderProps) {
  const { isReady } = useDatabase();
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lifetimePackage, setLifetimePackage] = useState<PurchasesPackage | null>(null);
  const listenerRef = useRef<((customerInfo: CustomerInfo) => void) | null>(null);

  const applyCustomerInfo = useCallback((customerInfo: CustomerInfo) => {
    const active = FORCE_PREMIUM || hasPremiumEntitlement(customerInfo);
    setIsPremium(active);
    void setCachedPremium(active).catch((error) => {
      console.warn('[premium] Failed to cache entitlement', error);
    });
  }, []);

  useEffect(() => {
    if (!isReady) return;

    let cancelled = false;

    async function loadPremiumState() {
      if (Platform.OS === 'web') {
        setIsPremium(FORCE_PREMIUM);
        setIsLoading(false);
        return;
      }

      const cached = await getCachedPremium();
      if (cancelled) return;
      setIsPremium(FORCE_PREMIUM || cached);

      const apiKey = getApiKey();
      if (!apiKey) {
        console.warn('[premium] Missing RevenueCat SDK key for this platform');
        setIsLoading(false);
        return;
      }

      try {
        if (!isPurchasesConfigured) {
          await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
          Purchases.configure({ apiKey });
          isPurchasesConfigured = true;
        }

        if (cancelled) return;

        const listener = (customerInfo: CustomerInfo) => {
          if (!cancelled) applyCustomerInfo(customerInfo);
        };
        listenerRef.current = listener;
        Purchases.addCustomerInfoUpdateListener(listener);

        const [customerInfoResult, offeringsResult] = await Promise.allSettled([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);

        if (cancelled) return;

        if (customerInfoResult.status === 'fulfilled') {
          applyCustomerInfo(customerInfoResult.value);
        } else {
          // Keep the cached state when the network or store is unavailable.
          console.warn(
            '[premium] Failed to load RevenueCat state',
            customerInfoResult.reason,
          );
        }

        // Offerings only affect the price; a failure must not block entitlement updates.
        if (offeringsResult.status === 'fulfilled') {
          setLifetimePackage(findLifetimePackage(offeringsResult.value));
        }
      } catch (error) {
        console.warn('[premium] Failed to initialize RevenueCat', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadPremiumState();

    return () => {
      cancelled = true;
      if (listenerRef.current) {
        Purchases.removeCustomerInfoUpdateListener(listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, [isReady, applyCustomerInfo]);

  const purchaseLifetime = useCallback(async () => {
    if (Platform.OS === 'web') return false;

    let pkg = lifetimePackage;
    if (!pkg) {
      const offerings = await Purchases.getOfferings();
      pkg = findLifetimePackage(offerings);
      setLifetimePackage(pkg);
    }
    if (!pkg) {
      throw new Error('Lifetime package is not available');
    }

    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = FORCE_PREMIUM || hasPremiumEntitlement(customerInfo);
      setIsPremium(active);
      await setCachedPremium(active);
      if (!active) throw new PremiumNotGrantedError();
      return true;
    } catch (error) {
      if (
        isPurchasesError(error) &&
        error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
      ) {
        return false;
      }
      throw error;
    }
  }, [lifetimePackage]);

  const restorePurchases = useCallback(async () => {
    if (Platform.OS === 'web') return false;

    const customerInfo = await Purchases.restorePurchases();
    const active = FORCE_PREMIUM || hasPremiumEntitlement(customerInfo);
    setIsPremium(active);
    await setCachedPremium(active);
    return active;
  }, []);

  return (
    <PremiumContext.Provider
      value={{
        isPremium,
        isLoading,
        lifetimePackage,
        purchaseLifetime,
        restorePurchases,
      }}
    >
      {children}
    </PremiumContext.Provider>
  );
}
