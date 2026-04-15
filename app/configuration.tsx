import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Lock,
  Bell,
  Palette,
  ChevronRight,
} from "lucide-react-native";
import { useTheme } from "../src/components/ThemeProvider";

type MenuItem = {
  label: string;
  icon: React.ReactNode;
  route: string;
};

type MenuGroup = {
  title: string;
  items: MenuItem[];
};

export default function ConfigurationScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const iconColor = isDark ? "#F9FAFB" : "#1A1A1A";

  const menuGroups: MenuGroup[] = [
    {
      title: "Category",
      items: [
        {
          label: "Income Categories",
          icon: <TrendingUp size={22} color="#10B981" />,
          route: "/configuration/income-categories",
        },
        {
          label: "Expense Categories",
          icon: <TrendingDown size={22} color="#EF4444" />,
          route: "/configuration/expense-categories",
        },
      ],
    },
    {
      title: "Configuration",
      items: [
        {
          label: "Main Currency",
          icon: <DollarSign size={22} color={iconColor} />,
          route: "/configuration/currency",
        },
      ],
    },
    {
      title: "Other",
      items: [
        {
          label: "Passcode",
          icon: <Lock size={22} color={iconColor} />,
          route: "/passcode",
        },
        {
          label: "Alarm Settings",
          icon: <Bell size={22} color={iconColor} />,
          route: "/configuration/alarms",
        },
        {
          label: "Style",
          icon: <Palette size={22} color={iconColor} />,
          route: "/configuration/style",
        },
      ],
    },
  ];

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
      <View className={`flex-row items-center px-4 py-3 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b`}>
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">Back</Text>
        </TouchableOpacity>
        <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>Configuration</Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {menuGroups.map((group, groupIndex) => (
          <View key={group.title} className={groupIndex > 0 ? "mt-6" : ""}>
            <Text className={`text-sm font-medium uppercase mb-2 px-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {group.title}
            </Text>
            <View className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl overflow-hidden`}>
              {group.items.map((item, index) => (
                <TouchableOpacity
                  key={item.route}
                  className={`flex-row items-center justify-between p-4 ${
                    index > 0 ? `${isDark ? 'border-gray-700' : 'border-gray-100'}` : ""
                  }`}
                  activeOpacity={0.7}
                  onPress={() => router.push(item.route as never)}
                >
                  <View className="flex-row items-center">
                    <View className="mr-3">{item.icon}</View>
                    <Text className={`text-lg ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>{item.label}</Text>
                  </View>
                  <ChevronRight size={20} color="#9CA3AF" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}