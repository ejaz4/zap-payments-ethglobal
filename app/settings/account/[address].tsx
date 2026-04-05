import { ChainId, DEFAULT_NETWORKS } from "@/app/profiles/client";
import { Input } from "@/components/ui";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useENSName } from "@/hooks/use-ens";
import { WalletService } from "@/services/wallet";
import { tintedBackground, useAccentColor } from "@/store/appearance";
import {
  CARD_BACKGROUNDS,
  CardBackground,
  useWalletStore,
} from "@/store/wallet";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  ImageSourcePropType,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Card background images
const CARD_BACKGROUND_IMAGES: Record<CardBackground, ImageSourcePropType> = {
  "card-background-1": require("@/assets/images/backgrounds/card-background-1.png"),
  "card-background-2": require("@/assets/images/backgrounds/card-background-2.png"),
    "card-background-3": require("@/assets/images/backgrounds/card-background-3.png"),
    "card-background-4": require("@/assets/images/backgrounds/card-background-4.png"),
        "card-background-5": require("@/assets/images/backgrounds/card-background-5.png"),
        "card-background-6": require("@/assets/images/backgrounds/card-background-6.png"),

};

// Background display names
const CARD_BACKGROUND_NAMES: Record<CardBackground, string> = {
  "card-background-1": "Gradient Blue",
  "card-background-2": "Gradient Purple",
  "card-background-3": "Aqua",
  "card-background-4": "Cola",
  "card-background-5": "Vimto",
  "card-background-6": "Peony",
};

