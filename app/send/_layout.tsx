import { Stack } from "expo-router";

export default function SendLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          presentation: "transparentModal",
          animation: "none",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </Stack>
  );
}
