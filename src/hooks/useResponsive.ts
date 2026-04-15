import { useWindowDimensions, Platform } from "react-native";

const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
};

export function useResponsive() {
  const { width } = useWindowDimensions();

  const isLargeScreen = width >= BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.desktop;

  // For web, also check platform
  const isWeb = Platform.OS === "web";

  return {
    width,
    isLargeScreen,
    isDesktop,
    isMobile: !isLargeScreen,
    isWeb,
    shouldUseSideNav: isLargeScreen,
  };
}