import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "./shim";

import { NfcProvider } from "@/app/nfc/context";
import {
    tintedBackground,
    tintedSurface,
    useAccentColor,
} from "@/store/appearance";

import { dynamicClient } from "@/crypto/dynamic/client";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { SecureStorage } from "@/services/storage";
import { WalletService } from "@/services/wallet";
import { useWalletStore } from "@/store/wallet";

function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const status = useWalletStore((s) => s.status);
  const accounts = useWalletStore((s) => s.accounts);
  const isAddingAccount = useWalletStore((s) => s.isAddingAccount);

  useEffect(() => {
    const inOnboarding = segments[0] === "onboarding";
    const hasAccounts = accounts.length > 0;

    if (!hasAccounts && !inOnboarding) {
      // No wallet, redirect to onboarding
      router.replace("/onboarding/welcome");
    } else if (hasAccounts && inOnboarding && !isAddingAccount) {
      // Has wallet and not intentionally adding account, redirect to main app
      router.replace("/(tabs)");
    }
  }, [status, accounts, segments, isAddingAccount]);
}

function RootLayoutNav() {
  useProtectedRoute();
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bg },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen
        name="send"
        options={{
          presentation: "transparentModal",
          animation: "none",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen
        name="receive"
        options={{
          presentation: "transparentModal",
          animation: "none",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const setStatus = useWalletStore((s) => s.setStatus);
  const accentColor = useAccentColor();
  const colorScheme = useColorScheme() ?? "dark";
  const bg = tintedBackground("#000000");
  const surface = tintedSurface(accentColor);

  const baseTheme = colorScheme === "light" ? DefaultTheme : DarkTheme;

  const theme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: bg,
      card: surface,
      text: colorScheme === "light" ? "#11181C" : "#FFFFFF",
      border: colorScheme === "light" ? "#D7E0DB" : "#374151",
      primary: accentColor,
    },
  };

  useEffect(() => {
    async function init() {
      try {
        // Check if wallet is initialized
        const isInitialized = await SecureStorage.isWalletInitialized();

        if (isInitialized) {
          await WalletService.initializeWallet();
        } else {
          setStatus("uninitialized");
        }
      } catch (error) {
        console.error("Failed to initialize:", error);
        setStatus("uninitialized");
      } finally {
        setIsReady(true);
      }
    }

    init();
  }, []);

  if (!isReady) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {/* Dynamic SDK WebView — required for auth flows and embedded wallet signing */}
      <dynamicClient.reactNative.WebView />
      <NfcProvider>
        <ThemeProvider value={theme}>
          <RootLayoutNav />
          <StatusBar style={colorScheme === "light" ? "dark" : "light"} />
        </ThemeProvider>
      </NfcProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0F1512",
    alignItems: "center",
    justifyContent: "center",
  },
});
