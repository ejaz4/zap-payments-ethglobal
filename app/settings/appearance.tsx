import {
  ACCENT_PRESETS,
  hexToRgba,
  tintedBackground,
  useAppearanceStore,
} from "@/store/appearance";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { CheckIcon } from "lucide-react-native";
import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AppearanceScreen() {
  const router = useRouter();
  const accentColor = useAppearanceStore((s) => s.accentColor);
  const setAccentColor = useAppearanceStore((s) => s.setAccentColor);
  const bg = tintedBackground(accentColor);
  const [customHex, setCustomHex] = useState(accentColor);

  const handleCustomSubmit = () => {
    const hex = customHex.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setAccentColor(hex);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Appearance</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 78 }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Accent Colour</Text>

          {/* Preview */}
          <View style={[styles.preview, { backgroundColor: hexToRgba(accentColor, 0.15) }]}>
            <View style={[styles.previewDot, { backgroundColor: accentColor }]} />
            <Text style={[styles.previewText, { color: accentColor }]}>
              {accentColor.toUpperCase()}
            </Text>
          </View>

          {/* Preset grid */}
          <View style={styles.grid}>
            {ACCENT_PRESETS.map((preset) => {
              const selected = accentColor === preset.color;
              return (
                <TouchableOpacity
                  key={preset.color}
                  style={[
                    styles.swatch,
                    { backgroundColor: preset.color },
                    selected && styles.swatchSelected,
                  ]}
                  onPress={() => {
                    setAccentColor(preset.color);
                    setCustomHex(preset.color);
                  }}
                >
                  {selected && <CheckIcon size={20} color="#FFFFFF" />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Preset labels */}
          <View style={styles.grid}>
            {ACCENT_PRESETS.map((preset) => (
              <View key={preset.color} style={styles.swatchLabelWrap}>
                <Text
                  style={[
                    styles.swatchLabel,
                    accentColor === preset.color && { color: "#FFFFFF" },
                  ]}
                >
                  {preset.name}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Custom hex */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Custom Hex</Text>
          <View style={styles.customRow}>
            <View
              style={[
                styles.customPreview,
                { backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(customHex) ? customHex : "#333" },
              ]}
            />
            <TextInput
              style={styles.customInput}
              value={customHex}
              onChangeText={setCustomHex}
              onSubmitEditing={handleCustomSubmit}
              placeholder="#569F8C"
              placeholderTextColor="#4B5563"
              autoCapitalize="characters"
              maxLength={7}
            />
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: accentColor }]}
              onPress={handleCustomSubmit}
            >
              <Text style={styles.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1512",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  previewDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  previewText: {
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 8,
  },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  swatchLabelWrap: {
    width: 56,
    alignItems: "center",
  },
  swatchLabel: {
    color: "#6B7280",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    gap: 12,
  },
  customPreview: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  customInput: {
    flex: 1,
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  applyButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  applyText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
