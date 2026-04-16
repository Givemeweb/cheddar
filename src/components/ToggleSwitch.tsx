import { View, TouchableOpacity } from "react-native";
import { useTheme } from "./ThemeProvider";

type ToggleSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function ToggleSwitch({ value, onValueChange }: ToggleSwitchProps) {
  const { isDark } = useTheme();

  return (
    <TouchableOpacity
      className={`w-12 h-7 rounded-full p-1 ${value ? 'bg-cheddar-yellow' : isDark ? 'bg-gray-600' : 'bg-gray-300'}`}
      onPress={() => onValueChange(!value)}
      activeOpacity={0.8}
    >
      <View
        className={`w-5 h-5 rounded-full bg-white ${value ? 'ml-auto' : ''}`}
      />
    </TouchableOpacity>
  );
}