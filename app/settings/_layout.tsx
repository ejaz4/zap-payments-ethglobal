import { tintedBackground, useAccentColor } from "@/store/appearance";
import { Stack } from "expo-router";

export default function SettingsLayout() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bg },
      }}
    >
      <Stack.Screen name="accounts" />
      <Stack.Screen name="account" />
      <Stack.Screen name="contacts" />
      <Stack.Screen name="ens" />
      <Stack.Screen name="networks" />
      <Stack.Screen name="zap-contract" />
      <Stack.Screen name="api" />
      <Stack.Screen name="currency" />
      <Stack.Screen name="appearance" />
    </Stack>
  );
}
