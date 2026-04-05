import { SLIPPAGE_PRESETS } from "@/config/uniswap";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useProviderStore } from "@/store/provider";
import { useUniswapStore } from "@/store/uniswap";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ApiSettingsScreen() {
  const accentColor = useAccentColor();
  const bg = tintedBackground("#000000");
  const router = useRouter();
  const storedUrl = useProviderStore((s) => s.apiBaseUrl);
  const setApiBaseUrl = useProviderStore((s) => s.setApiBaseUrl);
  const fetchApiNetworks = useProviderStore((s) => s.fetchApiNetworks);

  const [url, setUrl] = useState(storedUrl);

  // Uniswap settings
  const uniswapApiKey = useUniswapStore((s) => s.apiKey);
  const setUniswapApiKey = useUniswapStore((s) => s.setApiKey);
  const uniswapSlippage = useUniswapStore((s) => s.slippage);
  const setUniswapSlippage = useUniswapStore((s) => s.setSlippage);
  const [apiKeyInput, setApiKeyInput] = useState(uniswapApiKey);
  const [customSlippage, setCustomSlippage] = useState(
    (SLIPPAGE_PRESETS as readonly number[]).includes(uniswapSlippage) ? "" : String(uniswapSlippage),
  );

  const handleSave = () => {
    const trimmed = url.trim();
    if (trimmed && !trimmed.startsWith("http")) {
      Alert.alert("Invalid URL", "URL must start with http:// or https://");
      return;
    }
    setApiBaseUrl(trimmed);
    if (trimmed) {
      fetchApiNetworks();
    }

    // Save Uniswap settings
    setUniswapApiKey(apiKeyInput.trim());
    const customPct = parseFloat(customSlippage);
    if (customSlippage && !isNaN(customPct)) {
      setUniswapSlippage(customPct);
    }

    router.back();
  };

  const handleSlippagePreset = (pct: number) => {
    setUniswapSlippage(pct);
    setCustomSlippage("");
  };

  const handleCustomSlippage = (val: string) => {
    setCustomSlippage(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0.1 && num <= 50) {
      setUniswapSlippage(num);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>API Settings</Text>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <Text style={styles.label}>API Base URL</Text>
            <Text style={styles.hint}>
              The base URL of your external wallet API (e.g.{" "}
              <Text style={styles.mono}>https://api.example.com</Text>).
              Leave blank to use the <Text style={styles.mono}>EXPO_PUBLIC_API_URL</Text> env variable.
            </Text>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={setUrl}
              placeholder="https://api.example.com"
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>

          {/* ─── Uniswap Trading API ─── */}
          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Uniswap Trading API</Text>
            <Text style={styles.label}>API Key</Text>
            <Text style={styles.hint}>
              Your Uniswap Trading API key. Required for token swaps, merchant
              receive auto-swap, and swap-and-send features.
            </Text>
            <TextInput
              style={styles.input}
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="Enter your Uniswap API key"
              placeholderTextColor="#4B5563"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Default Slippage Tolerance</Text>
            <Text style={styles.hint}>
              Maximum price change allowed during a swap. Higher values increase
              success rate but may result in worse pricing.
            </Text>
            <View style={styles.slippageRow}>
              {SLIPPAGE_PRESETS.map((pct) => (
                <TouchableOpacity
                  key={pct}
                  style={[
                    styles.slippageBtn,
                    uniswapSlippage === pct && !customSlippage && { backgroundColor: accentColor },
                  ]}
                  onPress={() => handleSlippagePreset(pct)}
                >
                  <Text
                    style={[
                      styles.slippageBtnText,
                      uniswapSlippage === pct && !customSlippage && { color: "#FFF" },
                    ]}
                  >
                    {pct}%
                  </Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={[styles.slippageInput, customSlippage ? { borderColor: accentColor } : {}]}
                value={customSlippage}
                onChangeText={handleCustomSlippage}
                placeholder="Custom"
                placeholderTextColor="#4B5563"
                keyboardType="decimal-pad"
              />
            </View>
            {uniswapSlippage >= 10 && (
              <Text style={styles.slippageWarning}>
                High slippage may result in significantly worse swap rates
              </Text>
            )}
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2E29",
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  hint: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#9CA3AF",
  },
  input: {
    backgroundColor: "#1E2E29",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#2D4038",
  },
  saveButton: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#2D4038",
    marginVertical: 8,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  slippageRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  slippageBtn: {
    backgroundColor: "#1E2E29",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  slippageBtnText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "600",
  },
  slippageInput: {
    flex: 1,
    backgroundColor: "#1E2E29",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#2D4038",
    textAlign: "center",
  },
  slippageWarning: {
    color: "#F59E0B",
    fontSize: 12,
    marginTop: 8,
  },
});