export default function AccountDetailScreen() {
  const accentColor = useAccentColor();
  const colorScheme = useColorScheme() ?? "dark";
  const isLight = colorScheme === "light";
  const bg = tintedBackground(accentColor);
  const textPrimary = isLight ? "#11181C" : "#FFFFFF";
  const textMuted = isLight ? "#64748B" : "#6B7280";
  const textSection = isLight ? "#475569" : "#9CA3AF";
  const cardBg = isLight ? "#FFFFFF" : "#1E2E29";
  const cardBorder = isLight ? "#DCE8E2" : "transparent";
  const subtleBg = isLight ? "#EEF4F1" : "#1A1A1A";
  const router = useRouter();
  const { address } = useLocalSearchParams<{ address: string }>();

  const accounts = useWalletStore((s) => s.accounts);
  const selectedIndex = useWalletStore((s) => s.selectedAccountIndex);
  const updateAccountName = useWalletStore((s) => s.updateAccountName);
  const updateAccountBackground = useWalletStore(
    (s) => s.updateAccountBackground,
  );
  const updateAccountAutoPayLimit = useWalletStore(
    (s) => s.updateAccountAutoPayLimit,
  );
  const removeAccount = useWalletStore((s) => s.removeAccount);
  const setSelectedAccountIndex = useWalletStore(
    (s) => s.setSelectedAccountIndex,
  );
  const selectedChainId = useWalletStore((s) => s.selectedChainId);

  const account = accounts.find((a) => a.address === address);
  const accountIndex = accounts.findIndex((a) => a.address === address);

  const [name, setName] = useState(account?.name || "");
  const [hasChanges, setHasChanges] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [isLoadingKey, setIsLoadingKey] = useState(false);

  // All Solana wallets are created via the Dynamic API — accountType is the source of truth
  const isDynamic = account?.accountType === "solana";

  const autoPayEnabled = !!account?.autoPayLimit;
  const [autoPayLimitInput, setAutoPayLimitInput] = useState(
    account?.autoPayLimit || "",
  );

  const nativeSymbol =
    DEFAULT_NETWORKS[selectedChainId]?.nativeCurrency.symbol || "ETH";

  const ensName = useENSName(account?.address, selectedChainId as ChainId);

  if (!account) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>Account Not Found</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: textMuted }]}>Account not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentBackground =
    account.cardBackground ||
    CARD_BACKGROUNDS[account.index % CARD_BACKGROUNDS.length];

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  };

  const handleNameChange = (newName: string) => {
    setName(newName);
    setHasChanges(newName !== account.name);
  };

  const handleSaveName = () => {
    if (name.trim() && name !== account.name) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      updateAccountName(account.address, name.trim());
      setHasChanges(false);
    }
  };

  const handleSelectBackground = (background: CardBackground) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateAccountBackground(account.address, background);
  };

  const handleAutoPayToggle = (enabled: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!enabled) {
      updateAccountAutoPayLimit(account.address, undefined);
      setAutoPayLimitInput("");
    } else {
      // Enable with a default of 0 — user must enter a real limit to activate
      const defaultLimit = "0.01";
      setAutoPayLimitInput(defaultLimit);
      updateAccountAutoPayLimit(account.address, defaultLimit);
    }
  };

  const handleAutoPayLimitSave = () => {
    const num = parseFloat(autoPayLimitInput);
    if (isNaN(num) || num <= 0) {
      Alert.alert(
        "Invalid Limit",
        "Please enter a positive number for the auto-pay limit.",
      );
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateAccountAutoPayLimit(account.address, autoPayLimitInput);
  };

  const handleExportPrivateKey = () => {
    if (revealedKey) {
      // Already revealed — hide it
      setRevealedKey(null);
      return;
    }

    Alert.alert(
      "Export Private Key",
      "Your private key gives full access to this account's funds. Never share it with anyone.\n\nAre you sure you want to reveal it?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reveal",
          style: "destructive",
          onPress: async () => {
            setIsLoadingKey(true);
            try {
              const pk = await WalletService.exportPrivateKey(account.address);
              if (!pk) {
                Alert.alert(
                  "Not Available",
                  isDynamic
                    ? "This wallet is managed by Dynamic custody. The private key is not stored locally."
                    : "Private key not found for this account.",
                );
                return;
              }
              setRevealedKey(pk);
            } catch (error) {
              Alert.alert("Error", "Failed to load private key.");
            } finally {
              setIsLoadingKey(false);
            }
          },
        },
      ],
    );
  };

  const handleCopyPrivateKey = async () => {
    if (!revealedKey) return;
    await Clipboard.setStringAsync(revealedKey);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", "Private key copied to clipboard. Be careful where you paste it.");
  };

  const handleDeleteAccount = () => {
    if (accounts.length <= 1) {
      Alert.alert(
        "Cannot Delete",
        "You must have at least one account in your wallet.",
      );
      return;
    }

    Alert.alert(
      "Delete Account",
      `Are you sure you want to remove "${account.name}" from your wallet?\n\nThis will only remove the account from this app. Your funds will remain safe and you can re-import the account later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

            // If deleting the selected account, switch to first account
            if (accountIndex === selectedIndex) {
              setSelectedAccountIndex(0);
            } else if (accountIndex < selectedIndex) {
              // Adjust selected index if deleting an account before it
              setSelectedAccountIndex(selectedIndex - 1);
            }

            removeAccount(account.address);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Account Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Account Preview */}
        <View style={styles.previewSection}>
          <View style={styles.accountIcon}>
            <Ionicons
              name={account.isImported ? "key-outline" : "wallet-outline"}
              size={32}
              color={textPrimary}
            />
          </View>
          <Text style={[styles.previewName, { color: textPrimary }]}>{name || account.name}</Text>
          {ensName && (
            <Text style={[styles.previewEns, { color: accentColor }]}>{ensName}</Text>
          )}
          <Text style={[styles.previewAddress, { color: textMuted }]}>
            {formatAddress(account.address)}
          </Text>
          {account.isImported && (
            <View style={styles.importedBadge}>
              <Ionicons name="key" size={12} color="#F59E0B" />
              <Text style={styles.importedText}>Imported</Text>
            </View>
          )}
        </View>

        {/* Account Name */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textSection }]}>Account Name</Text>
          <View style={styles.nameInputRow}>
            <View style={styles.nameInputWrapper}>
              <Input
                placeholder="Account name"
                value={name}
                onChangeText={handleNameChange}
              />
            </View>
            {hasChanges && (
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveName}
              >
                <Ionicons name="checkmark" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Card Background */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textSection }]}>Card Background</Text>
          <View style={styles.backgroundGrid}>
            {CARD_BACKGROUNDS.map((bg) => (
              <TouchableOpacity
                key={bg}
                style={[
                  styles.backgroundOption,
                  currentBackground === bg && styles.backgroundSelected,
                ]}
                onPress={() => handleSelectBackground(bg)}
              >
                <Image
                  source={CARD_BACKGROUND_IMAGES[bg]}
                  style={styles.backgroundPreview}
                />
                <Text style={styles.backgroundName}>
                  {CARD_BACKGROUND_NAMES[bg]}
                </Text>
                {currentBackground === bg && (
                  <View style={styles.selectedCheck}>
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color="#10B981"
                    />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Auto-Pay */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textSection }]}>Auto-Pay (NFC)</Text>
          <View
            style={[
              styles.autoPayRow,
              {
                backgroundColor: cardBg,
                borderWidth: isLight ? 1 : 0,
                borderColor: cardBorder,
              },
            ]}
          >
            <View style={styles.autoPayInfo}>
              <Text style={[styles.autoPayLabel, { color: textPrimary }]}>Enable Auto-Pay</Text>
              <Text style={[styles.autoPayHint, { color: textMuted }]}>
                Automatically pay NFC requests below the limit without confirmation
              </Text>
            </View>
            <Switch
              value={autoPayEnabled}
              onValueChange={handleAutoPayToggle}
              trackColor={{ false: "#374151", true: accentColor }}
              thumbColor="#FFFFFF"
            />
          </View>

          {autoPayEnabled && (
            <View style={styles.limitRow}>
              <View style={styles.limitInputWrapper}>
                <Input
                  placeholder="0.01"
                  value={autoPayLimitInput}
                  onChangeText={setAutoPayLimitInput}
                  keyboardType="decimal-pad"
                />
              </View>
              <View
                style={[
                  styles.limitSymbolBadge,
                  {
                    backgroundColor: cardBg,
                    borderWidth: isLight ? 1 : 0,
                    borderColor: cardBorder,
                  },
                ]}
              >
                <Text style={[styles.limitSymbol, { color: textSection }]}>{nativeSymbol}</Text>
              </View>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAutoPayLimitSave}
              >
                <Ionicons name="checkmark" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Export Private Key — only for wallets with a local key */}
        {!isDynamic && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textSection }]}>Private Key</Text>
            <TouchableOpacity
              style={[
                styles.exportKeyButton,
                {
                  backgroundColor: cardBg,
                  borderColor: isLight ? "#F59E0B66" : "#F59E0B40",
                },
              ]}
              onPress={handleExportPrivateKey}
              disabled={isLoadingKey}
            >
              <Ionicons
                name={revealedKey ? "eye-off-outline" : "key-outline"}
                size={20}
                color="#F59E0B"
              />
              <Text style={styles.exportKeyButtonText}>
                {isLoadingKey
                  ? "Loading..."
                  : revealedKey
                    ? "Hide Private Key"
                    : "Export Private Key"}
              </Text>
            </TouchableOpacity>

            {revealedKey && (
              <View
                style={[
                  styles.keyContainer,
                  {
                    backgroundColor: subtleBg,
                    borderColor: isLight ? "#F59E0B66" : "#F59E0B30",
                  },
                ]}
              >
                <Text style={[styles.keyText, { color: isLight ? "#1F2937" : "#E5E7EB" }]} selectable>
                  {revealedKey}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.copyKeyButton,
                    {
                      backgroundColor: isLight ? "#FFFFFF" : "#1E2E29",
                      borderWidth: isLight ? 1 : 0,
                      borderColor: isLight ? cardBorder : "transparent",
                    },
                  ]}
                  onPress={handleCopyPrivateKey}
                >
                  <Ionicons name="copy-outline" size={16} color={accentColor} />
                  <Text style={[styles.copyKeyText, { color: accentColor }]}>Copy</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={[styles.exportKeyHint, { color: textMuted }]}> 
              Never share your private key. Anyone with this key has full control of your funds.
            </Text>
          </View>
        )}

        {isDynamic && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textSection }]}>Wallet Custody</Text>
            <View
              style={[
                styles.dynamicBadgeRow,
                {
                  backgroundColor: cardBg,
                  borderColor: isLight ? "#C9B3F4" : "#9945FF30",
                },
              ]}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color="#9945FF" />
              <Text style={[styles.dynamicBadgeText, { color: isLight ? "#334155" : "#D1D5DB" }]}>
                Managed by Dynamic custody. Private key is not stored locally.
              </Text>
            </View>
          </View>
        )}

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>
            Danger Zone
          </Text>
          <TouchableOpacity
            style={[
              styles.deleteButton,
              {
                backgroundColor: cardBg,
                borderColor: "#EF4444",
              },
            ]}
            onPress={handleDeleteAccount}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={styles.deleteButtonText}>Remove Account</Text>
          </TouchableOpacity>
          <Text style={[styles.deleteHint, { color: textMuted }]}>
            This will only remove the account from this app. Your funds are safe
            and you can re-import the account at any time.
          </Text>
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
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 16,
  },
  previewSection: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 16,
  },
  accountIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  previewName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  previewAddress: {
    color: "#6B7280",
    fontSize: 14,
    fontFamily: "monospace",
  },
  previewEns: {
    color: "#569F8C",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  importedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#422006",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 12,
    gap: 6,
  },
  importedText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  nameInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nameInputWrapper: {
    flex: 1,
  },
  saveButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  backgroundOption: {
    width: "48%",
    aspectRatio: 1.6,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "transparent",
  },
  backgroundSelected: {
    borderColor: "#10B981",
  },
  backgroundPreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  backgroundName: {
    position: "absolute",
    bottom: 8,
    left: 8,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  selectedCheck: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  dangerTitle: {
    color: "#EF4444",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EF4444",
    gap: 8,
  },
  deleteButtonText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
  },
  deleteHint: {
    color: "#6B7280",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
  },
  autoPayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E2E29",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  autoPayInfo: {
    flex: 1,
    gap: 4,
  },
  autoPayLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  autoPayHint: {
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 18,
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  limitInputWrapper: {
    flex: 1,
  },
  limitSymbolBadge: {
    backgroundColor: "#1E2E29",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  limitSymbol: {
    color: "#9CA3AF",
    fontSize: 16,
    fontWeight: "600",
  },
  exportKeyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F59E0B40",
    gap: 8,
  },
  exportKeyButtonText: {
    color: "#F59E0B",
    fontSize: 16,
    fontWeight: "600",
  },
  keyContainer: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#F59E0B30",
  },
  keyText: {
    color: "#E5E7EB",
    fontSize: 13,
    fontFamily: "monospace",
    lineHeight: 20,
    marginBottom: 12,
  },
  copyKeyButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#1E2E29",
    borderRadius: 8,
  },
  copyKeyText: {
    color: "#569F8C",
    fontSize: 14,
    fontWeight: "500",
  },
  exportKeyHint: {
    color: "#6B7280",
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
  },
  dynamicBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E2E29",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "#9945FF30",
  },
  dynamicBadgeText: {
    flex: 1,
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 20,
  },
});
