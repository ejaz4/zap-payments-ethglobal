import { Stack } from "expo-router";

export default function AccountLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0F1512" },
      }}
    >
      <Stack.Screen name="[address]" />
    </Stack>
  );
}
