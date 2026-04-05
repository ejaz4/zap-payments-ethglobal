import { Button, Input } from "@/components/ui";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { WalletService } from "@/services/wallet";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import { useWalletStore } from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ImportType = "mnemonic" | "privateKey";

export default function ImportWalletScreen() {
  const accentColor = useAccentColor();
  const scheme = useColorScheme() ?? "dark";
  const isLight = scheme === "light";
  const bg = tintedBackground("#000000");
  const textPrimary = isLight ? "#11181C" : "#FFFFFF";
  const textMuted = isLight ? "#64748B" : "#9CA3AF";
  const tabBg = isLight ? "#FFFFFF" : "#1E2E29";
  const activeTabBg = isLight ? "#EAF2EE" : "#374151";
  const warningBg = isLight ? "#FFFFFF" : "#1E2E29";
  const warningText = isLight ? "#334155" : "#D1D5DB";
  const router = useRouter();
  const accounts = useWalletStore((s) => s.accounts);
  const setIsAddingAccount = useWalletStore((s) => s.setIsAddingAccount);
  const [importType, setImportType] = useState<ImportType>(
    accounts.length > 0 ? "privateKey" : "mnemonic",
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user already has a wallet (adding account mode)
  const isAddingAccount = accounts.length > 0;

  const handleImport = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const trimmedInput = input.trim();

      if (importType === "mnemonic") {
        if (!WalletService.isValidMnemonic(trimmedInput)) {
          setError("Invalid recovery phrase. Please check and try again.");
          return;
        }

        const address = await WalletService.importFromMnemonic(trimmedInput);
        if (address) {
          setIsAddingAccount(false);
          router.replace("/(tabs)" as any);
        } else {
          setError("Failed to import wallet");
        }
      } else {
        if (!WalletService.isValidPrivateKey(trimmedInput)) {
          setError("Invalid private key. Please check and try again.");
          return;
        }

        const address =
          await WalletService.importAccountFromPrivateKey(trimmedInput);
        if (address) {
          setIsAddingAccount(false);
          if (isAddingAccount) {
            router.back(); // Go back to accounts screen
          } else {
            router.replace("/(tabs)" as any);
          }
        } else {
          setError("Failed to import account");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}> 
          {isAddingAccount ? "Import Account" : "Import Wallet"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: textPrimary }]}> 
          {isAddingAccount ? "Import Account" : "Import Existing Wallet"}
        </Text>
        <Text style={[styles.description, { color: textMuted }]}> 
          {isAddingAccount
            ? "Enter a private key to import an existing account to your wallet."
            : "Enter your recovery phrase or private key to import your wallet."}
        </Text>

        {!isAddingAccount && (
          <View style={[styles.tabs, { backgroundColor: tabBg }]}> 
            <TouchableOpacity
              style={[
                styles.tab,
                importType === "mnemonic" && styles.activeTab,
                importType === "mnemonic" && { backgroundColor: activeTabBg },
              ]}
              onPress={() => {
                setImportType("mnemonic");
                setInput("");
                setError(null);
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  importType === "mnemonic" && styles.activeTabText,
                  { color: importType === "mnemonic" ? textPrimary : textMuted },
                ]}
              >
                Recovery Phrase
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                importType === "privateKey" && styles.activeTab,
                importType === "privateKey" && { backgroundColor: activeTabBg },
              ]}
              onPress={() => {
                setImportType("privateKey");
                setInput("");
                setError(null);
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  importType === "privateKey" && styles.activeTabText,
                  { color: importType === "privateKey" ? textPrimary : textMuted },
                ]}
              >
                Private Key
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {importType === "mnemonic" ? (
          <Input
            label="Recovery Phrase"
            placeholder="Enter your 12 or 24 word recovery phrase"
            value={input}
            onChangeText={setInput}
            multiline
            numberOfLines={4}
            autoCapitalize="none"
            autoCorrect={false}
            error={error || undefined}
            style={styles.textArea}
          />
        ) : (
          <Input
            label="Private Key"
            placeholder="Enter your private key (with or without 0x prefix)"
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            autoCorrect={false}
            isPassword
            error={error || undefined}
          />
        )}

        <View
          style={[
            styles.warningBox,
            {
              backgroundColor: warningBg,
              borderWidth: isLight ? 1 : 0,
              borderColor: isLight ? "#DCE8E2" : "transparent",
            },
          ]}
        >
          <Ionicons name="lock-closed-outline" size={24} color={accentColor} />
          <Text style={[styles.warningText, { color: warningText }]}> 
            {isAddingAccount
              ? "Your private key is encrypted and stored securely on your device. It is never sent to any server."
              : "Your recovery phrase and private key are encrypted and stored securely on your device. They are never sent to any server."}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isAddingAccount ? "Import Account" : "Import Wallet"}
          onPress={handleImport}
          loading={isLoading}
          disabled={!input.trim()}
        />
      </View>
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
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: "#9CA3AF",
    lineHeight: 24,
    marginBottom: 24,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: "#374151",
  },
  tabText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "600",
  },
  activeTabText: {
    color: "#FFFFFF",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginTop: 16,
  },
  warningText: {
    flex: 1,
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    padding: 24,
  },
});
