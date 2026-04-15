import { View, StyleSheet } from "react-native";
import { useResponsive } from "../hooks/useResponsive";
import { SideNav } from "./SideNav";
import { ReactNode } from "react";

interface ResponsiveLayoutProps {
  children: ReactNode;
  activeTab?: string;
}

export function ResponsiveLayout({ children, activeTab }: ResponsiveLayoutProps) {
  const { shouldUseSideNav } = useResponsive();

  if (!shouldUseSideNav) {
    // On small screens, just render children (tabs will show at bottom)
    return <>{children}</>;
  }

  // On large screens, show side nav with content
  return (
    <View style={styles.container}>
      <SideNav activeTab={activeTab} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
  },
  content: {
    flex: 1,
  },
});