import { useAccentColor, tintedBackground } from "@/store/appearance";
import { useProviderStore } from "@/store/provider";
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
  const bg = tintedBackground(accentColor);
  const router = useRouter();
  const storedUrl = useProviderStore((s) => s.apiBaseUrl);
  const setApiBaseUrl = useProviderStore((s) => s.setApiBaseUrl);
  const fetchApiNetworks = useProviderStore((s) => s.fetchApiNetworks);

  const [url, setUrl] = useState(storedUrl);

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
    router.back();
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
});
