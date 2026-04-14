import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MoreScreen() {
  return (
    <SafeAreaView className="flex-1 bg-cheddar-light">
      <View className="flex-1 items-center justify-center">
        <Text className="text-2xl font-semibold text-cheddar-gray">
          Coming soon
        </Text>
      </View>
    </SafeAreaView>
  );
}
