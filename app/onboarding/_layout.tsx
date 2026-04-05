import { tintedBackground, useAccentColor } from "@/store/appearance";
import { Stack } from "expo-router";

export default function OnboardingLayout() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bg },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="create" />
      <Stack.Screen name="import" />
    </Stack>
  );
}
