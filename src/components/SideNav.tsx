import { View, Text, Pressable, StyleSheet } from "react-native";
import { Receipt, BarChart3, Wallet, Settings } from "lucide-react-native";
import { usePathname, useRouter } from "expo-router";
import { useTheme } from "./ThemeProvider";
import { useTranslation } from "react-i18next";

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
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const currentTab = activeTab ?? (pathname.replace("/", "") || "index");

  const inactiveColor = isDark ? "#9CA3AF" : "#6B7280";

  // Get localized labels
  const localizedNavItems = NAV_ITEMS.map(item => ({
    ...item,
    label: t(`tabs.${item.name}`),
  }));

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.logoContainer, isDark && styles.logoContainerDark]}>
        <Text style={styles.logo}>{t('app.name')}</Text>
      </View>
      <View style={styles.navItems}>
        {localizedNavItems.map((item) => {
          const isActive = currentTab === item.name;
          const Icon = item.icon;

          return (
            <Pressable
              key={item.name}
              onPress={() => router.push(item.href as never)}
              style={isActive ? [styles.navItemActive, isDark && styles.navItemActiveDark] : styles.navItem}
            >
              <Icon size={22} color={isActive ? "#FFB800" : inactiveColor} />
              <Text
                style={
                  isActive
                    ? { ...styles.navItemText, color: "#FFB800", fontWeight: "600" }
                    : { ...styles.navItemText, color: inactiveColor }
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
  containerDark: {
    backgroundColor: "#26282D",
    borderRightColor: "#374151",
  },
  logoContainer: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  logoContainerDark: {
    borderBottomColor: "#374151",
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
  navItemActiveDark: {
    backgroundColor: "#374151",
  },
  navItemText: {
    fontSize: 15,
  },
});