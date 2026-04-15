import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Smartphone, ChevronRight } from "lucide-react-native";
import { useTheme } from "../src/components/ThemeProvider";

type MenuItem = {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  route: string;
};

export default function BackupScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const iconColor = isDark ? "#F9FAFB" : "#212226";

  const menuItems: MenuItem[] = [
    {
      label: t('backup.onDevice'),
      sublabel: t('backup.onDeviceDesc'),
      icon: <Smartphone size={22} color={iconColor} />,
      route: "/backup-device",
    },
  ];

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? "bg-cheddar-dark" : "bg-cheddar-light"}`}
    >
      <View
        className={`flex-row items-center px-4 py-3 ${isDark ? "bg-[#26282D] border-gray-700" : "bg-white border-gray-200"} border-b`}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">
            {t("common.back")}
          </Text>
        </TouchableOpacity>
        <Text
          className={`text-xl font-semibold ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
        >
          {t("backup.title")}
        </Text>
      </View>

      <View className="flex-1 px-4 pt-4">
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={item.route}
            className={`flex-row items-center justify-between p-4 ${
              isDark ? "bg-[#26282D]" : "bg-white"
            } rounded-xl`}
            activeOpacity={0.7}
            onPress={() => router.push(item.route as never)}
          >
            <View className="flex-row items-center flex-1">
              <View className="mr-3">{item.icon}</View>
              <View className="flex-1">
                <Text
                  className={`text-lg ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
                >
                  {item.label}
                </Text>
                <Text
                  className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                >
                  {item.sublabel}
                </Text>
              </View>
            </View>
            <ChevronRight size={20} color="#9CA3AF" />
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}