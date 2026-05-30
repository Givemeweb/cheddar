import { useState } from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Mic } from "lucide-react-native";
import { VoiceRecorderModal, AddTransactionParams } from "./VoiceRecorderModal";

interface FABProps {
  isDark?: boolean;
}

export function FAB({ isDark = false }: FABProps) {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);

  const handleResult = (params: AddTransactionParams | null) => {
    if (!params) return;

    const queryParams = new URLSearchParams();
    if (params.type) queryParams.set("type", params.type);
    if (params.amount) queryParams.set("amount", params.amount);
    if (params.note) queryParams.set("note", params.note);
    if (params.description) queryParams.set("description", params.description);
    if (params.date) queryParams.set("date", params.date);
    if (params.accountId) queryParams.set("accountId", params.accountId);
    if (params.categoryId) queryParams.set("categoryId", params.categoryId);
    if (params.subcategoryId) queryParams.set("subcategoryId", params.subcategoryId);
    if (params.fromAccountId) queryParams.set("fromAccountId", params.fromAccountId);
    if (params.toAccountId) queryParams.set("toAccountId", params.toAccountId);
    if (params.imagePath) queryParams.set("imagePath", params.imagePath);

    router.push(`/add-transaction?${queryParams.toString()}` as never);
  };

  return (
    <View style={styles.container}>
      {/* Microphone FAB */}
      <Pressable
        onPress={() => setModalVisible(true)}
        style={[styles.fab, styles.micFab, isDark && styles.fabDark]}
        android_ripple={{ color: "#E5A600", borderless: true }}
      >
        <Mic size={28} color="#212226" />
      </Pressable>

      {/* Plus FAB */}
      <Pressable
        onPress={() => router.push("/add-transaction")}
        style={[styles.fab, isDark && styles.fabDark]}
        android_ripple={{ color: "#E5A600", borderless: true }}
      >
        <Text style={[styles.icon, isDark && styles.iconDark]}>+</Text>
      </Pressable>

      <VoiceRecorderModal
        visible={modalVisible}
        onResult={handleResult}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 16,
    right: 16,
    alignItems: "center",
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFB800",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  micFab: {
    marginBottom: 16,
  },
  fabDark: {
    backgroundColor: "#FFB800",
  },
  icon: {
    fontSize: 32,
    color: "#212226",
    fontWeight: "300",
    marginTop: -2,
  },
  iconDark: {
    color: "#212226",
  },
});
