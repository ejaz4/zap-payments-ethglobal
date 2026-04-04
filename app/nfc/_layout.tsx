import { Stack } from "expo-router";

export default function NfcLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_bottom",
        presentation: "modal",
      }}
    >
      <Stack.Screen name="scan" />
      <Stack.Screen name="payment" />
    </Stack>
  );
}
