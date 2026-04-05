import { tintedBackground, useAccentColor } from "@/store/appearance";
import { Stack } from "expo-router";

export default function MerchantLayout() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: bg } }}>
      <Stack.Screen name="checkout" />
    </Stack>
  );
}
