import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Sun, Moon, Smartphone, Check } from "lucide-react-native";
import { useTheme, ThemeMode } from "../../src/components/ThemeProvider";

type ThemeOption = {
  mode: ThemeMode;
  label: string;
  description: string;
  icon: React.ReactNode;
};

export default function StyleScreen() {
  const router = useRouter();
  const { themeMode, setThemeMode, isDark } = useTheme();

  const iconColor = isDark ? "#F9FAFB" : "#1A1A1A";

  const themeOptions: ThemeOption[] = [
    {
      mode: "system",
      label: "System",
      description: "Follow system settings",
      icon: <Smartphone size={24} color={iconColor} />,
    },
    {
      mode: "light",
      label: "Light",
      description: "Always use light theme",
      icon: <Sun size={24} color="#FFB800" />,
    },
    {
      mode: "dark",
      label: "Dark",
      description: "Always use dark theme",
      icon: <Moon size={24} color="#6B7280" />,
    },
  ];

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'bg-cheddar-dark' : 'bg-cheddar-light'}`}>
      <View className={`flex-row items-center px-4 py-3 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b`}>
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-cheddar-yellow text-lg font-medium">Back</Text>
        </TouchableOpacity>
        <Text className={`text-xl font-semibold ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>Style</Text>
      </View>

      <View className="flex-1 px-4 pt-4">
        <Text className={`text-sm font-medium uppercase mb-2 px-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Theme
        </Text>
        <View className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl overflow-hidden`}>
          {themeOptions.map((option, index) => {
            const isSelected = themeMode === option.mode;
            return (
              <TouchableOpacity
                key={option.mode}
                className={`flex-row items-center justify-between p-4 ${
                  index > 0 ? `${isDark ? 'border-gray-700' : 'border-gray-100'}` : ""
                }`}
                activeOpacity={0.7}
                onPress={() => setThemeMode(option.mode)}
              >
                <View className="flex-row items-center flex-1">
                  <View className="mr-3">{option.icon}</View>
                  <View className="flex-1">
                    <Text className={`text-lg ${isDark ? 'text-cheddar-light' : 'text-cheddar-dark'}`}>{option.label}</Text>
                    <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{option.description}</Text>
                  </View>
                </View>
                {isSelected && <Check size={20} color="#FFB800" />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}