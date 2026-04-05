import { tintedBackground, useAccentColor } from "@/store/appearance";
import {
    SUPPORTED_CURRENCIES,
    useCurrencyStore,
    useSelectedCurrency,
} from "@/store/currency";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CurrencySettingsScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const router = useRouter();
  const selectedCurrency = useSelectedCurrency();
  const setCurrency = useCurrencyStore((s) => s.setCurrency);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Display Currency</Text>
      </View>

      <FlatList
        data={SUPPORTED_CURRENCIES}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isSelected = item.code === selectedCurrency;
          return (
            <TouchableOpacity
              style={[styles.row, isSelected && styles.rowSelected]}
              onPress={() => { setCurrency(item.code); router.back(); }}
            >
              <Text style={styles.flag}>{item.flag}</Text>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowCode}>{item.code.toUpperCase()} · {item.symbol}</Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F1512" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
    gap: 12,
  },
  backButton: { padding: 2 },
  headerTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  rowSelected: { borderColor: "#10B981" },
  flag: { fontSize: 26 },
  rowInfo: { flex: 1 },
  rowName: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  rowCode: { color: "#6B7280", fontSize: 13, marginTop: 2 },
});
