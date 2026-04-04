import { Stack } from "expo-router";

export default function ZapContractLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0F1512" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="deploy" />
    </Stack>
  );
}
