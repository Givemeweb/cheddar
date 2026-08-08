import { Pressable, StyleSheet } from "react-native";
import { Mic, Lock } from "lucide-react-native";

interface VoiceFABProps {
  isDark?: boolean;
  onPress?: () => void;
  locked?: boolean;
}

export function VoiceFAB({ isDark = false, onPress, locked = false }: VoiceFABProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.voiceFab, isDark && styles.voiceFabDark]}
      android_ripple={{ color: "#E5A600", borderless: true }}
    >
      {locked ? (
        <Lock size={22} color="#9CA3AF" />
      ) : (
        <Mic size={22} color={isDark ? "#F9FAFB" : "#212226"} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  voiceFab: {
    position: "absolute",
    bottom: 84,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  voiceFabDark: {
    backgroundColor: "#374151",
  },
});
