import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { X, Star } from "lucide-react-native";
import { useTheme } from "./ThemeProvider";
import { useTranslation } from "react-i18next";
import { trackSubscriptionEvent } from "../services/analytics";
import { useEffect } from "react";
import { PremiumFeature } from "./PremiumGate";

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  feature?: PremiumFeature;
}

export function PaywallModal({ visible, onClose, feature }: PaywallModalProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation();

  useEffect(() => {
    if (visible) {
      trackSubscriptionEvent("paywall_viewed", { feature });
    }
  }, [visible, feature]);

  const handleClose = () => {
    trackSubscriptionEvent("paywall_dismissed", { feature });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <Pressable className="flex-1" onPress={handleClose} />
        <View
          className={`rounded-t-3xl px-6 pt-6 pb-8 ${
            isDark ? "bg-[#1a1b1e]" : "bg-white"
          }`}
        >
          {/* Close button */}
          <View className="flex-row justify-end mb-2">
            <Pressable onPress={handleClose} className="p-2">
              <X size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
            </Pressable>
          </View>

          {/* Header */}
          <View className="items-center mb-6">
            <View
              className="w-16 h-16 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: "#FFB80020" }}
            >
              <Star size={32} color="#FFB800" fill="#FFB800" />
            </View>
            <Text
              className={`text-2xl font-bold mb-2 ${
                isDark ? "text-cheddar-light" : "text-cheddar-dark"
              }`}
            >
              {t("subscription.paywall.title")}
            </Text>
            <Text
              className={`text-base text-center ${
                isDark ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("subscription.paywall.subtitle")}
            </Text>
          </View>

          {/* Benefits */}
          <ScrollView className="mb-6" showsVerticalScrollIndicator={false}>
            {(
              [
                "voice",
                "unlimited",
                "stats",
                "backup",
                "subcategories",
                "alarms",
                "passcode",
              ] as const
            ).map((benefit) => (
              <View key={benefit} className="flex-row items-center mb-3">
                <View className="mr-3">
                  <Star size={16} color="#FBBF24" fill="#FBBF24" />
                </View>
                <Text
                  className={`text-sm ${
                    isDark ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {t(`subscription.paywall.benefits.${benefit}`)}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* CTA Buttons */}
          <View className="gap-3">
            {/* Placeholder for purchase buttons - full design in Slice 6 */}
            <Pressable
              className="bg-cheddar-yellow rounded-xl py-4 items-center"
              onPress={() => {
                // Purchase flow will be implemented in Slice 3
              }}
            >
              <Text className="text-cheddar-dark font-semibold text-base">
                {t("subscription.paywall.cta", { price: "$4.99" })}
              </Text>
            </Pressable>

            <Pressable onPress={handleClose} className="py-3 items-center">
              <Text
                className={`text-sm font-medium ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {t("subscription.paywall.dismiss")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
