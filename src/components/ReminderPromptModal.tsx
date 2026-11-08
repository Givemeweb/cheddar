import { Modal, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "./ThemeProvider";

type ReminderPromptModalProps = {
  visible: boolean;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function ReminderPromptModal({
  visible,
  busy = false,
  onAccept,
  onDecline,
}: ReminderPromptModalProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const titleColor = isDark ? "text-cheddar-light" : "text-cheddar-dark";
  const bodyColor = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onDecline();
      }}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-6"
        onPress={() => {
          if (!busy) onDecline();
        }}
      >
        <Pressable
          className={`w-full max-w-sm rounded-2xl p-6 ${isDark ? "bg-[#26282D]" : "bg-white"}`}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
        >
          <Text className={`text-xl font-semibold ${titleColor}`}>
            {t("alarm.reminderPromptTitle")}
          </Text>
          <Text className={`mt-3 text-base leading-6 ${bodyColor}`}>
            {t("alarm.reminderPromptBody")}
          </Text>

          <Pressable
            className={`mt-6 rounded-xl bg-cheddar-yellow py-3.5 ${busy ? "opacity-60" : ""}`}
            onPress={onAccept}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text className="text-center text-base font-semibold text-cheddar-dark">
              {t("alarm.reminderPromptAccept")}
            </Text>
          </Pressable>

          <Pressable
            className="mt-2 py-3"
            onPress={onDecline}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text className={`text-center text-base font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {t("alarm.reminderPromptDecline")}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
