import { View, Text, Pressable, StyleSheet } from "react-native";
import { Receipt, BarChart3, Wallet, Settings } from "lucide-react-native";
import { usePathname, useRouter } from "expo-router";

interface NavItem {
  name: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { name: "index", label: "Transactions", icon: Receipt, href: "/" },
  { name: "stats", label: "Stats", icon: BarChart3, href: "/stats" },
  { name: "accounts", label: "Accounts", icon: Wallet, href: "/accounts" },
  { name: "more", label: "More", icon: Settings, href: "/more" },
];

interface SideNavProps {
  activeTab?: string;
}

export function SideNav({ activeTab }: SideNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentTab = activeTab ?? (pathname.replace("/", "") || "index");

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>Cheddar</Text>
      </View>
      <View style={styles.navItems}>
        {NAV_ITEMS.map((item) => {
          const isActive = currentTab === item.name;
          const Icon = item.icon;

          return (
            <Pressable
              key={item.name}
              onPress={() => router.push(item.href as never)}
              style={isActive ? styles.navItemActive : styles.navItem}
            >
              <Icon size={22} color={isActive ? "#FFB800" : "#6B7280"} />
              <Text
                style={
                  isActive
                    ? { ...styles.navItemText, color: "#FFB800", fontWeight: "600" }
                    : { ...styles.navItemText, color: "#6B7280" }
                }
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 220,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
    height: "100%",
  },
  logoContainer: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  logo: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFB800",
  },
  navItems: {
    paddingVertical: 16,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  navItemActive: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: "#FEF9E7",
  },
  navItemText: {
    fontSize: 15,
  },
});