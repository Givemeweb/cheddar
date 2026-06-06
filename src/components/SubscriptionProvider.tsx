import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  subscriptionCore,
  SubscriptionTier,
} from '../services/subscriptionCore';

interface SubscriptionContextType {
  isInitialized: boolean;
  isPremium: boolean;
  tier: SubscriptionTier;
  expiryDate: Date | null;
  anonymousUserId: string | null;
  isRefreshing: boolean;
  refreshStatus: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  isInitialized: false,
  isPremium: false,
  tier: 'free',
  expiryDate: null,
  anonymousUserId: null,
  isRefreshing: false,
  refreshStatus: async () => {},
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [anonymousUserId, setAnonymousUserId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync React state with the core module's current state
  const syncState = useCallback(() => {
    setIsPremium(subscriptionCore.isPremium());
    setTier(subscriptionCore.getTier());
    setExpiryDate(subscriptionCore.getExpiryDate());
    setAnonymousUserId(subscriptionCore.getAnonymousUserId());
  }, []);

  // Initialize on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await subscriptionCore.initialize();
      } catch {
        // Initialization errors are handled inside the core module
      }
      if (!cancelled) {
        syncState();
        setIsInitialized(true);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [syncState]);

  const refreshStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await subscriptionCore.refreshStatus();
    } catch {
      // Errors are handled inside the core module
    } finally {
      syncState();
      setIsRefreshing(false);
    }
  }, [syncState]);

  return (
    <SubscriptionContext.Provider
      value={{
        isInitialized,
        isPremium,
        tier,
        expiryDate,
        anonymousUserId,
        isRefreshing,
        refreshStatus,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}
