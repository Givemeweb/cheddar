import { useState, useCallback, useEffect } from "react";
import { useSubscription } from "../components/SubscriptionProvider";
import { getAccounts, getCategories } from "../db/storage";

export function usePremiumGate() {
  const { isPremium } = useSubscription();
  const [accountCount, setAccountCount] = useState(0);
  const [categoryCount, setCategoryCount] = useState(0);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState<string | undefined>(undefined);

  const refreshCounts = useCallback(async () => {
    const accounts = await getAccounts();
    const categories = await getCategories();
    setAccountCount(accounts.length);
    setCategoryCount(categories.length);
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const canAddAccount = isPremium || accountCount < 3;
  const canAddCategory = isPremium || categoryCount < 10;

  const showPaywall = useCallback((feature?: string) => {
    setPaywallFeature(feature);
    setPaywallVisible(true);
  }, []);

  const hidePaywall = useCallback(() => {
    setPaywallVisible(false);
    setPaywallFeature(undefined);
  }, []);

  return {
    isPremium,
    accountCount,
    categoryCount,
    canAddAccount,
    canAddCategory,
    paywallVisible,
    paywallFeature,
    showPaywall,
    hidePaywall,
    refreshCounts,
  };
}
