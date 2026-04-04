import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "./shim";

import { NfcProvider } from "@/app/nfc/context";
import { SecureStorage } from "@/services/storage";
import { WalletService } from "@/services/wallet";
import { useWalletStore } from "@/store/wallet";

// Custom dark theme matching our design
const customDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#0F1512",
    card: "#1E2E29",
    text: "#FFFFFF",
    border: "#374151",
    primary: "#569F8C",
  },
};

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

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0F1512" },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen
        name="send"
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="receive"
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const setStatus = useWalletStore((s) => s.setStatus);

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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#569F8C" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NfcProvider>
        <ThemeProvider value={customDarkTheme}>
          <RootLayoutNav />
          <StatusBar style="light" />
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
