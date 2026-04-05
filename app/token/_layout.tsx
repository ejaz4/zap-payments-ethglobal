import { Stack } from "expo-router";
import { useAccentColor, tintedBackground } from "@/store/appearance";

export default function TokenLayout() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bg },
      }}
    >
      <Stack.Screen name="[address]" />
    </Stack>
  );
}
