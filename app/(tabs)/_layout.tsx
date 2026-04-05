import { HapticTab } from "@/components/haptic-tab";
import { hexToRgba, tintedSurface, useAccentColor } from "@/store/appearance";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const accentColor = useAccentColor();
  const tabBarBg = tintedSurface(accentColor);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          position: "absolute",
          bottom: bottomInset + 16,
          marginHorizontal: 24,
          backgroundColor: tabBarBg,
          borderTopWidth: 0,
          borderRadius: 28,
          height: 62,
          paddingBottom: 0,
          paddingTop: 0,
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
            },
            android: {
              elevation: 20,
            },
          }),
        },
        tabBarShowLabel: false,
        tabBarItemStyle: {
          borderRadius: 22,
          overflow: "hidden",
          marginHorizontal: 6,
          marginVertical: 8,
        },
        tabBarActiveBackgroundColor: hexToRgba(accentColor, 0.2),
        tabBarActiveTintColor: accentColor,
        tabBarInactiveTintColor: "#4B5563",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="browser"
        options={{
          title: "Browser",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="globe-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="swap"
        options={{
          title: "Swap",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="swap-vertical-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Settings is accessible via the main screen header */}
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
      {/* Merchant is accessible via Settings — hidden from the tab bar */}
      <Tabs.Screen
        name="merchant"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
