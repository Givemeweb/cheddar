import { ReactNode, useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Lock } from "lucide-react-native";
import { useSubscription } from "./SubscriptionProvider";
import { useTheme } from "./ThemeProvider";
import { PaywallModal } from "./PaywallModal";

export type PremiumFeature =
  | "voice"
  | "unlimited_accounts"
  | "advanced_stats"
  | "backup"
  | "subcategories"
  | "alarms"
  | "passcode";

export const FEATURE_REQUIREMENTS: Record<PremiumFeature, "free" | "premium"> = {
  voice: "premium",
  unlimited_accounts: "premium",
  advanced_stats: "premium",
  backup: "premium",
  subcategories: "premium",
  alarms: "premium",
  passcode: "premium",
};

interface PremiumGateProps {
  feature: PremiumFeature;
  children: ReactNode;
  fallback?: ReactNode;
  showPaywallOnPress?: boolean;
}

function DefaultFallback({ onPress, isDark }: { onPress: () => void; isDark: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-center py-3 px-4 rounded-xl ${
        isDark ? "bg-[#26282D]" : "bg-white"
      }`}
      style={{ opacity: 0.9 }}
    >
      <Lock size={18} color="#9CA3AF" />
      <Text
        className={`ml-2 text-sm font-medium ${
          isDark ? "text-gray-400" : "text-gray-500"
        }`}
      >
        Upgrade to Premium
      </Text>
    </Pressable>
  );
}

export function PremiumGate({
  feature,
  children,
  fallback,
  showPaywallOnPress = true,
}: PremiumGateProps) {
  const { isPremium } = useSubscription();
  const { isDark } = useTheme();
  const [paywallVisible, setPaywallVisible] = useState(false);

  const requirement = FEATURE_REQUIREMENTS[feature];
  const hasAccess = requirement === "free" || isPremium;

  const openPaywall = useCallback(() => {
    if (showPaywallOnPress) {
      setPaywallVisible(true);
    }
  }, [showPaywallOnPress]);

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <>
      {fallback ?? <DefaultFallback onPress={openPaywall} isDark={isDark} />}
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature={feature}
      />
    </>
  );
}
