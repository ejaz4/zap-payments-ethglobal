import { Stack } from "expo-router";
import { useAccentColor, tintedBackground } from "@/store/appearance";

export default function OnboardingLayout() {
  const accentColor = useAccentColor();
  const bg = tintedBackground(accentColor);

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
