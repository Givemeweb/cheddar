import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import {
  subscriptionCore,
  SubscriptionTier,
} from "../services/subscriptionCore";
import { trackSubscriptionEvent } from "../services/analytics";

export type RestoreError =
  | "NO_PURCHASES_FOUND"
  | "ALREADY_LINKED"
  | "INVALID_RECEIPT"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

interface SubscriptionContextType {
  isInitialized: boolean;
  isPremium: boolean;
  tier: SubscriptionTier;
  expiryDate: Date | null;
  anonymousUserId: string | null;
  isRefreshing: boolean;
  isRestoring: boolean;
  restoreError: RestoreError | null;
  restoreSuccess: boolean;
  autoRestoreAttempted: boolean;
  refreshStatus: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  clearRestoreState: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  isInitialized: false,
  isPremium: false,
  tier: "free",
  expiryDate: null,
  anonymousUserId: null,
  isRefreshing: false,
  isRestoring: false,
  restoreError: null,
  restoreSuccess: false,
  autoRestoreAttempted: false,
  refreshStatus: async () => {},
  restorePurchases: async () => {},
  clearRestoreState: () => {},
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

interface SubscriptionProviderProps {
  children: ReactNode;
}

const ERROR_MESSAGES: Record<RestoreError, string> = {
  NO_PURCHASES_FOUND: "No previous purchases found for this account",
  ALREADY_LINKED:
    "This purchase is already linked to another device. Contact support if you need help.",
  INVALID_RECEIPT: "Receipt validation failed. Please try again.",
  NETWORK_ERROR: "Check your connection and try again.",
  UNKNOWN_ERROR: "Something went wrong. Please try again.",
};

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [anonymousUserId, setAnonymousUserId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<RestoreError | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [autoRestoreAttempted, setAutoRestoreAttempted] = useState(false);
  const autoRestoreStartedRef = useRef(false);

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

  // Auto-restore on first launch (non-blocking)
  useEffect(() => {
    if (!isInitialized || autoRestoreStartedRef.current) return;
    autoRestoreStartedRef.current = true;

    async function attemptAutoRestore() {
      // Check if we have a subscription cache
      const hasCache = await subscriptionCore.hasSubscriptionCache();
      if (hasCache) {
        // Cache exists — skip auto-restore
        setAutoRestoreAttempted(true);
        return;
      }

      // No cache — silently attempt to restore in the background
      setAutoRestoreAttempted(true);

      try {
        const result = await subscriptionCore.restoreSubscription();
        if (result.success) {
          syncState();
          await trackSubscriptionEvent("restore_completed", {
            tier: result.tier,
          });
        }
        // If no purchases found, stay silent — user can manually restore later
      } catch {
        // Silently fail — don't show errors during auto-restore
      }
    }

    attemptAutoRestore();
  }, [isInitialized, syncState]);

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

  const restorePurchases = useCallback(async () => {
    if (isRestoring) return;

    setIsRestoring(true);
    setRestoreError(null);
    setRestoreSuccess(false);

    await trackSubscriptionEvent("restore_initiated");

    try {
      const result = await subscriptionCore.restoreSubscription();

      if (result.success) {
        syncState();
        setRestoreSuccess(true);
        await trackSubscriptionEvent("restore_completed", {
          tier: result.tier,
        });
      } else {
        const errorKey =
          (result.error as RestoreError) ?? "UNKNOWN_ERROR";
        const normalizedError =
          errorKey in ERROR_MESSAGES ? errorKey : "UNKNOWN_ERROR";
        setRestoreError(normalizedError);
        await trackSubscriptionEvent("restore_failed", {
          error: normalizedError,
        });
      }
    } catch {
      setRestoreError("UNKNOWN_ERROR");
      await trackSubscriptionEvent("restore_failed", {
        error: "UNKNOWN_ERROR",
      });
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring, syncState]);

  const clearRestoreState = useCallback(() => {
    setRestoreError(null);
    setRestoreSuccess(false);
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{
        isInitialized,
        isPremium,
        tier,
        expiryDate,
        anonymousUserId,
        isRefreshing,
        isRestoring,
        restoreError,
        restoreSuccess,
        autoRestoreAttempted,
        refreshStatus,
        restorePurchases,
        clearRestoreState,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}
