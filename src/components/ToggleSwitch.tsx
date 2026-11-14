import { View, TouchableOpacity, Platform, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from "react-native-reanimated";
import { useEffect } from "react";
import { useTheme } from "./ThemeProvider";

const TOGGLE_WIDTH = 48;
const TOGGLE_HEIGHT = 28;
const THUMB_SIZE = 20;
const PADDING = 4;

type ToggleSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
};

export function ToggleSwitch({
  value,
  onValueChange,
  accessibilityLabel,
}: ToggleSwitchProps) {
  const { isDark } = useTheme();

  const thumbPosition = useSharedValue(value ? 1 : 0);
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    thumbPosition.value = withSpring(value ? 1 : 0, {
      damping: 15,
      stiffness: 200,
      mass: 0.5,
    });
    progress.value = withSpring(value ? 1 : 0, {
      damping: 20,
      stiffness: 300,
    });
  }, [value, thumbPosition, progress]);

  const animatedThumbStyle = useAnimatedStyle(() => {
    const translateX = thumbPosition.value * (TOGGLE_WIDTH - THUMB_SIZE - PADDING * 2);
    return {
      transform: [{ translateX }],
    };
  });

  const animatedTrackStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [isDark ? "#4B5563" : "#D1D5DB", "#FFB800"]
    );
    return {
      backgroundColor,
    };
  });

  // Web-specific styles using CSS transitions
  const webTrackStyle = {
    backgroundColor: value ? "#FFB800" : isDark ? "#4B5563" : "#D1D5DB",
  };

  const webThumbStyle = {
    transform: [{ translateX: value ? (TOGGLE_WIDTH - THUMB_SIZE - PADDING * 2) : 0 }],
  };

  const touchableProps = {
    style: styles.container,
    onPress: () => onValueChange(!value),
    activeOpacity: 0.8,
    accessibilityRole: "switch" as const,
    accessibilityState: { checked: value },
    accessibilityLabel,
  };

  if (Platform.OS === "web") {
    return (
      <TouchableOpacity {...touchableProps}>
        <View style={[styles.track, styles.trackWeb, webTrackStyle]}>
          <View style={[styles.thumb, styles.thumbWeb, webThumbStyle]} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity {...touchableProps}>
      <Animated.View style={[styles.track, animatedTrackStyle]}>
        <Animated.View style={[styles.thumb, animatedThumbStyle]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: TOGGLE_WIDTH,
    height: TOGGLE_HEIGHT,
    borderRadius: TOGGLE_HEIGHT / 2,
    padding: PADDING,
  },
  track: {
    width: TOGGLE_WIDTH,
    height: TOGGLE_HEIGHT,
    borderRadius: TOGGLE_HEIGHT / 2,
    padding: PADDING,
  },
  trackWeb: {
    transitionProperty: "background-color",
    transitionDuration: "200ms",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "white",
  },
  thumbWeb: {
    transitionProperty: "transform",
    transitionDuration: "200ms",
  },
});