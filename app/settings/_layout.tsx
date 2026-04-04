import { Stack } from "expo-router";

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0F1512" },
      }}
    >
      <Stack.Screen name="accounts" />
      <Stack.Screen name="account" />
      <Stack.Screen name="contacts" />
      <Stack.Screen name="networks" />
      <Stack.Screen name="zap-contract" />
    </Stack>
  );
}
