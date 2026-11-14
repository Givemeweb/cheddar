import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Upload, Download, ChevronRight, FileJson } from "lucide-react-native";
import { useTheme } from "../src/components/ThemeProvider";
import { trackEvent } from "../src/lib/analytics";

type MenuItem = {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  route: string;
  target: "export" | "import" | "mmbak";
};

type MenuGroup = {
  title: string;
  sublabel: string;
  items: MenuItem[];
};

export default function BackupDeviceScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const iconColor = isDark ? "#F9FAFB" : "#212226";

  const menuGroups: MenuGroup[] = [
    {
      title: t('backup.dataBackup'),
      sublabel: t('backup.dataBackupDesc'),
      items: [
        {
          label: t('backup.exportBackup'),
          sublabel: t('backup.exportBackupDesc'),
          icon: <Upload size={22} color="#10B981" />,
          route: "/backup-export",
          target: "export",
        },
      ],
    },
    {
      title: t('backup.dataRecovery'),
      sublabel: t('backup.dataRecoveryDesc'),
      items: [
        {
          label: t('backup.importBackup'),
          sublabel: t('backup.importBackupDesc'),
          icon: <Download size={22} color="#3B82F6" />,
          route: "/backup-import",
          target: "import",
        },
        {
          label: t('backup.importMMBak'),
          sublabel: t('backup.importMMBakDesc'),
          icon: <FileJson size={22} color="#8B5CF6" />,
          route: "/backup-mmbak",
          target: "mmbak",
        },
      ],
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
          {t("backup.onDevice")}
        </Text>
      </View>

      <ScrollView className="flex-1">
        <View className="px-4 pt-4">
          <View
            className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl p-4`}
          >
            <Text
              className={`${isDark ? "text-gray-300" : "text-gray-600"} text-sm leading-5`}
            >
              {t("backup.deviceInfo")}
            </Text>
          </View>
        </View>

        {menuGroups.map((group, groupIndex) => (
          <View key={group.title} className={groupIndex > 0 ? "" : "mt-4"}>
            <View className="px-4 pt-6">
              <Text
                className={`text-lg font-semibold mb-1 ${isDark ? "text-cheddar-light" : "text-cheddar-dark"}`}
              >
                {group.title}
              </Text>
              <Text
                className={`text-sm mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {group.sublabel}
              </Text>
              <View
                className={`${isDark ? "bg-[#26282D]" : "bg-white"} rounded-xl overflow-hidden`}
              >
                {group.items.map((item, index) => (
                  <TouchableOpacity
                    key={item.route}
                    className={`flex-row items-center justify-between p-4 ${
                      index > 0
                        ? `${isDark ? "border-gray-700" : "border-gray-100"}`
                        : ""
                    }`}
                    activeOpacity={0.7}
                    onPress={() => {
                      trackEvent('backup.row_open', { target: item.target });
                      router.push(item.route as never);
                    }}
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
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}