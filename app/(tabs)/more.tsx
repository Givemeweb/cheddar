import { View, Text, TouchableOpacity, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Settings,
  Wallet,
  Lock,
  Cloud,
  MessageCircle,
  Star,
} from "lucide-react-native";

type MenuItem = {
  label: string;
  icon: React.ReactNode;
  route: string;
};

const menuItems: MenuItem[] = [
  {
    label: "Configuration",
    icon: <Settings size={24} color="#1A1A1A" />,
    route: "/configuration",
  },
  {
    label: "Accounts",
    icon: <Wallet size={24} color="#1A1A1A" />,
    route: "/accounts",
  },
  {
    label: "Passcode",
    icon: <Lock size={24} color="#1A1A1A" />,
    route: "/passcode",
  },
  {
    label: "Backup",
    icon: <Cloud size={24} color="#1A1A1A" />,
    route: "/backup",
  },
  {
    label: "Feedback",
    icon: <MessageCircle size={24} color="#1A1A1A" />,
    route: "/feedback",
  },
  {
    label: "Recommend",
    icon: <Star size={24} color="#1A1A1A" />,
    route: "/recommend",
  },
];

export default function MoreScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  return (
    <SafeAreaView
      className="flex-1 bg-cheddar-light"
      edges={isLargeScreen ? ["top", "right", "bottom"] : undefined}
    >
      <View className="flex-1 px-4 pt-4">
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={item.route}
            className={`flex-row items-center bg-white p-4 ${
              index === 0 ? "rounded-t-xl" : ""
            } ${
              index === menuItems.length - 1 ? "rounded-b-xl" : ""
            } ${
              index > 0 && index < menuItems.length - 1 ? "border-t border-gray-100" : ""
            }`}
            activeOpacity={0.7}
            onPress={() => router.push(item.route as never)}
          >
            <View className="mr-4">{item.icon}</View>
            <Text className="text-lg text-cheddar-dark">{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}