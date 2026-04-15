import { View, Text, TouchableOpacity, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Settings,
  Wallet,
  Lock,
  Cloud,
  MessageCircle,
  Star,
} from "lucide-react-native";
import { useTheme } from "../../src/components/ThemeProvider";

type MenuItem = {
  label: string;
  icon: React.ReactNode;
  route: string;
};

export default function MoreScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const iconColor = isDark ? "#F9FAFB" : "#1A1A1A";

  const menuItems: MenuItem[] = [
    {
      label: t('more.configuration'),
      icon: <Settings size={24} color={iconColor} />,
      route: "/configuration",
    },
    {
      label: t('more.accounts'),
      icon: <Wallet size={24} color={iconColor} />,
      route: "/accounts",
    },
    {
      label: t('more.passcode'),
      icon: <Lock size={24} color={iconColor} />,
      route: "/passcode",
    },
    {
      label: t('more.backup'),
      icon: <Cloud size={24} color={iconColor} />,
      route: "/backup",
    },
    {
      label: t('more.feedback'),
      icon: <MessageCircle size={24} color={iconColor} />,
      route: "/feedback",
    },
    {
      label: t('more.recommend'),
      icon: <Star size={24} color={iconColor} />,
      route: "/recommend",
    },
  ];

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}
      edges={isLargeScreen ? ["top", "right", "bottom"] : undefined}
    >
      <View className="flex-1 px-4 pt-4">
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={item.route}
            className={`flex-row items-center p-4 ${
              index === 0 ? "rounded-t-xl" : ""
            } ${
              index === menuItems.length - 1 ? "rounded-b-xl" : ""
            } ${
              index > 0 && index < menuItems.length ? (isDark ? "border-t border-gray-700" : "border-t border-gray-100") : ""
            } ${isDark ? 'bg-gray-800' : 'bg-white'}`}
            activeOpacity={0.7}
            onPress={() => router.push(item.route as never)}
          >
            <View className="mr-4">{item.icon}</View>
            <Text className={`text-lg ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}