import { Pressable, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export function FAB() {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push("/add-transaction")}
      style={styles.fab}
      android_ripple={{ color: "#E5A600", borderless: true }}
    >
      <Text style={styles.icon}>+</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 16,
    right: 16,
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
  icon: {
    fontSize: 32,
    color: "#1A1A1A",
    fontWeight: "300",
    marginTop: -2,
  },
});
