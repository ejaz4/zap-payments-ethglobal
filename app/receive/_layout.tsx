import { Stack } from "expo-router";

export default function ReceiveLayout() {
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
      <Stack.Screen name="show-address" />
      <Stack.Screen name="merchant-receive" />
      <Stack.Screen
        name="request"
        options={{
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
  );
}
