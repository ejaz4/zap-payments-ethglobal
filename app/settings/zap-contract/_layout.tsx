import { tintedBackground, useAccentColor } from "@/store/appearance";
import { Stack } from "expo-router";

export default function ZapContractLayout() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="deploy" />
    </Stack>
  );
}
